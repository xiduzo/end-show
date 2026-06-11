# end-show printer

Local HTTP print service for the NT-1809DD (Netum, 58mm/384-dot ESC/POS) thermal printer. Runs on the machine the printer is plugged into (Raspberry Pi or Mac mini next to the display/iPad). The web app POSTs student content; this service prints it.

## Why not the iPad directly?

iOS cannot drive a raw ESC/POS USB printer (no libusb, no driver model for it). Instead the printer hangs off a small host on the same LAN, and any browser — including the iPad running the companion — calls this service over HTTP.

## Install

```sh
cd apps/printer
uv sync          # or: pip install -e .
```

USB backend needs libusb:

- macOS: `brew install libusb`
- Raspberry Pi / Debian: `sudo apt install libusb-1.0-0`

On Linux, allow non-root USB access (then replug):

```sh
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0416", ATTRS{idProduct}=="5011", MODE="0666"' \
  | sudo tee /etc/udev/rules.d/99-thermal-printer.rules
sudo udevadm control --reload
```

## Run

```sh
uv run end-show-printer
# or: uv run uvicorn printer.main:app --host 0.0.0.0 --port 8765
```

Smoke test: `POST http://<host>:8765/test` prints a test page; `GET /health` checks the service.

## Configuration (env vars)

| Var | Default | Notes |
|---|---|---|
| `PRINTER_BACKEND` | `usb` | `usb` \| `serial` (Bluetooth tty) \| `file` (`/dev/usb/lp0`) \| `dummy` (dev, no printer) |
| `PRINTER_USB_VENDOR` / `PRINTER_USB_PRODUCT` | `0x0416` / `0x5011` | Check with `lsusb` (Linux) or `system_profiler SPUSBDataType` (macOS) |
| `PRINTER_SERIAL_DEVICE` | `/dev/rfcomm0` | For `serial` backend |
| `PRINTER_FILE_DEVICE` | `/dev/usb/lp0` | For `file` backend |
| `PRINTER_HTTP_PORT` | `8765` | |
| `PRINTER_CORS_ORIGINS` | `*` | Comma-separated origins |

## API

`POST /print`

```json
{
  "displayName": "Ada Lovelace",
  "pronouns": "she/her",
  "track": "IxD",
  "introduction": "First programmer.",
  "competencies": ["prototyping", "systems thinking"],
  "link": "https://example.com/ada",
  "portraitUrl": "https://assets.example.com/ada.jpg"
}
```

Only `displayName` is required. The portrait is fetched, dithered to 1-bit at 384px wide, and printed above the name; the link prints as a QR code.

From the web app:

```ts
await fetch("http://printer.local:8765/print", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(student),
});
```

## Mixed-content caveat

If the companion is served over HTTPS, browsers block plain-HTTP calls to LAN hosts — except to `http://localhost`, which is treated as secure. Options:

1. Run the browser on the same host as the printer (Mac mini / RPi driving the big display) and call `http://localhost:8765` — works out of the box.
2. On the iPad, allow insecure content for the companion site, or put the service behind an HTTPS reverse proxy with a trusted cert.

## Boot service (Raspberry Pi)

```ini
# /etc/systemd/system/end-show-printer.service
[Unit]
Description=end-show printer service
After=network.target

[Service]
WorkingDirectory=/home/pi/end-show/apps/printer
ExecStart=/home/pi/.local/bin/uv run end-show-printer
Restart=always

[Install]
WantedBy=multi-user.target
```
