"""BLE (Bluetooth 4.0) transport for the M58-LL and similar dual-mode printers.

These cheap 58mm units expose both Classic SPP and BLE. macOS connects the
Classic SPP channel (/dev/cu.*) and it *looks* alive — writes drain — but the
print engine never reads that channel, so nothing prints. The working wireless
path is BLE GATT: we render the receipt to ESC/POS bytes (escpos Dummy, see
receipt.render_*_bytes) and stream them to the printer's writable characteristic.

Bleak is async and CoreBluetooth-backed; callers await send(). A module lock
serialises jobs so two prints never fight over one connection. A fresh connect
per job mirrors the serial backend: resilient to the printer cycling power.
"""

import asyncio
import logging

from bleak import BleakClient, BleakScanner

from . import config

log = logging.getLogger("printer.ble")

# Writable characteristics used by common cheap ESC/POS BLE printers, best-first.
# Discovery falls back to the first writable characteristic and logs the whole
# GATT table, so an unlisted unit can still be pinned via PRINTER_BLE_WRITE_CHAR.
_KNOWN_WRITE_CHARS = (
    "0000ff02-0000-1000-8000-00805f9b34fb",  # ff02 in the ff00 service
    "0000ffe1-0000-1000-8000-00805f9b34fb",  # ffe1, HM-10 style module
    "00002af1-0000-1000-8000-00805f9b34fb",  # 2af1 in the 18f0 service
    "0000ae01-0000-1000-8000-00805f9b34fb",  # ae01 in the ae30 service
)
# Service UUIDs that, if advertised, mark a device as a likely printer when no
# name/address is pinned (macOS often hides names in passive scans).
_KNOWN_SERVICES = ("ff00", "ffe0", "18f0", "ae30")

_lock = asyncio.Lock()


def _looks_like_printer(adv) -> bool:
    uuids = [u.lower() for u in (adv.service_uuids or [])]
    return any(any(k in u for k in _KNOWN_SERVICES) for u in uuids)


async def _resolve_device():
    """Find the printer's BLE device, by pinned address, then name, then service."""
    timeout = config.BLE_SCAN_TIMEOUT_S
    if config.BLE_ADDRESS:
        dev = await BleakScanner.find_device_by_address(config.BLE_ADDRESS, timeout=timeout)
        if dev is not None:
            return dev
        # macOS CoreBluetooth addresses are per-host and can rotate; fall back to
        # a name/service scan rather than hard-failing on a stale pinned address.
        log.warning(
            "pinned PRINTER_BLE_ADDRESS=%s not found in %.0fs — falling back to "
            "name/service scan",
            config.BLE_ADDRESS,
            timeout,
        )
    found = await BleakScanner.discover(timeout=timeout, return_adv=True)
    by_name, by_service = [], []
    for _addr, (dev, adv) in found.items():
        name = (dev.name or adv.local_name or "").lower()
        if config.BLE_NAME and config.BLE_NAME in name:
            by_name.append(dev)
        elif _looks_like_printer(adv):
            by_service.append(dev)
    picks = by_name or by_service
    if not picks:
        raise RuntimeError(
            "no BLE printer found — set PRINTER_BLE_ADDRESS (run ble_probe.py to "
            "discover it) or PRINTER_BLE_NAME; ensure the printer is on and not "
            "held by a Classic bluetooth connection"
        )
    if len(picks) > 1:
        log.warning("multiple BLE candidates, using first: %s", [d.address for d in picks])
    return picks[0]


def _pick_write_char(client):
    """Choose the characteristic to stream ESC/POS bytes to."""
    if config.BLE_WRITE_CHAR:
        return config.BLE_WRITE_CHAR
    writable = [
        c
        for s in client.services
        for c in s.characteristics
        if {"write", "write-without-response"} & set(c.properties)
    ]
    if not writable:
        raise RuntimeError("printer exposes no writable BLE characteristic")
    for known in _KNOWN_WRITE_CHARS:
        for c in writable:
            if c.uuid.lower() == known:
                return c
    log.warning(
        "no known printer characteristic; using first writable %s (pin with "
        "PRINTER_BLE_WRITE_CHAR if wrong)",
        writable[0].uuid,
    )
    return writable[0]


async def send(data: bytes) -> None:
    """Connect, stream ESC/POS bytes to the printer's characteristic, disconnect."""
    async with _lock:
        device = await _resolve_device()
        async with BleakClient(device, timeout=config.BLE_CONNECT_TIMEOUT_S) as client:
            char = _pick_write_char(client)
            # write-without-response is faster and what most of these printers
            # want; only fall back to acked writes if WWR isn't offered. Either
            # way pace the chunks: blasting overruns the printer's small buffer.
            props = getattr(char, "properties", ["write-without-response"])
            no_response = "write-without-response" in props
            mtu = getattr(client, "mtu_size", 23) or 23
            chunk = config.BLE_CHUNK or max(20, mtu - 3)
            delay = config.BLE_CHUNK_DELAY_MS / 1000
            log.info(
                "ble: sending %d bytes to %s in %d-byte chunks (response=%s)",
                len(data),
                getattr(char, "uuid", char),
                chunk,
                not no_response,
            )
            for i in range(0, len(data), chunk):
                await client.write_gatt_char(char, data[i : i + chunk], response=not no_response)
                if delay:
                    await asyncio.sleep(delay)
            # Drain before the context manager disconnects: a write-without-response
            # chunk is only queued, not delivered, when write_gatt_char returns. The
            # last (or only) packet of a small job is otherwise dropped on disconnect.
            if no_response and config.BLE_FLUSH_DELAY_MS:
                await asyncio.sleep(config.BLE_FLUSH_DELAY_MS / 1000)


async def probe() -> bool:
    """Startup proof-of-life: render the small test page and stream it over BLE."""
    from . import receipt

    await send(receipt.render_test_bytes())
    return True
