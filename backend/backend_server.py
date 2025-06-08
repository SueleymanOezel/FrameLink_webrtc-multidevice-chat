import asyncio
import os
import logging
import websockets
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)

connected = set()

async def handler(websocket, path):
    connected.add(websocket)
    logging.info(f"Client verbunden: {websocket.remote_address}")
    try:
        async for message in websocket:
            for conn in connected:
                if conn is not websocket:
                    await conn.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {websocket.remote_address}")

# HTTP-Fallback für Health-Checks und Browser-GETs
async def process_request(path, request_headers):
    # Wenn jemand per HTTP GET "/" anfragt, liefern wir 200 OK zurück
    if path == "/":
        return 200, [("Content-Type", "text/plain")], b"OK"
    # Für alles andere → WebSocket-Handshake normal weiterlaufen lassen
    return None

async def main():
    # bevorzugt SIGNALING_PORT (8765), sonst Railway-PORT (z.B. 8765), sonst 8765
    port = int(os.getenv("SIGNALING_PORT") or os.getenv("PORT") or 8765)
    async with websockets.serve(
        handler,
        "0.0.0.0",
        port,
        process_request=process_request,   # <-- hier einbinden
        ping_interval=20,
        ping_timeout=10
    ):
        logging.info(f"Starte Signaling-Server auf ws://0.0.0.0:{port}")
        await asyncio.Future()  # Laufend halten

if __name__ == "__main__":
    asyncio.run(main())
