import asyncio
import os
import json
from dotenv import load_dotenv
import websockets
import logging
import ssl

# Logging konfigurieren
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

load_dotenv()

# Set für alle verbundenen Clients
connected = set()

# HTTP- und WebSocket-Handler
async def http_handler(path, request_headers):
    logging.info(f"Eingehende Anfrage: {path}")
    logging.info(f"Headers: {request_headers}")
    
    # HTTP-Route für Ping/Healthcheck
    if path == "/ping" or path == "/health":
        logging.info("Health-Check oder Ping-Anfrage")
        return {
            "status": 200,
            "headers": [
                ("Content-Type", "application/json"),
                ("Access-Control-Allow-Origin", "*"),
                ("Access-Control-Allow-Methods", "GET, POST"),
                ("Access-Control-Allow-Headers", "content-type"),
            ],
            "body": json.dumps({"status": "ok", "message": "Server is running"}).encode(),
        }
    
    # Für WebSocket-Verbindungen
    if "upgrade" in request_headers and request_headers["upgrade"].lower() == "websocket":
        logging.info("WebSocket-Upgrade-Anfrage erkannt")
        
        # CORS-Header für WebSocket-Handshake
        if "origin" in request_headers:
            origin = request_headers["origin"]
            logging.info(f"Origin Header: {origin}")
            return {
                "status": 101,
                "headers": [
                    ("Access-Control-Allow-Origin", "*"),
                    ("Access-Control-Allow-Methods", "GET, POST"),
                    ("Access-Control-Allow-Headers", "content-type"),
                    ("Access-Control-Allow-Credentials", "true"),
                    ("Server", "WebSocketServer"),
                ]
            }
        return None
    
    # Standard-Response für andere Pfade
    if path != "/" and not path.startswith("/models/") and path != "/app.js" and path != "/index.html":
        logging.info(f"404 für Pfad: {path}")
        return {
            "status": 404,
            "headers": [
                ("Content-Type", "text/plain"),
                ("Access-Control-Allow-Origin", "*"),
            ],
            "body": b"Not Found",
        }
    
    # Root-Pfad: Status-Seite
    logging.info("Status-Seite angefordert")
    return {
        "status": 200,
        "headers": [
            ("Content-Type", "text/html"),
            ("Access-Control-Allow-Origin", "*"),
        ],
        "body": b"""
        <html>
        <head>
            <title>WebSocket Server Status</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .status { padding: 10px; margin: 10px 0; background-color: #eeffee; border: 1px solid green; }
            </style>
        </head>
        <body>
            <h1>WebSocket Server</h1>
            <div class="status">Status: Running</div>
            <p>Dienstinformationen:</p>
            <ul>
                <li>WebSocket-URL: wss://[domain]</li>
                <li>HTTP-Ping: https://[domain]/ping</li>
            </ul>
        </body>
        </html>
        """,
    }

# WebSocket Handler
async def handler(websocket, path=None):
    # Detaillierte Verbindungs-Logs
    remote_address = websocket.remote_address if hasattr(websocket, 'remote_address') else "Unbekannt"
    logging.info(f"Client verbunden: {remote_address}")
    if hasattr(websocket, 'request_headers'):
        logging.info(f"Headers: {websocket.request_headers}")
    
    connected.add(websocket)
    logging.info(f"Aktive Verbindungen: {len(connected)}")
    
    try:
        async for message in websocket:
            try:
                # Versuche die Nachricht als JSON zu parsen und den Typ zu protokollieren
                msg_data = json.loads(message)
                msg_type = msg_data.get("type", "unbekannt")
                logging.info(f"Nachricht vom Typ '{msg_type}' erhalten von {remote_address}")
                
                # Ping-Nachrichten beantworten
                if msg_type == "ping":
                    await websocket.send(json.dumps({"type": "pong", "time": msg_data.get("time", 0)}))
                    logging.info(f"Pong an {remote_address} gesendet")
                    continue
                
                # Alle anderen Nachrichten an alle anderen Clients weiterleiten
                relay_count = 0
                for conn in connected:
                    if conn is not websocket:
                        await conn.send(message)
                        relay_count += 1
                
                if relay_count > 0:
                    logging.info(f"Nachricht an {relay_count} andere Clients weitergeleitet")
                else:
                    logging.info("Keine anderen Clients zum Weiterleiten verfügbar")
                
            except json.JSONDecodeError:
                logging.warning(f"Nicht-JSON-Nachricht erhalten: {message[:100]}...")
                
            except Exception as e:
                logging.error(f"Fehler beim Verarbeiten der Nachricht: {str(e)}", exc_info=True)
    
    except websockets.ConnectionClosed as e:
        logging.info(f"Verbindung geschlossen: Code {e.code}, Grund: {e.reason}")
    
    except Exception as e:
        logging.error(f"Unerwarteter Fehler: {str(e)}", exc_info=True)
    
    finally:
        connected.remove(websocket)
        logging.info(f"Client getrennt: {remote_address}")
        logging.info(f"Verbleibende Verbindungen: {len(connected)}")

async def main():
    # Port aus Umgebungsvariablen lesen
    port = int(os.getenv("PORT", "8080"))
    
    # Umgebungsvariablen protokollieren
    env_vars = {
        "PORT": os.getenv("PORT"),
        "SIGNALING_PORT": os.getenv("SIGNALING_PORT"),
        "RAILWAY_STATIC_URL": os.getenv("RAILWAY_STATIC_URL"),
        "RAILWAY_PUBLIC_DOMAIN": os.getenv("RAILWAY_PUBLIC_DOMAIN")
    }
    logging.info(f"Umgebungsvariablen: {env_vars}")
    logging.info(f"Starte Signaling-Server auf Port {port}")
    
    # Prüfen, ob wir auf Railway laufen
    is_railway = "RAILWAY_STATIC_URL" in os.environ or "RAILWAY_PUBLIC_DOMAIN" in os.environ
    if is_railway:
        logging.info("Laufe auf Railway - verwende spezielle Konfiguration")
    
    # Server-Konfiguration
    server_kwargs = {
        "process_request": http_handler,
        "ping_interval": 30,
        "ping_timeout": 10,
        "max_size": 10 * 1024 * 1024,  # 10 MB max message size
        "max_queue": 32,  # Maximale Anzahl ausstehender Verbindungen
    }
    
    # SSL-Kontext wird von Railway automatisch bereitgestellt
    
    # Server starten
    async with websockets.serve(handler, "0.0.0.0", port, **server_kwargs):
        logging.info(f"Server gestartet und wartet auf Verbindungen auf Port {port}")
        await asyncio.Future()  # Laufend halten

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server durch Benutzer beendet")
    except Exception as e:
        logging.error(f"Fehler beim Starten des Servers: {str(e)}", exc_info=True)