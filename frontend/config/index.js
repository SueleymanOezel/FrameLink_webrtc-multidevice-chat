// frontend/config/index.js
// Statische Konfiguration für WebRTC und Signaling (ohne Bundler)

// Liste der Signaling-Server (primary + optional fallback)
export const WS_URLS = ["wss://framelink-signaling.fly.dev"];

// Optional: Fallback-URL, falls gewünscht
export const FALLBACK_WS_URL = "";

// TURN-Server-Konfiguration
export const TURN_CONFIG = {
  username: "18dd3dc42100ea8643228a68",
  credential: "9u70h1tuJ9YA0ONB",
  servers: [
    // STUN Servers (funktionieren laut Logs)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },

    // 🔴 METERED TURN (deine aktuellen - scheinen nicht zu funktionieren)
    {
      urls: "turn:global.relay.metered.ca:3478?transport=udp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=udp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },

    // 🔴 ZUSÄTZLICHE KOSTENLOSE TURN-SERVER (als Backup)
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },

    // 🔴 WEITERE BACKUP TURN-SERVER
    {
      urls: "turn:numb.viagenie.ca",
      username: "webrtc@live.com",
      credential: "muazkh",
    },
    {
      urls: "turn:relay.backups.cz",
      username: "webrtc",
      credential: "webrtc",
    },
  ],
};

// Debug-Flag
export const DEBUG = true;
