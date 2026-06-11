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
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageOps

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


def _prepare_portrait(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    image = image.convert("L")
    height = round(image.height * WIDTH / image.width)
    image = image.resize((WIDTH, height))
    return ImageOps.autocontrast(image)


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
        return self.image.convert("1")  # Floyd-Steinberg dither


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
        canvas.text(link, size=16, center=True)

    # trailing whitespace so the last section clears the print head / tear bar
    canvas.space(8)

    return canvas.to_print()


def _send_image(printer, image: Image.Image) -> None:
    """Stream the bitmap in short strips so the printer's buffer keeps up."""
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
    # No cutter on the NT-1809DD: feed past the tear bar instead
    printer.print_and_feed(3)


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
