// ================================================================
// 🚀 ENHANCED APP.JS - PHASE 1 COMPLETE
// ================================================================
// Responsibilities: Core WebRTC, TURN Config, PeerConnection Factory, Events
// Integrates: websocket-debug-fix.js + unified architecture
// Status: PRODUCTION READY
// ================================================================

console.log("🚀 FrameLink Core System loading...");

// ================================================================
// 🏗️ GLOBAL FRAMELINK SYSTEM
// ================================================================

window.frameLink = {
  // Core state management
  core: {
    initialized: false,
    webSocketReady: false,
    localStream: null,
    currentCall: null,
    debug: DEBUG,
  },

  // Event system for inter-module communication
  events: new EventTarget(),

  // Modules will register here
  modules: {},

  // Public API
  api: {},
};

// ================================================================
// 🌐 UNIFIED TURN CONFIGURATION
// ================================================================

import { WS_URLS, TURN_CONFIG, DEBUG } from "./config/index.js";

// ================================================================
// 🏭 PEERCONNECTION FACTORY
// ================================================================

class PeerConnectionFactory {
  static create(options = {}) {
    const defaultConfig = {
      iceServers: TURN_CONFIG.servers,
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 15,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };

    const config = { ...defaultConfig, ...options };
    const peerConnection = new RTCPeerConnection(defaultConfig);

    // Enhanced logging for all connections
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate;
        frameLink.log(
          `🔗 ICE Candidate: ${candidate.type} ${candidate.protocol}`,
          candidate.address
        );

        if (candidate.type === "relay") {
          frameLink.log(`🎉 TURN RELAY found!`, {
            address: candidate.address,
            port: candidate.port,
            protocol: candidate.protocol,
          });
        } else if (candidate.type === "srflx") {
          frameLink.log(`📡 STUN candidate found`, {
            address: candidate.address,
            port: candidate.port,
          });
        } else if (candidate.type === "host") {
          frameLink.log(`🏠 Host candidate found`, {
            address: candidate.address,
          });
        }

        // Emit event for other modules to handle
        frameLink.events.dispatchEvent(
          new CustomEvent("ice-candidate", {
            detail: { candidate: event.candidate, peerConnection },
          })
        );
      } else {
        frameLink.log("🔚 ICE gathering complete");
        // 🔴 DEBUG: Log ICE gathering stats
        setTimeout(() => {
          const stats = peerConnection.getStats();
          stats.then((report) => {
            let relayCount = 0;
            let stunCount = 0;
            let hostCount = 0;

            report.forEach((stat) => {
              if (stat.type === "local-candidate") {
                if (stat.candidateType === "relay") relayCount++;
                else if (stat.candidateType === "srflx") stunCount++;
                else if (stat.candidateType === "host") hostCount++;
              }
            });

            frameLink.log(
              `📊 ICE Statistics: ${relayCount} TURN, ${stunCount} STUN, ${hostCount} HOST`
            );

            if (relayCount === 0) {
              frameLink.log(
                "⚠️ No TURN candidates found - NAT traversal may fail!"
              );
            }
          });
        }, 1000);
      }
    };

    // Connection state monitoring
    peerConnection.onconnectionstatechange = () => {
      frameLink.log(`🔗 Connection State: ${peerConnection.connectionState}`);

      frameLink.events.dispatchEvent(
        new CustomEvent("connection-state-change", {
          detail: {
            state: peerConnection.connectionState,
            peerConnection,
          },
        })
      );

      if (peerConnection.connectionState === "connected") {
        frameLink.log("🎉 WebRTC Connection established!");
      } else if (peerConnection.connectionState === "failed") {
        frameLink.log("❌ WebRTC Connection failed!");
      }
    };

    // ICE connection state monitoring
    peerConnection.oniceconnectionstatechange = () => {
      frameLink.log(`🧊 ICE State: ${peerConnection.iceConnectionState}`);

      if (peerConnection.iceConnectionState === "connected") {
        frameLink.log("🎉 NAT Traversal successful!");
      } else if (peerConnection.iceConnectionState === "failed") {
        frameLink.log("❌ NAT Traversal failed!");
      }
    };

    // Remote stream handling
    peerConnection.ontrack = (event) => {
      frameLink.log("📹 Remote stream received", event.streams.length);

      frameLink.events.dispatchEvent(
        new CustomEvent("remote-stream", {
          detail: { streams: event.streams, peerConnection },
        })
      );
    };

    frameLink.log("🏭 PeerConnection created", config);
    return peerConnection;
  }
}

// ================================================================
// 🌐 ENHANCED WEBSOCKET MANAGER
// ================================================================

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.heartbeatInterval = null;
  }

  async connect() {
    const urls = this.getWebSocketURLs();

    for (const url of urls) {
      try {
        frameLink.log(`🔌 Attempting connection: ${url}`);
        const socket = await this.attemptConnection(url);

        this.socket = socket;
        this.setupSocketHandlers();
        this.startHeartbeat();

        window.socket = socket; // Backward compatibility
        frameLink.core.webSocketReady = true;

        frameLink.events.dispatchEvent(
          new CustomEvent("websocket-ready", {
            detail: { socket },
          })
        );

        frameLink.log(`✅ WebSocket connected: ${url}`);
        return socket;
      } catch (error) {
        frameLink.log(`❌ Connection failed: ${url}`, error.message);
      }
    }

    throw new Error("All WebSocket URLs failed");
  }

  getWebSocketURLs() {
    return WS_URLS;
  }

  attemptConnection(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Connection timeout"));
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        resolve(socket);
      };

      socket.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  setupSocketHandlers() {
    this.socket.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }

      try {
        const message = JSON.parse(data);

        // Emit event for other modules
        frameLink.events.dispatchEvent(
          new CustomEvent("websocket-message", {
            detail: { message, raw: data },
          })
        );

        // Handle core WebRTC messages
        this.handleCoreMessage(message);
      } catch (error) {
        frameLink.log("📥 Non-JSON message received", data);
      }
    };

    this.socket.onclose = (event) => {
      frameLink.log(`🔌 WebSocket closed: ${event.code}`, event.reason);
      frameLink.core.webSocketReady = false;

      if (
        !event.wasClean &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.scheduleReconnect();
      }

      frameLink.events.dispatchEvent(
        new CustomEvent("websocket-closed", {
          detail: { event },
        })
      );
    };

    this.socket.onerror = (error) => {
      frameLink.log("❌ WebSocket error", error);
      frameLink.events.dispatchEvent(
        new CustomEvent("websocket-error", {
          detail: { error },
        })
      );
    };
  }

  handleCoreMessage(message) {
    const { type } = message;

    switch (type) {
      case "offer":
        this.handleOffer(message);
        break;
      case "answer":
        this.handleAnswer(message);
        break;
      case "ice":
        this.handleIceCandidate(message);
        break;
      case "ping":
        this.sendMessage({ type: "pong", timestamp: Date.now() });
        break;
      default:
        // Let other modules handle via events
        break;
    }
  }

  async handleOffer(message) {
    frameLink.log("📥 Handling offer");

    // 🔴 NEUE LOGIK: Unterscheide Room vs External Offers
    if (message.roomId && message.toDeviceId && message.fromDeviceId) {
      frameLink.log("📥 Room offer detected - delegating to room system");
      // Room offers werden von simple-room.js behandelt, nicht hier
      return;
    }

    // 🔴 NEUE PRÜFUNG: Bin ich in einem Room?
    if (window.roomState?.inRoom && window.roomState?.roomId) {
      // Wenn ich in einem Room bin, prüfe ob ich der aktive Controller bin
      if (!window.roomState?.hasCamera) {
        frameLink.log(
          "📥 External offer received but I'm not camera controller - ignoring"
        );
        return;
      }
      frameLink.log(
        "📥 External offer received - I'm camera controller, proceeding"
      );
    }

    try {
      // 🔴 GLARE HANDLING: If we already have a call, handle glare situation
      if (frameLink.core.currentCall) {
        const currentState = frameLink.core.currentCall.signalingState;
        frameLink.log(`⚠️ Glare detected! Current state: ${currentState}`);

        // If we're in the middle of making a call, close current and start fresh
        if (currentState === "have-local-offer") {
          frameLink.log("🔄 Resolving glare - closing current connection");
          frameLink.core.currentCall.close();
          frameLink.core.currentCall = null;
        } else if (currentState !== "stable") {
          frameLink.log(
            `⚠️ Ignoring offer - connection in state: ${currentState}`
          );
          return;
        }
      }

      // 🔴 EXTERNAL CALL: Create fresh external call connection
      frameLink.log("📥 Creating external call connection");
      frameLink.core.currentCall = PeerConnectionFactory.create();
      await this.setupLocalStream();

      const pc = frameLink.core.currentCall;

      // Ensure connection is in stable state
      if (pc.signalingState !== "stable") {
        frameLink.log(
          `⚠️ New connection not stable: ${pc.signalingState} - aborting`
        );
        return;
      }

      await pc.setRemoteDescription(message.offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendMessage({
        type: "answer",
        answer: answer,
      });

      frameLink.events.dispatchEvent(
        new CustomEvent("call-started", {
          detail: { type: "incoming", peerConnection: pc },
        })
      );

      frameLink.log("✅ Incoming call established successfully");
    } catch (error) {
      frameLink.log("❌ Error handling offer:", error);

      // Clean up on error
      if (frameLink.core.currentCall) {
        frameLink.core.currentCall.close();
        frameLink.core.currentCall = null;
      }
    }
  }

  async handleAnswer(message) {
    frameLink.log("📥 Handling answer");

    if (frameLink.core.currentCall) {
      await frameLink.core.currentCall.setRemoteDescription(message.answer);
    }
  }

  async handleIceCandidate(message) {
    if (frameLink.core.currentCall && message.candidate) {
      try {
        await frameLink.core.currentCall.addIceCandidate(
          new RTCIceCandidate(message.candidate)
        );
        frameLink.log("✅ ICE candidate added");
      } catch (error) {
        frameLink.log("❌ ICE candidate error", error);
      }
    }
  }

  sendMessage(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    frameLink.log("❌ Cannot send message - WebSocket not ready");
    return false;
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({ type: "ping", timestamp: Date.now() });
    }, 30000);
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    frameLink.log(
      `🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        frameLink.log("❌ Reconnection failed", error);
      });
    }, delay);
  }

  async setupLocalStream() {
    if (!frameLink.core.localStream) {
      try {
        frameLink.core.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        const localVideo = document.getElementById("localVideo");
        if (localVideo) {
          localVideo.srcObject = frameLink.core.localStream;
        }

        frameLink.events.dispatchEvent(
          new CustomEvent("local-stream-ready", {
            detail: { stream: frameLink.core.localStream },
          })
        );

        frameLink.log("📹 Local stream ready");
      } catch (error) {
        frameLink.log("❌ Local stream error", error);
        throw error;
      }
    }

    // Add tracks to current call
    if (frameLink.core.currentCall && frameLink.core.localStream) {
      frameLink.core.localStream.getTracks().forEach((track) => {
        frameLink.core.currentCall.addTrack(track, frameLink.core.localStream);
      });
    }
  }
}

// ================================================================
// 📱 MEDIA MANAGER
// ================================================================

class MediaManager {
  constructor() {
    this.localStream = null;
    this.cameraEnabled = true;
    this.micEnabled = true;
  }

  async initializeMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      frameLink.core.localStream = this.localStream;

      // Update UI
      const localVideo = document.getElementById("localVideo");
      const localRoomVideo = document.getElementById("localRoomVideo");

      if (localVideo) localVideo.srcObject = this.localStream;
      if (localRoomVideo) localRoomVideo.srcObject = this.localStream;

      frameLink.events.dispatchEvent(
        new CustomEvent("media-ready", {
          detail: { stream: this.localStream },
        })
      );

      frameLink.log("📹 Media initialized");
      return this.localStream;
    } catch (error) {
      frameLink.log("❌ Media initialization failed", error);
      throw error;
    }
  }

  toggleCamera() {
    if (this.localStream) {
      this.cameraEnabled = !this.cameraEnabled;
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = this.cameraEnabled;
      });

      frameLink.events.dispatchEvent(
        new CustomEvent("camera-toggled", {
          detail: { enabled: this.cameraEnabled },
        })
      );

      frameLink.log(`📹 Camera ${this.cameraEnabled ? "enabled" : "disabled"}`);
    }
  }

  toggleMicrophone() {
    if (this.localStream) {
      this.micEnabled = !this.micEnabled;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = this.micEnabled;
      });

      frameLink.events.dispatchEvent(
        new CustomEvent("microphone-toggled", {
          detail: { enabled: this.micEnabled },
        })
      );

      frameLink.log(
        `🎤 Microphone ${this.micEnabled ? "enabled" : "disabled"}`
      );
    }
  }
}

// ================================================================
// 🎮 CALL MANAGER
// ================================================================

class CallManager {
  constructor(webSocketManager, mediaManager) {
    this.webSocketManager = webSocketManager;
    this.mediaManager = mediaManager;
    this.currentCall = null;
  }

  async startCall() {
    frameLink.log("🚀 Starting call...");

    try {
      // 🔴 MASTER CALL: Check if we're in a room with multiple devices
      if (
        window.roomState &&
        window.roomState.inRoom &&
        window.roomState.roomDeviceCount > 1
      ) {
        frameLink.log("📞 MASTER CALL: Starting room-wide external call");

        // This is a master call - notify all room devices
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.initiateMasterCall();
          return; // Let the master call handle the actual WebRTC setup
        }
      }

      // 🔴 GLARE PREVENTION: Close existing connection if any
      if (frameLink.core.currentCall) {
        const currentState = frameLink.core.currentCall.signalingState;
        frameLink.log(`🔄 Closing existing call (state: ${currentState})`);
        frameLink.core.currentCall.close();
        frameLink.core.currentCall = null;

        // Small delay to ensure cleanup
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Ensure media is ready
      if (!frameLink.core.localStream) {
        await this.mediaManager.initializeMedia();
      }

      // Create peer connection
      this.currentCall = PeerConnectionFactory.create();
      frameLink.core.currentCall = this.currentCall;

      // Add local stream
      frameLink.core.localStream.getTracks().forEach((track) => {
        this.currentCall.addTrack(track, frameLink.core.localStream);
      });

      // Create and send offer
      const offer = await this.currentCall.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.currentCall.setLocalDescription(offer);

      this.webSocketManager.sendMessage({
        type: "offer",
        offer: offer,
      });

      frameLink.events.dispatchEvent(
        new CustomEvent("call-started", {
          detail: { type: "outgoing", peerConnection: this.currentCall },
        })
      );

      frameLink.log("📤 Call offer sent");
    } catch (error) {
      frameLink.log("❌ Error starting call:", error);

      // Clean up on error
      if (this.currentCall) {
        this.currentCall.close();
        this.currentCall = null;
        frameLink.core.currentCall = null;
      }

      throw error;
    }
  }

  endCall() {
    frameLink.log("📞 Ending call...");

    if (this.currentCall) {
      try {
        // Close the peer connection
        this.currentCall.close();
        frameLink.log("🔌 PeerConnection closed");
      } catch (error) {
        frameLink.log("⚠️ Error closing PeerConnection:", error);
      }

      this.currentCall = null;
      frameLink.core.currentCall = null;

      // Clear remote video
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo) {
        remoteVideo.srcObject = null;
      }

      frameLink.events.dispatchEvent(
        new CustomEvent("call-ended", {
          detail: {},
        })
      );

      frameLink.log("✅ Call ended successfully");
    } else {
      frameLink.log("ℹ️ No active call to end");
    }
  }

  async startSingleDeviceCall() {
    frameLink.log("🚀 Starting single device call (from room)...");

    try {
      // Close existing connection if any
      if (frameLink.core.currentCall) {
        frameLink.core.currentCall.close();
        frameLink.core.currentCall = null;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Ensure media is ready
      if (!frameLink.core.localStream) {
        await this.mediaManager.initializeMedia();
      }

      // Create peer connection
      this.currentCall = PeerConnectionFactory.create();
      frameLink.core.currentCall = this.currentCall;

      // 🔴 WICHTIG: Clone the stream for external call
      const externalStream = frameLink.core.localStream.clone();

      // Add cloned stream to call
      externalStream.getTracks().forEach((track) => {
        this.currentCall.addTrack(track, externalStream);
      });

      // Create and send offer
      const offer = await this.currentCall.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.currentCall.setLocalDescription(offer);

      // 🔴 WICHTIG: Markiere die Message NICHT mit roomId
      this.webSocketManager.sendMessage({
        type: "offer",
        offer: offer,
        // Kein roomId hier!
      });

      frameLink.events.dispatchEvent(
        new CustomEvent("call-started", {
          detail: { type: "outgoing", peerConnection: this.currentCall },
        })
      );

      frameLink.log("📤 Single device call offer sent");
    } catch (error) {
      frameLink.log("❌ Error starting single device call:", error);
      throw error;
    }
  }
}

// ================================================================
// 🔧 CORE SYSTEM INITIALIZATION
// ================================================================

class FrameLinkCore {
  constructor() {
    this.webSocketManager = new WebSocketManager();
    this.mediaManager = new MediaManager();
    this.callManager = new CallManager(
      this.webSocketManager,
      this.mediaManager
    );

    this.setupEventListeners();
  }

  async initialize() {
    frameLink.log("🚀 Initializing FrameLink Core...");

    try {
      // 🔴 TURN-Server Test hinzufügen
      this.testTurnConnectivity();

      // Initialize media first
      await this.mediaManager.initializeMedia();

      // Connect WebSocket
      await this.webSocketManager.connect();

      // Setup UI
      this.setupUI();

      frameLink.core.initialized = true;
      frameLink.events.dispatchEvent(new CustomEvent("core-ready"));

      frameLink.log("✅ FrameLink Core initialized successfully");
    } catch (error) {
      frameLink.log("❌ Core initialization failed", error);
      throw error;
    }
  }

  // 🔴 NEUE TURN-TEST METHODE
  async testTurnConnectivity() {
    frameLink.log("🧪 Testing TURN connectivity...");

    try {
      const pc = new RTCPeerConnection({ iceServers: TURN_CONFIG.servers });

      let turnFound = false;
      let stunFound = false;

      const testPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pc.close();
          resolve({ turnFound, stunFound });
        }, 8000); // 8 second timeout

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate;

            if (candidate.type === "relay") {
              turnFound = true;
              frameLink.log(
                `✅ TURN server working: ${candidate.address}:${candidate.port}`
              );
            } else if (candidate.type === "srflx") {
              stunFound = true;
              frameLink.log(
                `✅ STUN server working: ${candidate.address}:${candidate.port}`
              );
            }

            // If we found TURN, we're good
            if (turnFound) {
              clearTimeout(timeout);
              pc.close();
              resolve({ turnFound, stunFound });
            }
          }
        };

        // Create a data channel to trigger ICE gathering
        pc.createDataChannel("test");
        pc.createOffer().then((offer) => {
          pc.setLocalDescription(offer);
        });
      });

      const result = await testPromise;

      if (result.turnFound) {
        frameLink.log("🎉 TURN connectivity test PASSED");
      } else if (result.stunFound) {
        frameLink.log(
          "⚠️ Only STUN working - TURN may be needed for some networks"
        );
      } else {
        frameLink.log(
          "❌ No TURN/STUN connectivity - NAT traversal will likely fail"
        );
      }

      // Make result available globally
      window.turnTestResult = result;
    } catch (error) {
      frameLink.log("❌ TURN test failed:", error);
    }
  }

  setupEventListeners() {
    // Handle remote streams
    frameLink.events.addEventListener("remote-stream", (event) => {
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo && event.detail.streams[0]) {
        remoteVideo.srcObject = event.detail.streams[0];
        frameLink.log("📹 Remote video connected");
      }
    });

    // Handle ICE candidates from factory
    frameLink.events.addEventListener("ice-candidate", (event) => {
      this.webSocketManager.sendMessage({
        type: "ice",
        candidate: event.detail.candidate,
      });
    });
  }

  setupUI() {
    // Main call button
    const startBtn = document.getElementById("startCall");
    if (startBtn) {
      startBtn.disabled = false; // 🔴 Enable by default
      startBtn.addEventListener("click", () => {
        // 🔴 NEUE LOGIK: Prüfe ob Room-Call oder normaler Call
        if (window.roomState && window.roomState.inRoom) {
          if (
            window.roomState.hasCamera ||
            window.roomState.roomDeviceCount === 1
          ) {
            frameLink.log("📞 Starting room-based call");
            this.callManager.startCall();
          } else {
            frameLink.log("⚠️ No camera control - cannot start call");
            // Zeige Benutzer-Feedback
            this.updateStatus("⚠️ Please take camera control first", "orange");
            setTimeout(() => {
              this.updateStatus("FrameLink Core ready", "green");
            }, 3000);
          }
        } else {
          frameLink.log("📞 Starting normal call");
          this.callManager.startCall();
        }
      });
    }

    // Mic toggle
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    if (toggleMicBtn) {
      toggleMicBtn.disabled = false;
      toggleMicBtn.addEventListener("click", () => {
        this.mediaManager.toggleMicrophone();
        toggleMicBtn.textContent = this.mediaManager.micEnabled
          ? "🎤 Mic On"
          : "🎤 Mic Off";
      });
    }

    // End call button
    const endCallBtn = document.getElementById("endCallBtn");
    if (endCallBtn) {
      endCallBtn.disabled = false;
      endCallBtn.addEventListener("click", () => this.callManager.endCall());
    }

    // Status updates
    this.updateStatus("FrameLink Core ready");
  }

  updateStatus(message, color = "green") {
    const statusDiv = document.getElementById("status");
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.style.color = color;
    }
  }
}

// ================================================================
// 🔧 LOGGING SYSTEM
// ================================================================

frameLink.log = function (message, data = null) {
  if (!frameLink.core.debug) return;

  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[FrameLink ${timestamp}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

// ================================================================
// 🚀 PUBLIC API
// ================================================================

frameLink.api = {
  // Core functions
  startCall: () => frameLink.core.instance?.callManager.startCall(),
  endCall: () => frameLink.core.instance?.callManager.endCall(),

  // Media controls
  toggleCamera: () => frameLink.core.instance?.mediaManager.toggleCamera(),
  toggleMicrophone: () =>
    frameLink.core.instance?.mediaManager.toggleMicrophone(),

  // PeerConnection factory
  createPeerConnection: (options) => PeerConnectionFactory.create(options),

  // WebSocket
  sendMessage: (message) =>
    frameLink.core.instance?.webSocketManager.sendMessage(message),

  // State
  getState: () => frameLink.core,
  isReady: () => frameLink.core.initialized && frameLink.core.webSocketReady,

  // Events
  on: (event, handler) => frameLink.events.addEventListener(event, handler),
  off: (event, handler) => frameLink.events.removeEventListener(event, handler),
  emit: (event, detail) =>
    frameLink.events.dispatchEvent(new CustomEvent(event, { detail })),
};

// ================================================================
// 🚀 AUTO-INITIALIZATION
// ================================================================

window.addEventListener("load", async () => {
  frameLink.log("🚀 FrameLink loading...");

  frameLink.core.instance = new FrameLinkCore();

  try {
    await frameLink.core.instance.initialize();
    frameLink.log("✅ FrameLink ready!");

    // Backward compatibility
    window.startCall = frameLink.api.startCall;
    window.endCall = frameLink.api.endCall;
    window.toggleCamera = frameLink.api.toggleCamera;
    window.toggleMicrophone = frameLink.api.toggleMicrophone;
  } catch (error) {
    frameLink.log("❌ FrameLink initialization failed", error);
  }
});

// ================================================================
// 📊 DEBUG TOOLS
// ================================================================

window.frameLinkDebug = {
  status: () => frameLink.api.getState(),
  test: () => frameLink.api.startCall(),
  logs: () => console.log("Use frameLink.log() for logging"),
  events: () => frameLink.events,
  api: () => frameLink.api,

  // 🔴 NEUE DEBUG FUNKTIONEN
  testTurn: async () => {
    console.log("🧪 Testing TURN connectivity...");
    if (frameLink.core.instance) {
      await frameLink.core.instance.testTurnConnectivity();
    } else {
      console.log("❌ FrameLink not initialized yet");
    }
  },

  checkConnection: () => {
    const call = frameLink.core.currentCall;
    if (call) {
      console.log("📊 Current call state:", {
        signalingState: call.signalingState,
        connectionState: call.connectionState,
        iceConnectionState: call.iceConnectionState,
        iceGatheringState: call.iceGatheringState,
      });
    } else {
      console.log("ℹ️ No active call");
    }
  },

  getStats: async () => {
    const call = frameLink.core.currentCall;
    if (call) {
      const stats = await call.getStats();
      const candidates = [];
      const connections = [];

      stats.forEach((report) => {
        if (
          report.type === "local-candidate" ||
          report.type === "remote-candidate"
        ) {
          candidates.push({
            type: report.type,
            candidateType: report.candidateType,
            ip: report.ip,
            port: report.port,
            protocol: report.protocol,
          });
        } else if (
          report.type === "candidate-pair" &&
          report.state === "succeeded"
        ) {
          connections.push({
            localCandidateId: report.localCandidateId,
            remoteCandidateId: report.remoteCandidateId,
            state: report.state,
            bytesReceived: report.bytesReceived,
            bytesSent: report.bytesSent,
          });
        }
      });

      console.log("📊 WebRTC Statistics:");
      console.table(candidates);
      console.table(connections);

      return { candidates, connections };
    } else {
      console.log("ℹ️ No active call for stats");
      return null;
    }
  },
};

frameLink.log("✅ Enhanced app.js loaded - Phase 1 Complete");
