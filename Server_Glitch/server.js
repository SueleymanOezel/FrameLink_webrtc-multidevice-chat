// server.js - WebSocket Server mit Room Support + normaler Video-Chat
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Server Running');
});

const wss = new WebSocket.Server({ server });

// Rooms verwalten (nur für Multi-Device Management)
const rooms = new Map(); // roomId -> Set of clients

wss.on('connection', (ws) => {
  console.log('Neuer Client verbunden');
  ws.deviceId = null;
  ws.roomId = null;
  ws.inLocalRoom = false; // Flag für lokales Multi-Device Management
  
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      console.log('Message:', msg.type, msg.roomId || 'no-room');
      
      switch(msg.type) {
        case 'join-room':
          // Client tritt lokalem Multi-Device Room bei
          ws.roomId = msg.roomId;
          ws.deviceId = msg.deviceId;
          ws.inLocalRoom = true;
          
          if (!rooms.has(msg.roomId)) {
            rooms.set(msg.roomId, new Set());
          }
          rooms.get(msg.roomId).add(ws);
          
          console.log(`${msg.deviceId} joined local room ${msg.roomId}`);
          
          // Room update an alle im lokalen Room
          broadcastToRoom(msg.roomId, {
            type: 'room-update',
            roomId: msg.roomId,
            devices: Array.from(rooms.get(msg.roomId)).map(c => ({
              deviceId: c.deviceId
            }))
          });
          break;
          
        case 'camera-request':
        case 'camera-release':
          // Kamera-Management nur in lokalen Rooms
          if (ws.inLocalRoom && ws.roomId) {
            broadcastToRoom(ws.roomId, msg);
          }
          break;
          
        case 'offer':
        case 'answer':
        case 'ice':
          // **WICHTIG:** Unterscheidung zwischen lokalem Room und externem Video-Chat
          
          if (ws.inLocalRoom && msg.roomId) {
            // Das ist ein WebRTC Call INNERHALB eines lokalen Multi-Device Rooms
            // -> An andere Geräte im gleichen lokalen Room weiterleiten
            msg.roomId = ws.roomId;
            broadcastToRoom(ws.roomId, msg, ws);
            console.log(`WebRTC in local room ${ws.roomId}: ${msg.type}`);
          } else {
            // Das ist ein normaler Video-Chat Call zwischen verschiedenen Personen
            // -> An ALLE anderen Clients weiterleiten (alte Funktionsweise)
            console.log(`External WebRTC call: ${msg.type} from ${ws.inLocalRoom ? 'room-client' : 'external-client'}`);
            broadcast(msg, ws);
          }
          break;
          
        default:
          // Unbekannte Messages normal an alle broadcasten
          broadcast(msg, ws);
      }
    } catch (error) {
      console.error('Parse error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client getrennt');
    
    // Aus lokalem Room entfernen
    if (ws.roomId && ws.inLocalRoom && rooms.has(ws.roomId)) {
      rooms.get(ws.roomId).delete(ws);
      
      // Room löschen wenn leer
      if (rooms.get(ws.roomId).size === 0) {
        rooms.delete(ws.roomId);
        console.log(`Local room ${ws.roomId} gelöscht (leer)`);
      } else {
        // Update an verbleibende Clients im lokalen Room
        broadcastToRoom(ws.roomId, {
          type: 'room-update',
          roomId: ws.roomId,
          devices: Array.from(rooms.get(ws.roomId)).map(c => ({
            deviceId: c.deviceId
          }))
        });
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// An alle in einem lokalen Room senden
function broadcastToRoom(roomId, message, sender = null) {
  if (!rooms.has(roomId)) return;
  
  const msgString = JSON.stringify(message);
  rooms.get(roomId).forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(msgString);
    }
  });
  console.log(`Broadcast to room ${roomId}: ${message.type}`);
}

// An alle Clients senden (für externe Video-Calls)
function broadcast(message, sender) {
  const msgString = JSON.stringify(message);
  let count = 0;
  
  wss.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      // ✅ An ALLE Clients senden - auch die in lokalen Rooms
      // Die Client-seitige Logik entscheidet was zu tun ist
      client.send(msgString);
      count++;
    }
  });
  
  console.log(`External broadcast: ${message.type} to ${count} clients (including room clients)`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  
  // Status Log
  setInterval(() => {
    const localRoomClients = Array.from(wss.clients).filter(c => c.inLocalRoom).length;
    const externalClients = Array.from(wss.clients).filter(c => !c.inLocalRoom).length;
    console.log(`Status: ${wss.clients.size} total clients (${localRoomClients} in rooms, ${externalClients} external), ${rooms.size} local rooms`);
  }, 60000);
});