// server.js - WebSocket Server mit FLY.IO Optimierungen
const WebSocket = require("ws");
const http = require("http");

// HTTP Server mit expliziten Headers für fly.io
const server = http.createServer((req, res) => {
  // CORS Headers für fly.io
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  // WebSocket Upgrade Headers
  res.setHeader("Upgrade", "websocket");
  res.setHeader("Connection", "Upgrade");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health Check für fly.io
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        service: "framelink-signaling",
        timestamp: new Date().toISOString(),
        connections: wss ? wss.clients.size : 0,
      })
    );
    return;
  }

  // Normale HTTP Response
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("FrameLink WebSocket Server Running on Fly.io");
});

// WebSocket Server mit fly.io Konfiguration
const wss = new WebSocket.Server({
  server,
  // Explizite WebSocket Optionen für fly.io
  perMessageDeflate: false,
  clientTracking: true,
  maxPayload: 1024 * 1024, // 1MB
  // Wichtig für fly.io: Heartbeat
  heartbeat: true,
});

// Rooms verwalten (nur für Multi-Device Management)
const rooms = new Map(); // roomId -> Set of clients

// Heartbeat für fly.io (verhindert Connection Timeouts)
function heartbeat() {
  this.isAlive = true;
}

// Ping-Pong für keep-alive auf fly.io
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log("Terminating dead connection");
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Alle 30 Sekunden

wss.on("connection", (ws, req) => {
  console.log("Neuer Client verbunden von:", req.socket.remoteAddress);

  // Heartbeat Setup
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.deviceId = null;
  ws.roomId = null;
  ws.inLocalRoom = false;

  // Connection Info loggen
  console.log("Connection Details:", {
    origin: req.headers.origin,
    userAgent: req.headers["user-agent"]?.substring(0, 50),
    forwarded: req.headers["x-forwarded-for"],
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      // Debug Log für wichtige Messages
      if (["join-room", "offer", "answer"].includes(msg.type)) {
        console.log("Important Message:", msg.type, {
          roomId: msg.roomId || "no-room",
          deviceId: msg.deviceId || "no-device",
          clientsTotal: wss.clients.size,
        });
      }

      switch (msg.type) {
        case "request-room-peers":
          console.log(
            `🔍 [ROOM-DEBUG] Peer request from ${ws.deviceId} in room ${msg.roomId}`
          );

          if (ws.roomId && rooms.has(ws.roomId)) {
            const roomClients = Array.from(rooms.get(ws.roomId));
            const devices = roomClients.map((c) => ({
              deviceId: c.deviceId,
            }));

            console.log(
              `📋 [ROOM-DEBUG] Room ${msg.roomId} has ${devices.length} devices:`,
              devices.map((d) => d.deviceId)
            );

            // Send room-update to requesting client
            const roomUpdate = {
              type: "room-update",
              roomId: ws.roomId,
              devices,
              timestamp: Date.now(),
            };

            ws.send(JSON.stringify(roomUpdate));
            console.log(
              `📤 [ROOM-DEBUG] Sent room-update to ${ws.deviceId}:`,
              devices.length,
              "devices"
            );

            // 🔴 CRITICAL: Also send room-peer-joined for each OTHER device
            devices.forEach((device) => {
              if (device.deviceId !== ws.deviceId) {
                const peerJoinedMessage = {
                  type: "room-peer-joined",
                  roomId: ws.roomId,
                  deviceId: device.deviceId,
                  timestamp: Date.now(),
                };

                ws.send(JSON.stringify(peerJoinedMessage));
                console.log(
                  `📤 [ROOM-DEBUG] Sent room-peer-joined to ${ws.deviceId} about ${device.deviceId}`
                );
              }
            });
          } else {
            console.log(
              `❌ [ROOM-DEBUG] Room ${msg.roomId} not found or client not in room`
            );
          }
          break;
        case "join-room":
          console.log(`🚪 [ROOM-DEBUG] Join room request:`, {
            roomId: msg.roomId,
            deviceId: msg.deviceId,
            currentDevices: rooms.has(msg.roomId)
              ? rooms.get(msg.roomId).size
              : 0,
          });

          // Client tritt lokalem Multi-Device Room bei
          ws.roomId = msg.roomId;
          ws.deviceId = msg.deviceId;
          ws.inLocalRoom = true;

          if (!rooms.has(msg.roomId)) {
            rooms.set(msg.roomId, new Set());
            console.log(`🏗️ [ROOM-DEBUG] Created new room: ${msg.roomId}`);
          }

          const roomSet = rooms.get(msg.roomId);
          roomSet.add(ws);

          console.log(
            `✅ [ROOM-DEBUG] ${msg.deviceId} joined room ${msg.roomId} (${roomSet.size} devices total)`
          );

          // Get all devices in room
          const allDevices = Array.from(roomSet).map((c) => ({
            deviceId: c.deviceId,
          }));

          // Send room-update to ALL clients in room
          const roomUpdateMessage = {
            type: "room-update",
            roomId: msg.roomId,
            devices: allDevices,
            timestamp: Date.now(),
          };

          broadcastToRoom(msg.roomId, roomUpdateMessage);
          console.log(
            `📤 [ROOM-DEBUG] Broadcasted room-update to ${roomSet.size} devices`
          );

          // 🔴 CRITICAL: Send room-peer-joined to all OTHER devices about this new device
          const peerJoinedMessage = {
            type: "room-peer-joined",
            roomId: msg.roomId,
            deviceId: msg.deviceId,
            timestamp: Date.now(),
          };

          broadcastToRoom(msg.roomId, peerJoinedMessage, ws);
          console.log(
            `📤 [ROOM-DEBUG] Broadcasted room-peer-joined about ${msg.deviceId} to other devices`
          );
          break;

        case "camera-request":
        case "camera-release":
          // Kamera-Management nur in lokalen Rooms
          if (ws.inLocalRoom && ws.roomId) {
            console.log(`📹 Camera ${msg.type} in room ${ws.roomId}`);
            broadcastToRoom(ws.roomId, msg);
          }
          break;

        case "master-call-start":
        case "external-stream-device":
          // Master call management für lokale Rooms
          if (ws.inLocalRoom && ws.roomId) {
            console.log(`📞 Master call ${msg.type} in room ${ws.roomId}`);
            broadcastToRoom(ws.roomId, msg);
          }
          break;

        case "room-video-offer":
        case "room-video-answer":
        case "room-video-ice":
        case "room-peer-joined":
        case "room-peer-left":
        case "face-detection-update":
          // Room video/peer management für lokale Rooms
          if (ws.inLocalRoom && ws.roomId) {
            console.log(`🎥 Room video ${msg.type} in room ${ws.roomId}`);
            broadcastToRoom(ws.roomId, msg);
          }
          break;

        case "offer":
        case "answer":
        case "ice":
          // **WICHTIG:** Unterscheidung zwischen lokalem Room und externem Video-Chat

          if (
            ws.inLocalRoom &&
            msg.roomId &&
            msg.toDeviceId &&
            msg.fromDeviceId
          ) {
            // Das ist ein WebRTC Call INNERHALB eines lokalen Multi-Device Rooms
            // -> An andere Geräte im gleichen lokalen Room weiterleiten
            broadcastToRoom(ws.roomId, msg, ws);
            console.log(`WebRTC in local room ${ws.roomId}: ${msg.type}`);
          } else {
            // Das ist ein normaler Video-Chat Call zwischen verschiedenen Personen
            // -> An ALLE anderen Clients weiterleiten (alte Funktionsweise)
            console.log(
              `External WebRTC call: ${msg.type} from ${ws.inLocalRoom ? "room-client" : "external-client"}`
            );
            broadcast(msg, ws); // ✅ LÖSUNG: Sendet an alle Clients
          }
          break;

        // FLY.IO SPECIFIC: Health check via WebSocket
        case "ping":
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          break;

        default:
          // Andere Messages normal broadcasten
          broadcast(msg, ws);
      }
    } catch (error) {
      console.error("Message Parse Error:", error.message);
      // Sende Error zurück an Client für Debugging
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
            timestamp: Date.now(),
          })
        );
      } catch (e) {
        console.error("Error sending error message:", e);
      }
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`Client disconnected: ${code} ${reason}`);

    // Aus lokalem Room entfernen
    if (ws.roomId && ws.inLocalRoom && rooms.has(ws.roomId)) {
      rooms.get(ws.roomId).delete(ws);

      // Room löschen wenn leer
      if (rooms.get(ws.roomId).size === 0) {
        rooms.delete(ws.roomId);
        console.log(`Room ${ws.roomId} deleted (empty)`);
      } else {
        // Update an verbleibende Clients
        broadcastToRoom(ws.roomId, {
          type: "room-update",
          roomId: ws.roomId,
          devices: Array.from(rooms.get(ws.roomId)).map((c) => ({
            deviceId: c.deviceId,
          })),
        });
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket Error:", error.message);
  });

  // Welcome Message senden
  try {
    ws.send(
      JSON.stringify({
        type: "welcome",
        message: "Connected to FrameLink Signaling Server",
        timestamp: Date.now(),
        server: "fly.io",
      })
    );
  } catch (error) {
    console.error("Error sending welcome message:", error);
  }
});

// An alle in einem lokalen Room senden
function broadcastToRoom(roomId, message, sender = null) {
  if (!rooms.has(roomId)) {
    console.log(
      `⚠️ [ROOM-DEBUG] Cannot broadcast to room ${roomId} - room not found`
    );
    return;
  }

  const roomClients = rooms.get(roomId);
  const msgString = JSON.stringify(message);
  let sentCount = 0;

  roomClients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      try {
        client.send(msgString);
        sentCount++;
      } catch (error) {
        console.log(
          `❌ [ROOM-DEBUG] Failed to send to ${client.deviceId}:`,
          error.message
        );
      }
    }
  });

  console.log(
    `📡 [ROOM-DEBUG] Broadcast ${message.type} to room ${roomId}: ${sentCount}/${roomClients.size} clients`
  );
}

// An alle Clients senden (für externe Video-Calls)
function broadcast(message, sender) {
  const msgString = JSON.stringify(message);
  let count = 0;

  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      // ✅ An ALLE Clients senden - auch die in lokalen Rooms
      // Die Client-seitige Logik entscheidet was zu tun ist
      client.send(msgString);
      count++;
    }
  });

  console.log(
    `External broadcast: ${message.type} to ${count} clients (including room clients)`
  );
}

// Server starten mit fly.io Konfiguration
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Wichtig für fly.io!

server.listen(PORT, HOST, () => {
  console.log(`🚀 FrameLink Signaling Server running on ${HOST}:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://${HOST}:${PORT}`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🛩️ Environment: ${process.env.NODE_ENV || "development"}`);

  // Status Log für fly.io
  setInterval(() => {
    const localRoomClients = Array.from(wss.clients).filter(
      (c) => c.inLocalRoom
    ).length;
    const externalClients = Array.from(wss.clients).filter(
      (c) => !c.inLocalRoom
    ).length;
    console.log(
      `📊 Status: ${wss.clients.size} total clients (${localRoomClients} in rooms, ${externalClients} external), ${rooms.size} local rooms`
    );
  }, 60000);
});

// Graceful Shutdown für fly.io
wss.on("close", function close() {
  clearInterval(interval);
  console.log("🛑 WebSocket Server closed");
});

// Process Handlers für fly.io
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

module.exports = { server, wss };
