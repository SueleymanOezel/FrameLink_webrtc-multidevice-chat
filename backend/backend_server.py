import asyncio
import os
import logging
import websockets
import json

logging.basicConfig(level=logging.INFO)

# Alle verbundenen Clients speichern
connected = set()

async def handler(websocket, path):
    # Client zur Liste hinzufügen
    connected.add(websocket)
    logging.info(f"Client verbunden: {websocket.remote_address}")
    
    try:
        # Nachrichten empfangen und an alle anderen weiterleiten
        async for message in websocket:
            # An alle ANDEREN Clients senden
            for client in connected:
                if client != websocket and client.open:
                    await client.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        # Client aus Liste entfernen
        connected.remove(websocket)
        logging.info(f"Client getrennt: {websocket.remote_address}")

async def main():
    # Railway setzt PORT automatisch
    port = int(os.getenv("PORT", 8765))
    
    # Einfacher WebSocket-Server OHNE Health Check Handler
    async with websockets.serve(handler, "0.0.0.0", port):
        logging.info(f"Signaling-Server läuft auf Port {port}")
        await asyncio.Future()  # Läuft für immer

if __name__ == "__main__":
    asyncio.run(main())