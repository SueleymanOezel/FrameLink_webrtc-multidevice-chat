// ================================================================
// 📱 SIMPLIFIED APP.JS - Back to Working Architecture
// ================================================================
// Simplified from complex frameLink to basic global variables
// Based on the old working version but with enhanced TURN config
// Status: SIMPLIFIED & PRODUCTION READY
// ================================================================

console.log("🚀 FrameLink loading (simplified version)...");

// ================================================================
// 🌐 ENHANCED TURN CONFIGURATION
// ================================================================

const TURN_CONFIG = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
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

// ================================================================
// 🌐 WEBSOCKET CONFIGURATION
// ================================================================

const WS_URLS = [
  "wss://framelink-signaling.fly.dev",
  "ws://localhost:3000", // Local fallback
];

// ================================================================
// 🔧 SIMPLE GLOBAL VARIABLES (like old version)
// ================================================================

let localStream;
let peerConnection;
let socket;
let cameraEnabled = true;
let micEnabled = true;

// DOM Elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startCall");
const statusDiv = document.getElementById("status") || createStatusDiv();
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const endCallBtn = document.getElementById("endCallBtn");

// ================================================================
// 🛠️ UTILITY FUNCTIONS
// ================================================================

// Create status div if not present
function createStatusDiv() {
  const div = document.createElement("div");
  div.id = "status";
  div.style.cssText = `
    padding: 10px; margin: 10px; background: #f0f0f0; 
    border: 1px solid #ccc; border-radius: 4px;
    font-family: Arial, sans-serif; font-size: 14px;
  `;
  document.body.insertBefore(div, document.body.firstChild);
  return div;
}

// Simple logging function
function log(message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[FrameLink ${timestamp}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// Status display
function showStatus(message, color = "black") {
  log(message);
  statusDiv.textContent = message;
  statusDiv.style.color = color;
}

// ================================================================
// 🌐 WEBSOCKET CONNECTION (simplified)
// ================================================================

async function connectWebSocket() {
  showStatus("Connecting to server...", "blue");

  // Try each WebSocket URL
  for (const wsUrl of WS_URLS) {
    try {
      log(`🔌 Trying: ${wsUrl}`);

      socket = new WebSocket(wsUrl);
      window.socket = socket; // Global access for simple-room.js

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("Connection timeout"));
        }, 5000);

        socket.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Connection failed"));
        };
      });

      // Setup message handler
      setupSocketHandlers();

      showStatus("Connected to server!", "green");
      startBtn.disabled = false;

      // Notify other systems
      if (window.frameLink?.events) {
        window.frameLink.events.dispatchEvent(
          new CustomEvent("websocket-ready")
        );
      }

      log(`✅ Connected to: ${wsUrl}`);
      return;
    } catch (error) {
      log(`❌ Failed: ${wsUrl} - ${error.message}`);
    }
  }

  // All URLs failed
  showStatus("Connection failed!", "red");
  startBtn.disabled = true;

  // Auto-retry after 3 seconds
  setTimeout(connectWebSocket, 3000);
}

function setupSocketHandlers() {
  socket.onmessage = async (event) => {
    try {
      // Handle Blob data
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }

      const message = JSON.parse(data);

      // Simple WebRTC message handling
      switch (message.type) {
        case "offer":
          await handleOffer(message);
          break;
        case "answer":
          await handleAnswer(message);
          break;
        case "ice":
          await handleIceCandidate(message);
          break;
        case "ping":
          socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          break;
      }

      // Emit for other systems (simple-room.js etc.)
      if (window.frameLink?.events) {
        window.frameLink.events.dispatchEvent(
          new CustomEvent("websocket-message", {
            detail: { message, raw: data },
          })
        );
      }
    } catch (error) {
      // Ignore non-JSON messages
    }
  };

  socket.onclose = () => {
    showStatus("Connection lost", "orange");
    startBtn.disabled = true;
    window.socket = null;

    // Auto-reconnect
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (error) => {
    log("❌ WebSocket error:", error);
    showStatus("Connection error!", "red");
  };
}

// ================================================================
// 📹 MEDIA MANAGEMENT (simplified)
// ================================================================

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    // Set global access
    window.localStream = localStream;

    // Update video elements
    localVideo.srcObject = localStream;

    // Also set localRoomVideo for room system
    const localRoomVideo = document.getElementById("localRoomVideo");
    if (localRoomVideo) {
      localRoomVideo.srcObject = localStream;
    }

    showStatus("Camera ready", "green");
    log("📹 Local media initialized");
    return true;
  } catch (error) {
    showStatus("Camera error: " + error.message, "red");
    log("❌ Media error:", error);
    return false;
  }
}

function toggleCamera() {
  if (!localStream) return;

  cameraEnabled = !cameraEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled;
  });

  toggleCameraBtn.textContent = cameraEnabled
    ? "📹 Camera On"
    : "📹 Camera Off";
  showStatus(`Camera ${cameraEnabled ? "enabled" : "disabled"}`, "blue");
}

function toggleMicrophone() {
  if (!localStream) return;

  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });

  toggleMicBtn.textContent = micEnabled ? "🎤 Mic On" : "🎤 Mic Off";
  showStatus(`Microphone ${micEnabled ? "enabled" : "disabled"}`, "blue");
}

// ================================================================
// 🏭 PEERCONNECTION CREATION (enhanced)
// ================================================================

function createPeerConnection() {
  const config = {
    iceServers: TURN_CONFIG.iceServers,
    iceTransportPolicy: "all",
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  peerConnection = new RTCPeerConnection(config);
  window.peerConnection = peerConnection; // Global access

  // Add local stream if available
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    log("📹 Remote stream received");
    remoteVideo.srcObject = event.streams[0];
    showStatus("Connection established!", "green");
  };

  // Connection state monitoring
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    log(`🔗 Connection state: ${state}`);
    showStatus(`Connection: ${state}`, "blue");

    if (state === "connected") {
      log("🎉 WebRTC connection successful!");
    } else if (state === "failed" || state === "disconnected") {
      showStatus("Connection lost - please restart", "orange");
    }
  };

  // ICE candidate handling with TURN logging
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      const candidate = event.candidate;

      // Enhanced logging for TURN debugging
      if (candidate.type === "relay") {
        log(
          `🎉 TURN relay found: ${candidate.address}:${candidate.port} (${candidate.protocol})`
        );
      } else if (candidate.type === "srflx") {
        log(`📡 STUN candidate: ${candidate.address}:${candidate.port}`);
      } else if (candidate.type === "host") {
        log(`🏠 Host candidate: ${candidate.address}`);
      }

      // Send candidate
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "ice",
            candidate: event.candidate,
          })
        );
      }
    } else {
      log("🔚 ICE gathering complete");
    }
  };

  log("🏭 PeerConnection created");
  return peerConnection;
}

// ================================================================
// 📞 CALL MANAGEMENT (simplified but enhanced)
// ================================================================

async function startCall() {
  log("🚀 Starting call...");

  // Room system integration - check if we're in a multi-device room
  if (window.multiDeviceRoom?.isInRoom()) {
    const roomDeviceCount =
      window.multiDeviceRoom?.getConnectedDevices()?.length + 1 || 1;
    const hasCamera = window.multiDeviceRoom?.hasCamera();

    log(
      `📱 Multi-device room detected: ${roomDeviceCount} devices, hasCamera: ${hasCamera}`
    );

    if (roomDeviceCount > 1) {
      // Multi-device room logic
      if (hasCamera) {
        log("✅ Has camera control - starting call");
      } else {
        showStatus("⚠️ Need camera control to start call", "orange");
        setTimeout(() => showStatus("Ready", "green"), 3000);
        return;
      }
    }
  }

  try {
    // Enable call control buttons
    toggleCameraBtn.disabled = false;
    toggleMicBtn.disabled = false;
    endCallBtn.disabled = false;

    // Ensure media is ready
    if (!localStream) {
      if (!(await initMedia())) return;
    }

    // Close existing connection
    if (peerConnection) {
      log("🔄 Closing existing connection");
      peerConnection.close();
      peerConnection = null;
    }

    // Create new connection
    createPeerConnection();

    // Create offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peerConnection.setLocalDescription(offer);

    // Send offer
    socket.send(
      JSON.stringify({
        type: "offer",
        offer: offer,
      })
    );

    showStatus("Call started...", "blue");
    log("📤 Call offer sent");

    // Notify other systems
    if (window.frameLink?.events) {
      window.frameLink.events.dispatchEvent(new CustomEvent("call-started"));
    }
  } catch (error) {
    log("❌ Call start error:", error);
    showStatus("Call failed: " + error.message, "red");
  }
}

async function handleOffer(message) {
  log("📥 Handling incoming call offer");

  // Room system check - only camera controllers handle external offers
  if (window.multiDeviceRoom?.isInRoom()) {
    const hasCamera = window.multiDeviceRoom?.hasCamera();
    if (!hasCamera) {
      log("📥 External offer ignored - not camera controller");
      return;
    }
    log("📥 External offer accepted - I'm camera controller");
  }

  try {
    // Close existing connection
    if (peerConnection) {
      peerConnection.close();
    }

    createPeerConnection();

    await peerConnection.setRemoteDescription(message.offer);

    // Ensure local stream is available
    if (!localStream) {
      await initMedia();
      // Add tracks to connection
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.send(
      JSON.stringify({
        type: "answer",
        answer: answer,
      })
    );

    showStatus("Incoming call accepted", "green");
    log("📤 Answer sent");

    // Enable controls
    toggleCameraBtn.disabled = false;
    toggleMicBtn.disabled = false;
    endCallBtn.disabled = false;
  } catch (error) {
    log("❌ Offer handling error:", error);
    showStatus("Call failed", "red");
  }
}

async function handleAnswer(message) {
  log("📥 Handling call answer");

  if (peerConnection) {
    try {
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(message.answer);
        log("✅ Answer processed");
      } else {
        log(`⚠️ Wrong state for answer: ${peerConnection.signalingState}`);
      }
    } catch (error) {
      log("❌ Answer processing error:", error);
    }
  }
}

async function handleIceCandidate(message) {
  if (peerConnection && message.candidate) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(message.candidate)
      );
      log("✅ ICE candidate added");
    } catch (error) {
      log("❌ ICE candidate error:", error);
    }
  }
}

function endCall() {
  log("📞 Ending call");

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
    window.peerConnection = null;
  }

  remoteVideo.srcObject = null;
  showStatus("Call ended", "red");

  // Reset buttons
  startBtn.disabled = false;
  toggleCameraBtn.disabled = true;
  toggleMicBtn.disabled = true;
  endCallBtn.disabled = true;

  // Notify other systems
  if (window.frameLink?.events) {
    window.frameLink.events.dispatchEvent(new CustomEvent("call-ended"));
  }
}

// ================================================================
// 🔧 BACKWARD COMPATIBILITY & INTEGRATION
// ================================================================

// Simple frameLink object for integration with simple-room.js
window.frameLink = window.frameLink || {
  events: new EventTarget(),

  core: {
    initialized: true,
    webSocketReady: false,
    localStream: null,
    currentCall: null,
  },

  api: {
    startCall: startCall,
    endCall: endCall,
    toggleCamera: toggleCamera,
    toggleMicrophone: toggleMicrophone,
    createPeerConnection: createPeerConnection,
    sendMessage: (message) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      return false;
    },
    getState: () => ({
      localStream: localStream,
      currentCall: peerConnection,
      webSocketReady: socket && socket.readyState === WebSocket.OPEN,
    }),
    isReady: () => socket && socket.readyState === WebSocket.OPEN,
  },

  log: log,
};

// Global function exports for backward compatibility
window.startCall = startCall;
window.endCall = endCall;
window.toggleCamera = toggleCamera;
window.toggleMicrophone = toggleMicrophone;

// ================================================================
// 🚀 INITIALIZATION
// ================================================================

window.addEventListener("load", async () => {
  log("🚀 Initializing FrameLink...");

  try {
    // Initialize media first
    await initMedia();

    // Connect WebSocket
    await connectWebSocket();

    // Setup UI
    setupUI();

    // Mark as ready
    window.frameLink.core.webSocketReady = true;
    window.frameLink.core.localStream = localStream;

    // Notify other systems
    window.frameLink.events.dispatchEvent(new CustomEvent("core-ready"));

    log("✅ FrameLink ready!");
  } catch (error) {
    log("❌ Initialization failed:", error);
    showStatus("Initialization failed", "red");
  }
});

function setupUI() {
  // Main call button
  if (startBtn) {
    startBtn.addEventListener("click", startCall);
  }

  // Camera toggle
  if (toggleCameraBtn) {
    toggleCameraBtn.addEventListener("click", toggleCamera);
  }

  // Microphone toggle
  if (toggleMicBtn) {
    toggleMicBtn.addEventListener("click", toggleMicrophone);
  }

  // End call
  if (endCallBtn) {
    endCallBtn.addEventListener("click", endCall);
  }

  showStatus("Initializing...", "blue");
}

// ================================================================
// 🔧 DEBUG TOOLS
// ================================================================

window.frameLinkDebug = {
  status: () => ({
    socket: socket?.readyState,
    localStream: !!localStream,
    peerConnection: peerConnection?.connectionState,
    cameraEnabled,
    micEnabled,
  }),

  testCall: () => startCall(),

  checkTurn: async () => {
    log("🧪 Testing TURN connectivity...");

    const pc = new RTCPeerConnection({ iceServers: TURN_CONFIG.iceServers });
    let turnFound = false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        resolve(turnFound);
      }, 8000);

      pc.onicecandidate = (event) => {
        if (event.candidate?.type === "relay") {
          turnFound = true;
          log(
            `✅ TURN working: ${event.candidate.address}:${event.candidate.port}`
          );
          clearTimeout(timeout);
          pc.close();
          resolve(true);
        }
      };

      pc.createDataChannel("test");
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    });
  },

  getStats: async () => {
    if (peerConnection) {
      const stats = await peerConnection.getStats();
      const candidates = [];

      stats.forEach((report) => {
        if (
          report.type === "local-candidate" ||
          report.type === "remote-candidate"
        ) {
          candidates.push({
            type: report.type,
            candidateType: report.candidateType,
            address: report.address || report.ip,
            port: report.port,
            protocol: report.protocol,
          });
        }
      });

      console.table(candidates);
      return candidates;
    }
    return null;
  },
};

log("✅ Simplified app.js loaded - Phase 2 Complete");
