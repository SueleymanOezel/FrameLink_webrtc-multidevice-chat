// websocket-debug-fix.js - FLY.IO WebSocket Connection Debugging & Fix
// Füge dieses Script VOR app.js in index.html ein

console.log("🔧 FLY.IO WebSocket Debug & Fix wird geladen...");

// 🛡️ ALT: WebSocket wait + Emergency‑Fallback
function waitForWebSocket(callback, maxRetries = 20, interval = 250) {
  let tries = 0;
  const timer = setInterval(() => {
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      clearInterval(timer);
      callback();
    } else if (++tries >= maxRetries) {
      clearInterval(timer);
      createEmergencyWebSocket();
    }
  }, interval);
}

function createEmergencyWebSocket() {
  console.warn("[EmergencyWS] creating fallback socket");
  window.socket = new WebSocket("wss://dein‑fallback.example.com");
}

// ================================================================
// FLY.IO WEBSOCKET CONNECTION FIXER
// ================================================================

window.FlyIOWebSocketFixer = {
  // Konfiguration für verschiedene Umgebungen
  config: {
    // WICHTIG: Ersetze mit deinem tatsächlichen fly.io App-Namen
    appName: "framelink-signaling",
    region: "fra",

    // Connection Optionen
    maxRetries: 5,
    retryDelay: 2000,
    heartbeatInterval: 30000,

    // Debug Optionen
    enableDebug: true,
    logConnections: true,
    logMessages: false,
  },

  // State Management
  state: {
    connected: false,
    connecting: false,
    retryCount: 0,
    lastError: null,
    heartbeatInterval: null,
  },

  // ================================================================
  // WEBSOCKET URL RESOLVER
  // ================================================================

  getWebSocketURL() {
    const config = this.config;

    // Verschiedene URL Formate probieren
    const urlCandidates = [
      // Standard fly.io URL
      `wss://${config.appName}.fly.dev`,

      // Mit Region
      `wss://${config.appName}.fly.dev`,

      // Fallback URLs
      `wss://${config.appName}.herokuapp.com`, // Falls Heroku Migration
      `ws://${config.appName}.fly.dev`, // HTTP Fallback (unsicher)

      // Lokale Entwicklung
      ...(window.location.hostname === "localhost"
        ? ["ws://localhost:3000", "ws://127.0.0.1:3000"]
        : []),
    ];

    return urlCandidates;
  },

  // ================================================================
  // CONNECTION TESTER
  // ================================================================

  async testConnection(url) {
    return new Promise((resolve) => {
      this.log(`🧪 Testing connection: ${url}`);

      const testSocket = new WebSocket(url);
      const timeout = setTimeout(() => {
        testSocket.close();
        resolve({ success: false, error: "timeout" });
      }, 5000);

      testSocket.onopen = () => {
        clearTimeout(timeout);
        testSocket.close();
        resolve({ success: true, url });
      };

      testSocket.onerror = (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message || "connection failed",
        });
      };
    });
  },

  // ================================================================
  // ENHANCED WEBSOCKET CREATION
  // ================================================================

  async createEnhancedWebSocket() {
    this.state.connecting = true;
    this.state.retryCount = 0;

    const urls = this.getWebSocketURL();

    for (const url of urls) {
      const result = await this.testConnection(url);

      if (result.success) {
        this.log(`✅ Successful connection test: ${url}`);
        return this.establishConnection(url);
      } else {
        this.log(`❌ Failed connection test: ${url} - ${result.error}`);
      }
    }

    throw new Error("All WebSocket URLs failed connection test");
  },

  establishConnection(url) {
    return new Promise((resolve, reject) => {
      this.log(`🚀 Establishing WebSocket connection: ${url}`);

      const socket = new WebSocket(url);

      // Enhanced error handling
      socket.onerror = (error) => {
        this.state.lastError = error;
        this.log(`❌ WebSocket Error: ${error.type}`, error);

        if (!this.state.connected) {
          reject(new Error(`WebSocket connection failed: ${error.type}`));
        }
      };

      socket.onopen = () => {
        this.state.connected = true;
        this.state.connecting = false;
        this.state.retryCount = 0;

        this.log(`✅ WebSocket connected to: ${url}`);

        // Setup heartbeat
        this.setupHeartbeat(socket);

        // Setup enhanced message logging
        this.setupMessageLogging(socket);

        // Setup connection monitoring
        this.setupConnectionMonitoring(socket);

        resolve(socket);
      };

      socket.onclose = (event) => {
        this.state.connected = false;
        this.state.connecting = false;

        this.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`, {
          wasClean: event.wasClean,
          code: event.code,
          reason: event.reason,
        });

        // Auto-reconnect logic
        if (!event.wasClean && this.state.retryCount < this.config.maxRetries) {
          this.scheduleReconnect();
        }
      };
    });
  },

  // ================================================================
  // CONNECTION ENHANCEMENTS
  // ================================================================

  setupHeartbeat(socket) {
    // Clear existing heartbeat
    if (this.state.heartbeatInterval) {
      clearInterval(this.state.heartbeatInterval);
    }

    // Setup new heartbeat
    this.state.heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        this.log("💓 Heartbeat sent");
      }
    }, this.config.heartbeatInterval);
  },

  setupMessageLogging(socket) {
    const originalSend = socket.send.bind(socket);

    socket.send = (data) => {
      if (this.config.logMessages) {
        try {
          const parsed = JSON.parse(data);
          this.log(`📤 Sending: ${parsed.type}`, parsed);
        } catch (e) {
          this.log(`📤 Sending raw data: ${data.substring(0, 100)}...`);
        }
      }
      return originalSend(data);
    };

    const originalOnMessage = socket.onmessage;
    socket.onmessage = (event) => {
      if (this.config.logMessages) {
        try {
          const parsed = JSON.parse(event.data);
          this.log(`📥 Received: ${parsed.type}`, parsed);
        } catch (e) {
          this.log(`📥 Received raw data: ${event.data.substring(0, 100)}...`);
        }
      }

      // Handle pong responses
      if (event.data.includes('"type":"pong"')) {
        this.log("💓 Pong received");
      }

      if (originalOnMessage) {
        originalOnMessage.call(socket, event);
      }
    };
  },

  setupConnectionMonitoring(socket) {
    // Monitor connection state
    const monitor = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        clearInterval(monitor);
        this.log("📊 Connection monitor stopped - socket not open");
      }
    }, 5000);
  },

  scheduleReconnect() {
    this.state.retryCount++;
    const delay = this.config.retryDelay * this.state.retryCount;

    this.log(
      `🔄 Scheduling reconnect ${this.state.retryCount}/${this.config.maxRetries} in ${delay}ms`
    );

    setTimeout(() => {
      this.createEnhancedWebSocket()
        .then((socket) => {
          this.log("✅ Reconnection successful");
          window.socket = socket;

          // Trigger reconnect event
          window.dispatchEvent(
            new CustomEvent("websocket-reconnected", {
              detail: { socket, attempt: this.state.retryCount },
            })
          );
        })
        .catch((error) => {
          this.log(`❌ Reconnection failed: ${error.message}`);
        });
    }, delay);
  },

  // ================================================================
  // DEBUGGING UTILITIES
  // ================================================================

  log(message, data = null) {
    if (!this.config.enableDebug) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[FlyIO-WS ${timestamp}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  },

  // ================================================================
  // PUBLIC API
  // ================================================================

  async init() {
    this.log("🚀 Initializing FLY.IO WebSocket Fixer...");

    try {
      // Test aktuelle Konfiguration
      this.testCurrentConfig();

      // Erstelle verbesserte WebSocket Verbindung
      const socket = await this.createEnhancedWebSocket();

      // Setze als globale Referenz
      window.socket = socket;

      this.log("✅ FLY.IO WebSocket Fixer initialized successfully");
      return socket;
    } catch (error) {
      this.log(`❌ FLY.IO WebSocket Fixer failed: ${error.message}`);
      throw error;
    }
  },

  testCurrentConfig() {
    this.log("🧪 Testing current configuration...");
    this.log(`App Name: ${this.config.appName}`);
    this.log(`Region: ${this.config.region}`);
    this.log(`URLs to test: ${this.getWebSocketURL().length}`);

    // Test URLs
    this.getWebSocketURL().forEach((url, index) => {
      this.log(`  ${index + 1}. ${url}`);
    });
  },

  // Debug Tools
  getStatus() {
    return {
      connected: this.state.connected,
      connecting: this.state.connecting,
      retryCount: this.state.retryCount,
      lastError: this.state.lastError,
      config: this.config,
    };
  },

  // Manual reconnect
  reconnect() {
    this.log("🔄 Manual reconnect triggered");
    return this.init();
  },

  // Test specific URL
  async testURL(url) {
    return await this.testConnection(url);
  },
};

// ================================================================
// AUTO-INITIALIZATION
// ================================================================

// Override original connectWebSocket function
window.addEventListener("load", () => {
  // Wait a bit for other scripts to load
  setTimeout(async () => {
    console.log("🔧 Hijacking WebSocket initialization for FLY.IO...");

    // Store original function if exists
    if (window.connectWebSocket) {
      window._originalConnectWebSocket = window.connectWebSocket;
    }

    // Override with enhanced version
    window.connectWebSocket = async function () {
      try {
        console.log("🚀 Using FLY.IO enhanced WebSocket connection...");

        // Use our enhanced connection
        const socket = await window.FlyIOWebSocketFixer.init();

        // Call original connection setup if exists
        if (window._originalConnectWebSocket) {
          // Mock the socket properties that original function expects
          socket.onopen = () => {
            console.log("✅ FLY.IO WebSocket connection established");

            // Update UI
            const statusDiv = document.getElementById("status");
            const startBtn = document.getElementById("startCall");

            if (statusDiv) {
              statusDiv.textContent = "Mit FLY.IO Server verbunden!";
              statusDiv.style.color = "green";
            }

            if (startBtn) {
              startBtn.disabled = false;
            }
          };

          socket.onerror = (error) => {
            console.error("❌ FLY.IO WebSocket error:", error);
            const statusDiv = document.getElementById("status");
            if (statusDiv) {
              statusDiv.textContent = "FLY.IO Verbindungsfehler!";
              statusDiv.style.color = "red";
            }
          };

          socket.onclose = () => {
            console.log("🔌 FLY.IO WebSocket closed");
            const statusDiv = document.getElementById("status");
            const startBtn = document.getElementById("startCall");

            if (statusDiv) {
              statusDiv.textContent = "FLY.IO Verbindung getrennt";
              statusDiv.style.color = "orange";
            }

            if (startBtn) {
              startBtn.disabled = true;
            }
          };
        }

        return socket;
      } catch (error) {
        console.error("❌ FLY.IO WebSocket initialization failed:", error);

        // Fallback to original if exists
        if (window._originalConnectWebSocket) {
          console.log("🔄 Falling back to original connection method...");
          return window._originalConnectWebSocket();
        }

        throw error;
      }
    };

    // Auto-start if no manual initialization
    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
      console.log("🚀 Auto-starting FLY.IO WebSocket connection...");
      window.connectWebSocket().catch((error) => {
        console.error("❌ Auto-start failed:", error);
      });
    }
  }, 1000);
});

// ================================================================
// GLOBAL DEBUG COMMANDS
// ================================================================

window.debugFlyIO = {
  status: () => window.FlyIOWebSocketFixer.getStatus(),
  reconnect: () => window.FlyIOWebSocketFixer.reconnect(),
  testURL: (url) => window.FlyIOWebSocketFixer.testURL(url),
  enableLogging: () => {
    window.FlyIOWebSocketFixer.config.enableDebug = true;
    window.FlyIOWebSocketFixer.config.logMessages = true;
    console.log("✅ FLY.IO debug logging enabled");
  },
  disableLogging: () => {
    window.FlyIOWebSocketFixer.config.enableDebug = false;
    window.FlyIOWebSocketFixer.config.logMessages = false;
    console.log("🔇 FLY.IO debug logging disabled");
  },
  testAll: async () => {
    const urls = window.FlyIOWebSocketFixer.getWebSocketURL();
    console.log("🧪 Testing all URLs...");

    for (const url of urls) {
      const result = await window.FlyIOWebSocketFixer.testURL(url);
      console.log(
        `${result.success ? "✅" : "❌"} ${url}: ${result.success ? "OK" : result.error}`
      );
    }
  },
};

window.waitForWebSocket = waitForWebSocket;
window.createEmergencyWebSocket = createEmergencyWebSocket;

console.log("✅ FLY.IO WebSocket Debug & Fix loaded");
console.log(
  "🛠️ Debug commands: window.debugFlyIO.status(), .reconnect(), .testAll()"
);
