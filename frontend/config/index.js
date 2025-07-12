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
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "turn:global.relay.metered.ca:3478?transport=udp" },
    { urls: "turns:global.relay.metered.ca:443?transport=udp" },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp" },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp" },
    { urls: "turn:global.relay.metered.ca:80" },
  ],
};

// Debug-Flag
export const DEBUG = false;
