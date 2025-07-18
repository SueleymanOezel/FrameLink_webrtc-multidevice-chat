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
    // STUN Servers
    { urls: "stun:stun.relay.metered.ca:80" }, // NEU: Metered STUN
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },

    // METERED TURN mit NEUEN URLs
    {
      urls: "turn:standard.relay.metered.ca:80",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turn:standard.relay.metered.ca:80?transport=tcp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turn:standard.relay.metered.ca:443",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
    {
      urls: "turns:standard.relay.metered.ca:443?transport=tcp",
      username: "18dd3dc42100ea8643228a68",
      credential: "9u70h1tuJ9YA0ONB",
    },
  ],
};

// Debug-Flag
export const DEBUG = true;
