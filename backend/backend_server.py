import asyncio
import os
from dotenv import load_dotenv
import websockets
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)

# Set für alle verbundenen Clients
connected = set()

# Handler nimmt jetzt path optional entgegen
async def handler(websocket, path=None):
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

async def main():
    port = int(os.getenv("PORT", os.getenv("SIGNALING_PORT", 8765)))
    async with websockets.serve(handler, "0.0.0.0", port):
        logging.info(f"Starte Signaling-Server auf ws://0.0.0.0:{port}")
        await asyncio.Future()  # Laufend halten

if __name__ == "__main__":
    asyncio.run(main())
