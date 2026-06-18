"""Discovery: connect to the printer over BLE and dump its GATT table.

Usage:
  uv run python ble_probe.py            # auto-pick the strongest named device
  uv run python ble_probe.py <ADDRESS>  # connect to a specific address

Prints every service/characteristic with properties; the writable one
(write / write-without-response) is the print channel. Pin the results via
PRINTER_BLE_ADDRESS and (if auto-detect picks wrong) PRINTER_BLE_WRITE_CHAR.
"""

import asyncio
import sys

from bleak import BleakClient, BleakScanner


async def pick_address() -> str | None:
    print("scanning 10s ...", flush=True)
    found = await BleakScanner.discover(timeout=10.0, return_adv=True)
    ranked = sorted(found.items(), key=lambda kv: (kv[1][1].rssi or -999), reverse=True)
    named = [
        (addr, dev, adv)
        for addr, (dev, adv) in ranked
        if (dev.name or adv.local_name)
    ]
    for addr, dev, adv in named:
        print(f"  {adv.rssi:>4} dBm  {addr}  {dev.name or adv.local_name!r}", flush=True)
    if named:
        return named[0][0]
    print("no NAMED devices; pass an address explicitly (see ble_scan.py output)", flush=True)
    return None


async def main() -> None:
    address = sys.argv[1] if len(sys.argv) > 1 else await pick_address()
    if not address:
        return
    print(f"\nconnecting to {address} ...", flush=True)
    async with BleakClient(address, timeout=20.0) as client:
        print(f"connected. mtu={getattr(client, 'mtu_size', '?')}\n", flush=True)
        for service in client.services:
            print(f"service {service.uuid}", flush=True)
            for c in service.characteristics:
                props = ",".join(c.properties)
                star = "  <-- WRITABLE" if {"write", "write-without-response"} & set(c.properties) else ""
                print(f"    char {c.uuid}  [{props}]{star}", flush=True)


asyncio.run(main())
