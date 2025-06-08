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
        async for msg in websocket:
            for conn in connected:
                if conn is not websocket:
                    await conn.send(msg)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {websocket.remote_address}")

async def process_request(path, request_headers):
    # Fängt jeden HTTP-GET an "/" ab und liefert 200 OK
    if path == "/":
        return 200, [("Content-Type", "text/plain")], b"OK"
    # Alle anderen Pfade: WebSocket-Handshake normal weiterführen
    return None

async def main():
    # Priorität: SIGNALING_PORT, dann PORT, dann 8765
    port = int(os.getenv("SIGNALING_PORT") or os.getenv("PORT") or 8765)
    async with websockets.serve(
        handler,
        "0.0.0.0",
        port,
        process_request=process_request,   # <-- unbedingt hier einbinden
        ping_interval=20,
        ping_timeout=10
    ):
        logging.info(f"Signaling-Server läuft auf ws://0.0.0.0:{port}")
        await asyncio.Future()  # never exit

if __name__ == "__main__":
    asyncio.run(main())
