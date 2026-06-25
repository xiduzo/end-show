"""Render a student payload as an ESC/POS receipt.

The whole ticket is composed as a single 1-bit bitmap and sent with one
image command. Cheap 58mm clones (like the NT-1809DD) handle raster data
far more reliably than ESC/POS text styling, and it gives exact control
over typography, QR size and centering.
"""

import textwrap
import time
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from . import config

WIDTH = config.DOTS_PER_LINE
MARGIN = 8
QR_SIZE = 300

# Bundled fonts matching the website typography:
# Montserrat Bold for display/headings, Sometype Mono for body text.
_FONT_DIR = Path(__file__).parent / "fonts"
_FONT_FILES = {
    "display": "Montserrat-Bold.ttf",
    "mono": "SometypeMono-Regular.ttf",
    "mono-bold": "SometypeMono-Bold.ttf",
}


def _font(size: int, style: str = "mono") -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(_FONT_DIR / _FONT_FILES[style], size)
    except OSError:
        return ImageFont.load_default(size=size)


def _fetch_portrait(url: str) -> Image.Image | None:
    try:
        response = httpx.get(url, timeout=10, follow_redirects=True)
        response.raise_for_status()
        return Image.open(BytesIO(response.content))
    except Exception:
        return None


def _atkinson_dither(image: Image.Image) -> Image.Image:
    """1-bit serpentine Atkinson dithering, returned as an L image of pure 0/255.

    Atkinson (the original Mac/HyperCard dither) diffuses only 6/8 of each
    pixel's quantisation error to its neighbours, deliberately dropping the
    other 2/8. On a 1-bit thermal head that keeps highlights clean and edges
    crisp where Floyd-Steinberg (PIL's convert("1") default) smears a face into
    muddy grey noise. Kept on the portrait only; text/QR are thresholded.

    The scan is serpentine (alternating L->R / R->L) instead of always
    left-to-right. A face is mostly large smooth tonal areas (cheeks, forehead);
    a fixed scan direction makes Atkinson's dropped error pile up the same way
    every row, printing as diagonal "worm" streaks across skin. Mirroring every
    other row breaks that correlation so gradients read as even stipple.
    """
    arr = np.asarray(image.convert("L"), dtype=np.float32).copy()
    h, w = arr.shape
    for y in range(h):
        row = arr[y]
        below = arr[y + 1] if y + 1 < h else None
        below2 = arr[y + 2] if y + 2 < h else None
        # serpentine: even rows scan left->right, odd rows right->left, with the
        # forward/back error offsets mirrored to match the travel direction.
        forward = y % 2 == 0
        xs = range(w) if forward else range(w - 1, -1, -1)
        step = 1 if forward else -1
        for x in xs:
            old = row[x]
            new = 255.0 if old >= 128 else 0.0
            row[x] = new
            err = (old - new) / 8.0
            ahead1, ahead2 = x + step, x + 2 * step
            if 0 <= ahead1 < w:
                row[ahead1] += err
            if 0 <= ahead2 < w:
                row[ahead2] += err
            if below is not None:
                if 0 <= x - step < w:
                    below[x - step] += err
                below[x] += err
                if 0 <= ahead1 < w:
                    below[ahead1] += err
            if below2 is not None:
                below2[x] += err
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "L")


def _skin_curve(p: int) -> int:
    """Per-pixel tone map tuned for faces, applied before dithering.

    Two combined moves on the 0..255 ramp:
    * gamma 0.8 lift — a thermal head prints heavy, so without it faces clog to
      a black blob (highlights survive, midtones stay open).
    * a gentle S-curve pivoting at mid-grey — skin tones cluster in the midtones,
      and a flat gamma lift leaves them as one undifferentiated grey mass that
      dithers into a featureless face. The S adds local midtone contrast so the
      modelling (cheekbone, brow, nose shadow) separates, while easing back off
      the extremes so highlights don't blow and shadows don't crush.
    """
    g = 255 * (p / 255) ** 0.8
    # smoothstep-based S around mid-grey; strength kept mild to avoid posterising
    n = g / 255
    s = n * n * (3 - 2 * n)  # smoothstep: pushes <0.5 down, >0.5 up
    out = g + (s * 255 - g) * 0.35
    return round(min(255, max(0, out)))


_SKIN_LUT = [_skin_curve(p) for p in range(256)]


def _prepare_portrait(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    image = image.convert("L")
    height = round(image.height * WIDTH / image.width)
    image = image.resize((WIDTH, height), Image.LANCZOS)
    # stretch the tonal range, then a face-tuned tone curve (lift + midtone S).
    image = ImageOps.autocontrast(image, cutoff=2)
    image = image.point(_SKIN_LUT)
    # recover edge detail lost to the downscale before it's crushed to 1-bit.
    # threshold=3 so the unsharp lifts real features (eyes, hairline) without
    # also amplifying flat-skin sensor noise into dither speckle.
    image = image.filter(ImageFilter.UnsharpMask(radius=1.5, percent=110, threshold=3))
    return _atkinson_dither(image)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines():
        if not paragraph.strip():
            lines.append("")
            continue
        # start generous, shrink until every line measures within max_width
        for chars in range(60, 8, -2):
            candidate = textwrap.wrap(paragraph, width=chars)
            if all(draw.textlength(line, font=font) <= max_width for line in candidate):
                lines.extend(candidate)
                break
        else:
            lines.extend(textwrap.wrap(paragraph, width=10))
    return lines


def _qr_image(content: str) -> Image.Image:
    qr = qrcode.QRCode(border=0, box_size=10)
    qr.add_data(content)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white").convert("L")
    return image.resize((QR_SIZE, QR_SIZE), Image.NEAREST)


class _Canvas:
    """Grows downward as sections are appended; white background."""

    def __init__(self):
        self.image = Image.new("L", (WIDTH, 0), 255)

    def _extend(self, height: int) -> int:
        top = self.image.height
        grown = Image.new("L", (WIDTH, top + height), 255)
        grown.paste(self.image, (0, 0))
        self.image = grown
        return top

    def space(self, height: int) -> None:
        self._extend(height)

    def paste(self, image: Image.Image, center: bool = True) -> None:
        top = self._extend(image.height)
        x = (WIDTH - image.width) // 2 if center else 0
        self.image.paste(image, (x, top))

    def text(
        self,
        content: str,
        size: int,
        style: str = "mono",
        center: bool = False,
        leading: int = 4,
    ) -> None:
        font = _font(size, style)
        probe = ImageDraw.Draw(self.image)
        lines = _wrap(probe, content, font, WIDTH - MARGIN * 2)
        if not lines:
            return
        line_height = size + leading
        top = self._extend(line_height * len(lines))
        draw = ImageDraw.Draw(self.image)
        for i, line in enumerate(lines):
            if center:
                x = (WIDTH - draw.textlength(line, font=font)) // 2
            else:
                x = MARGIN
            draw.text((x, top + i * line_height), line, font=font, fill=0)

    def rule(self) -> None:
        top = self._extend(9)
        draw = ImageDraw.Draw(self.image)
        draw.line([(MARGIN, top + 4), (WIDTH - MARGIN, top + 4)], fill=0, width=2)

    def to_print(self) -> Image.Image:
        # The portrait is already Atkinson-dithered to pure black/white, so a
        # hard threshold here keeps text and the QR crisp instead of letting
        # convert("1") re-dither (and smear) them.
        return self.image.point(lambda p: 255 if p >= 128 else 0).convert("1")


def _render_student(student: dict) -> Image.Image:
    canvas = _Canvas()

    portrait_url = student.get("portraitUrl")
    if portrait_url:
        portrait = _fetch_portrait(portrait_url)
        if portrait is not None:
            canvas.paste(_prepare_portrait(portrait))
            canvas.space(12)

    # long names: step the font down until the name fits on one line;
    # below the floor size it wraps instead
    name = student["displayName"]
    probe = ImageDraw.Draw(canvas.image)
    name_size = 34
    for size in range(34, 23, -2):
        name_size = size
        if probe.textlength(name, font=_font(size, "display")) <= WIDTH - MARGIN * 2:
            break
    canvas.text(name, size=name_size, style="display", center=True)

    subtitle = " - ".join(
        part for part in (student.get("pronouns"), student.get("track")) if part
    )
    if subtitle:
        canvas.space(2)
        canvas.text(subtitle, size=20, style="mono-bold", center=True)

    canvas.space(8)
    canvas.rule()
    canvas.space(8)

    introduction = (student.get("introduction") or "").strip()
    if introduction:
        canvas.text(introduction, size=22)
        canvas.space(14)

    competencies = student.get("competencies") or []
    if competencies:
        for tag in competencies:
            canvas.text(f"* {tag}", size=22)
        canvas.space(14)

    link = (student.get("link") or "").strip()
    if link:
        canvas.space(6)
        canvas.paste(_qr_image(link))
        canvas.space(8)
        # the QR carries the full URL; the printed label drops the scheme and
        # leading www. and steps the font down (like the name) to stay on one line
        label = (
            link.removeprefix("https://")
            .removeprefix("http://")
            .removeprefix("www.")
            .rstrip("/")
        )
        label_size = 16
        for size in range(16, 9, -1):
            label_size = size
            if probe.textlength(label, font=_font(size, "mono")) <= WIDTH - MARGIN * 2:
                break
        canvas.text(label, size=label_size, center=True)

    # trailing whitespace so the last section clears the print head / tear bar
    canvas.space(8)

    return canvas.to_print()


def _send_image(printer, image: Image.Image) -> None:
    """Render the bitmap as raster data.

    Live serial backends (usb) have a tiny receive buffer, so a tall image is
    streamed as short strips with a pause between them to avoid overrun. The
    byte-render path (Dummy -> BLE/netum) has no live buffer here: it is paced
    downstream at the byte level (GATT chunking / NETUM_CHUNK). Splitting it
    into strips there only stacks several raster commands, which these clones
    print with visible seams / misalignment ("prints weird"). So emit a single
    raster command when rendering to bytes.
    """
    # ESC @ first: initialise the printer and clear any prior parser state.
    printer._raw(b"\x1b\x40")
    # Slow the head so a slow BLE feed keeps the buffer full — underrun is what
    # prints the faint scanlines. This firmware's ESC 7 takes a SINGLE parameter
    # (max heating dots); the 3-param Adafruit form leaked its other two bytes as
    # a printed "x(". Fewer dots = the line heats in smaller groups = slower
    # paper = feed keeps up.
    if config.HEAT_TUNE:
        printer._raw(bytes([0x1B, 0x37, config.HEAT_MAX_DOTS & 0xFF]))
    if type(printer).__name__ == "Dummy":
        printer.image(image, impl=config.IMAGE_IMPL, fragment_height=image.height)
        return
    strip = config.IMAGE_STRIP_HEIGHT
    for top in range(0, image.height, strip):
        printer.image(
            image.crop((0, top, image.width, min(top + strip, image.height))),
            impl=config.IMAGE_IMPL,
            fragment_height=strip,
        )
        time.sleep(config.IMAGE_STRIP_DELAY_S)


def print_student(printer, student: dict) -> None:
    """student keys: displayName, pronouns, track, introduction,
    competencies (list[str]), link, portraitUrl — all optional but displayName.
    """
    _send_image(printer, _render_student(student))
    # No cutter on the NT-1809DD: feed past the tear bar, plus extra bottom
    # margin so there's clean whitespace before the tear.
    printer.print_and_feed(7)


def print_self_test(printer) -> None:
    """Small RASTER proof-of-life, printed once at startup.

    The NT-1809DD is a raster-preferring clone: a plaintext `printer.text()`
    self-test clocks out of the serial port (the write 'succeeds' and the log
    says ✓) yet the printer marks no paper — exactly the "nothing printed on
    boot" symptom. Render the proof-of-life as a 1-bit bitmap and push it
    through the same strip/drain path as a real receipt, so a printed self-test
    genuinely proves the raster pipeline end to end, not just that bytes left
    the port. Kept to a few short lines (one strip) so it drains well inside
    the write timeout even at 9600 baud.
    """
    canvas = _Canvas()
    canvas.text("end-show printer", size=28, style="display", center=True)
    canvas.space(4)
    canvas.text("self-test OK", size=22, style="mono-bold", center=True)
    canvas.text("raster link alive", size=18, center=True)
    canvas.space(8)
    _send_image(printer, canvas.to_print())
    printer.print_and_feed(4)


def print_test_page(printer) -> None:
    _send_image(
        printer,
        _render_student(
            {
                "displayName": "end-show printer",
                "pronouns": "test page",
                "track": "OK",
                "introduction": "If you can read this, text rendering works.",
                "competencies": ["raster text", "centered QR"],
                "link": "https://example.com",
            }
        ),
    )
    printer.print_and_feed(4)


def render_student_bytes(student: dict) -> bytes:
    """Render a student receipt to raw ESC/POS bytes.

    For transports that own the serial wire themselves (the netum backend):
    the exact same rich raster pipeline as print_student runs against an escpos
    Dummy, whose accumulated output is the byte stream to send.
    """
    from escpos.printer import Dummy

    dummy = Dummy(profile="default")
    print_student(dummy, student)
    return dummy.output


def render_test_bytes() -> bytes:
    """Raster test page rendered to raw ESC/POS bytes (see render_student_bytes)."""
    from escpos.printer import Dummy

    dummy = Dummy(profile="default")
    print_test_page(dummy)
    return dummy.output
