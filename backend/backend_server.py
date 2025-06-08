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
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {websocket.remote_address}")

# —— Neu: HTTP-Fallback für GET / —— 
async def process_request(path, request_headers):
    if path == "/":
        # 200 OK, Text-Antwort statt 426
        return 200, [("Content-Type", "text/plain")], b"OK"
    # für alle anderen Pfade → WebSocket-Handshake normal fortsetzen
    return None

async def main():
    port = int(os.getenv("SIGNALING_PORT") or os.getenv("PORT") or 8765)
    async with websockets.serve(
        handler,
        "0.0.0.0",
        port,
        process_request=process_request,   # hier einbinden!
        ping_interval=20,
        ping_timeout=10
    ):
        logging.info(f"Starte Signaling-Server auf ws://0.0.0.0:{port}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
