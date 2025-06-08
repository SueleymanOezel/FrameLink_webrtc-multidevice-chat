import asyncio
import os
from dotenv import load_dotenv
import websockets
import logging
import json

load_dotenv()
logging.basicConfig(level=logging.INFO)

# Set für alle verbundenen Clients
connected = set()

# Handler nimmt jetzt path optional entgegen
async def handler(websocket, path=None):
    connected.add(websocket)
    client_info = f"{websocket.remote_address} (path: {path})"
    logging.info(f"Client verbunden: {client_info}")
    
    try:
        async for message in websocket:
            logging.info(f"Nachricht erhalten: {message[:100]}...")
            for conn in connected:
                if conn is not websocket:
                    await conn.send(message)
                    logging.info(f"Nachricht weitergeleitet")
    except websockets.ConnectionClosed as e:
        logging.info(f"Verbindung geschlossen mit Code: {e.code}, Grund: {e.reason}")
    except Exception as e:
        logging.error(f"Fehler im Handler: {str(e)}")
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {client_info}")

async def process_request(path, request_headers):
    # CORS-Headers für alle Origins erlauben (während der Entwicklung)
    if "origin" in request_headers:
        return {
            "status": 101,
            "headers": [
                ("Access-Control-Allow-Origin", request_headers["origin"]),
                ("Access-Control-Allow-Methods", "GET, POST"),
                ("Access-Control-Allow-Headers", "content-type"),
                ("Access-Control-Allow-Credentials", "true"),
            ]
        }

async def main():
    port = int(os.getenv("PORT", os.getenv("SIGNALING_PORT", 8765)))
    
    # Extra Logging für Port-Informationen
    logging.info(f"Umgebungsvariablen: PORT={os.getenv('PORT')}, SIGNALING_PORT={os.getenv('SIGNALING_PORT')}")
    logging.info(f"Starte Signaling-Server auf Port {port}")
    
    async with websockets.serve(
        handler, 
        "0.0.0.0", 
        port,
        process_request=process_request
    ):
        logging.info(f"Server gestartet und wartet auf Verbindungen...")
        await asyncio.Future()  # Laufend halten

if __name__ == "__main__":
    asyncio.run(main())