import asyncio
import os
import logging
import websockets

logging.basicConfig(level=logging.INFO)

connected = set()

async def handler(websocket, path):
    connected.add(websocket)
    logging.info(f"Client verbunden: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            for client in connected:
                if client != websocket and client.open:
                    await client.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {websocket.remote_address}")

async def main():
    # WICHTIG: Nur PORT verwenden, nicht SIGNALING_PORT!
    port = int(os.getenv("PORT", 8765))
    
    # KEIN process_request Parameter!
    async with websockets.serve(handler, "0.0.0.0", port):
        logging.info(f"Signaling-Server läuft auf Port {port}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())