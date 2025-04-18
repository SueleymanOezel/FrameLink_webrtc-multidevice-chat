# FrameLink_webrtc-multidevice-chat

## Projektbeschreibung

Diese Anwendung ermöglicht einen nahtlosen Videochat zwischen zwei Nutzern, auch wenn diese sich in unterschiedlichen Räumen mit verschiedenen Geräten aufhalten. Durch den Einsatz von lokaler Gesichtserkennung wird automatisch das jeweils aktive Gerät (z.B. Laptop, Tablet, Smart Display) ausgewählt, um Kamera und Mikrofon zu nutzen. Der Wechsel zwischen den Geräten erfolgt automatisch und unterbrechungsfrei.

**Ziel:** Entwicklung einer WebRTC-basierten Videochat-Anwendung mit Multi-Geräte-Unterstützung und dynamischem Umschalten der aktiven Geräte basierend auf lokaler Gesichtserkennung.

## Features

* Peer-to-Peer-Videochat 
* Multi-Geräte-Unterstützung
* Automatisches Umschalten zwischen Geräten 
* Echtzeit-Videoanzeige des aktiven Geräts 
* Lokale Gesichtserkennung für Datenschutz 
* Signaling über WebSocket 

## Setup

### Voraussetzungen

* Node.js ≥14
* Python 3.8+
* yarn oder npm
* virtuelle Umgebung (venv für Backend)

### Installation

\`\`\`bash
git clone <repo-url>
cd webrtc-multidevice-chat

# Frontend
cd frontend && npm install

# Backend
cd backend
python3 -m venv venv # Erstelle eine virtuelle Umgebung (optional, aber empfohlen)
source venv/bin/activate # Aktiviere die virtuelle Umgebung (Linux/macOS)
# venv\\Scripts\\activate # Aktiviere die virtuelle Umgebung (Windows)
pip install -r requirements.txt
\`\`\`

### Konfiguration

* Umgebungsvariablen für Backend (z.B. WebSocket-URL, STUN/TURN-Server-Konfiguration)
* Konfigurationsdateien für Frontend (falls notwendig)

### Starten der Anwendung

\`\`\`bash
# Backend
cd backend
python backend\_server.py # oder der Name deines Server-Skripts

# Frontend (in einem neuen Terminal)
cd frontend
npm start # oder yarn start
\`\`\`

## Branch-Policy

* `main`: Stabiler Release-Branch.
* `dev`: Integrationsbranch für neue Features.
* Feature Branches: Für die Entwicklung einzelner Features.
* Bugfix Branches: Für die Behebung von Fehlern.

Alle Pull Requests sollen gegen den `dev`-Branch gestellt werden.

## Coding-Standards

* Frontend: ESLint, Prettier (Konfigurationen siehe `.eslintrc.js`, `.prettierrc.js`)
* Backend: Python Lint (z.B. Pylint, Black)

Bitte stelle sicher, dass dein Code diesen Standards entspricht, bevor du Pull Requests erstellst.
