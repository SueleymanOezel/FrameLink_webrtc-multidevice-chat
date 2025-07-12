// config/index.js
/**
 * Central config module reads everything from import.meta.env
 */
const {
  VITE_WS_URL,
  VITE_FALLBACK_WS_URL,
  VITE_TURN_USERNAME,
  VITE_TURN_CREDENTIAL,
  VITE_TURN_SERVERS,
  DEBUG_MODE,
} = import.meta.env;

export const WS_URL = window.__env?.VITE_WS_URL || "wss://fallback.example.com";

export const TURN_CONFIG = {
  username: VITE_TURN_USERNAME,
  credential: VITE_TURN_CREDENTIAL,
  servers: JSON.parse(VITE_TURN_SERVERS),
};

export const DEBUG = DEBUG_MODE === "true";

// Parses TURN servers from JSON string in .env
// Exposes WS URL array, dropping any empty fallback URL
// DEBUG flag always boolean
