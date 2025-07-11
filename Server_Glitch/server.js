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
        case "join-room":
          // Client tritt lokalem Multi-Device Room bei
          ws.roomId = msg.roomId;
          ws.deviceId = msg.deviceId;
          ws.inLocalRoom = true;

          if (!rooms.has(msg.roomId)) {
            rooms.set(msg.roomId, new Set());
          }
          rooms.get(msg.roomId).add(ws);

          console.log(
            `✅ ${msg.deviceId} joined room ${msg.roomId} (${rooms.get(msg.roomId).size} devices)`
          );

          // Room update an alle im lokalen Room
          broadcastToRoom(msg.roomId, {
            type: "room-update",
            roomId: msg.roomId,
            devices: Array.from(rooms.get(msg.roomId)).map((c) => ({
              deviceId: c.deviceId,
            })),
          });
          break;

        case "camera-request":
        case "camera-release":
          // Kamera-Management nur in lokalen Rooms
          if (ws.inLocalRoom && ws.roomId) {
            console.log(`📹 Camera ${msg.type} in room ${ws.roomId}`);
            broadcastToRoom(ws.roomId, msg);
          }
          break;

        case "offer":
        case "answer":
        case "ice":
          console.log(`🔄 WebRTC ${msg.type} - Processing...`);

          if (ws.inLocalRoom && msg.roomId) {
            // WebRTC innerhalb lokaler Room
            msg.roomId = ws.roomId;
            broadcastToRoom(ws.roomId, msg, ws);
            console.log(`📡 WebRTC in room ${ws.roomId}: ${msg.type}`);
          } else {
            // Externer Video-Chat
            console.log(
              `📡 External WebRTC: ${msg.type} to ${wss.clients.size - 1} clients`
            );
            broadcast(msg, ws);
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
    console.warn(`Broadcast to non-existent room: ${roomId}`);
    return;
  }

  const msgString = JSON.stringify(message);
  let successCount = 0;

  rooms.get(roomId).forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      try {
        client.send(msgString);
        successCount++;
      } catch (error) {
        console.error("Broadcast error to room client:", error.message);
      }
    }
  });

  console.log(
    `📡 Room ${roomId} broadcast: ${message.type} to ${successCount} clients`
  );
}

// An alle Clients senden (für externe Video-Calls)
function broadcast(message, sender) {
  const msgString = JSON.stringify(message);
  let successCount = 0;
  let errorCount = 0;

  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      try {
        client.send(msgString);
        successCount++;
      } catch (error) {
        console.error("Broadcast error:", error.message);
        errorCount++;
      }
    }
  });

  console.log(
    `📡 Global broadcast: ${message.type} - success: ${successCount}, errors: ${errorCount}`
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
    const stats = {
      totalClients: wss.clients.size,
      localRoomClients: Array.from(wss.clients).filter((c) => c.inLocalRoom)
        .length,
      externalClients: Array.from(wss.clients).filter((c) => !c.inLocalRoom)
        .length,
      totalRooms: rooms.size,
      uptime: process.uptime(),
    };

    console.log(`📊 Server Stats:`, stats);
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
