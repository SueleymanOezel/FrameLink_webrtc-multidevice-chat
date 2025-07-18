// ================================================================
// 🏠 ENHANCED SIMPLE-ROOM.JS - PHASE 2 COMPLETE
// ================================================================
// Responsibilities: Multi-Device Room, Face Detection, Room Video Streaming
// Integrates: room-video-streaming.js + face-detection.js + original logic
// Uses: frameLink.api from enhanced app.js
// Status: PRODUCTION READY
// ================================================================

console.log("🏠 Enhanced Room System loading...");

// ================================================================
// 🏗️ ROOM SYSTEM STATE MANAGEMENT
// ================================================================

window.frameLink = window.frameLink || { events: new EventTarget(), api: {} };

const roomState = {
  // Room Management
  roomId: null,
  deviceId: null,
  inRoom: false,
  isLocalRoom: false,

  // Device Management
  connectedDevices: new Map(),
  roomDeviceCount: 1,

  // Camera Control
  hasCamera: false,
  amCurrentCameraMaster: false,

  // Call State
  callActiveWithExternal: false,

  // Room Video Streaming
  roomPeerConnections: new Map(),
  roomVideoStreams: new Map(),
  isRoomVideoActive: false,

  // Face Detection
  faceDetectionStates: new Map(),
  detectionCanvases: new Map(),
  detectionContexts: new Map(),
  canvasToDeviceMap: new Map(),
  isMediaPipeInitialized: false,
  faceDetection: null,

  // Performance & Caching
  lastLoggedStates: new Map(),
  activeDetections: 0,
  processingQueue: new Map(),
};

// ================================================================
// 🚪 ROOM INITIALIZATION & URL HANDLING
// ================================================================

class RoomManager {
  constructor() {
    this.initializeRoom();
    this.setupEventListeners();
  }

  initializeRoom() {
    // Extract room ID from URL
    const params = new URLSearchParams(window.location.search);
    let roomId = params.get("room");

    if (!roomId) {
      roomId = "room-" + Math.random().toString(36).substr(2, 8);
      window.history.replaceState({}, "", "?room=" + roomId);
      roomState.isLocalRoom = true;
      this.updateRoomUI(roomId);
    }

    roomState.roomId = roomId;

    // Generate/get device ID
    const deviceId = window.deviceId || Math.random().toString(36).substr(2, 6);
    window.deviceId = deviceId;
    roomState.deviceId = deviceId;

    this.updateDeviceIdUI(deviceId);

    frameLink.log(`🏠 Room initialized: ${roomId}, Device: ${deviceId}`);
  }

  updateRoomUI(roomId) {
    const roomUrlInput = document.getElementById("room-url");
    if (roomUrlInput) {
      roomUrlInput.value = window.location.href;
    }

    const roomInfoSection = document.getElementById("room-info-section");
    if (roomInfoSection) {
      roomInfoSection.style.display = "block";
    }
  }

  updateDeviceIdUI(deviceId) {
    const deviceIdElement = document.getElementById("device-id");
    if (deviceIdElement) {
      deviceIdElement.textContent = deviceId;
    }
  }

  setupEventListeners() {
    // Join room button
    const joinRoomBtn = document.getElementById("join-room");
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener("click", () => this.joinRoom());
    }

    // Take camera button
    const takeCameraBtn = document.getElementById("take-camera");
    if (takeCameraBtn) {
      takeCameraBtn.addEventListener("click", () =>
        this.requestCameraControl()
      );
    }

    // Listen to frameLink events
    frameLink.events.addEventListener("websocket-ready", () => {
      frameLink.log("🏠 WebSocket ready - Room system can connect");
      setTimeout(() => this.updateJoinRoomButtonState(), 100);
    });

    // Periodic button state check (every 2 seconds)
    setInterval(() => {
      this.updateJoinRoomButtonState();
    }, 2000);

    // Initial button state check (delayed to allow frameLink to load)
    setTimeout(() => this.updateJoinRoomButtonState(), 1000);

    // 🔴 NEU: Setup external call handling
    this.setupExternalCallHandling();
  }

  async initiateMasterCall() {
    frameLink.log("📞 Initiating MASTER CALL for room");

    // 🔴 CRITICAL: Prevent room disconnection during external calls
    roomState.callActiveWithExternal = true;

    // 1. Determine which device should handle the external WebRTC connection
    const streamingDevice = this.determineExternalStreamDevice();

    // 2. Notify all room devices about master call AND streaming device
    frameLink.api.sendMessage({
      type: "master-call-start",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      streamingDevice: streamingDevice,
      timestamp: Date.now(),
    });

    // 3. Explicitly set external streaming device for all room devices
    frameLink.api.sendMessage({
      type: "external-stream-device",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      streamingDevice: streamingDevice,
      timestamp: Date.now(),
    });

    // 4. Only the streaming device creates the actual WebRTC connection
    if (streamingDevice === roomState.deviceId) {
      frameLink.log(
        "📞 This device will handle the external WebRTC connection"
      );

      // 🔴 CRITICAL: Wait for other devices to prepare, then start external call
      setTimeout(() => {
        frameLink.core.instance.callManager.startSingleDeviceCall();
      }, 500);
    } else {
      frameLink.log(
        `📞 Device ${streamingDevice} will handle the external WebRTC connection`
      );

      // This device just participates in the master call but doesn't create WebRTC
      this.updateCallStatusInternal("📞 Master call active - participating");
    }
  }

  notifyExternalCallStart() {
    frameLink.log("📞 Notifying room devices about external call start");

    // Send message to all room devices
    frameLink.api.sendMessage({
      type: "room-call-start",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      timestamp: Date.now(),
    });

    // Mark call as active
    roomState.callActiveWithExternal = true;

    // Determine which device should stream to external
    this.determineExternalStreamDevice();
  }

  determineExternalStreamDevice() {
    // Check if we have face detection data
    const devicesWithFaces = Array.from(roomState.faceDetectionStates.entries())
      .filter(([_, state]) => state.hasFace)
      .sort((a, b) => b[1].confidence - a[1].confidence); // Sort by confidence

    let streamingDevice = roomState.deviceId; // Default to current device

    if (devicesWithFaces.length > 0) {
      streamingDevice = devicesWithFaces[0][0]; // Device with highest confidence
      frameLink.log(
        `📞 External stream device: ${streamingDevice} (face detected)`
      );
    } else {
      frameLink.log(
        `📞 External stream device: ${streamingDevice} (fallback - no faces)`
      );
    }

    // Notify room about streaming device
    frameLink.api.sendMessage({
      type: "external-stream-device",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      streamingDevice: streamingDevice,
      timestamp: Date.now(),
    });

    // Update local state
    this.setExternalStreamingDevice(streamingDevice);

    // Return the streaming device
    return streamingDevice;
  }

  setExternalStreamingDevice(deviceId) {
    const isMyDevice = deviceId === roomState.deviceId;

    if (isMyDevice) {
      frameLink.log("📞 This device will stream to external call");
      // WICHTIG: Aktiviere tracks nur für externes Call, nicht room streams
      const currentCall = frameLink.core.currentCall;
      if (currentCall) {
        // Get senders and enable video
        currentCall.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === "video") {
            sender.track.enabled = true;
            frameLink.log(
              `📞 Enabled external video track: ${sender.track.label}`
            );
          }
        });
      }
    } else {
      frameLink.log(
        `📞 Device ${deviceId} will stream to external call (not this device)`
      );
      // WICHTIG: Deaktiviere nur externe Call tracks
      const currentCall = frameLink.core.currentCall;
      if (currentCall) {
        // Disable video for external call only
        currentCall.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === "video") {
            sender.track.enabled = false;
            frameLink.log(
              `📞 Disabled external video track: ${sender.track.label}`
            );
          }
        });
      }
    }

    // WICHTIG: Room streams bleiben IMMER aktiv
    this.ensureRoomStreamsActive();

    // Update UI
    this.updateExternalStreamUI(deviceId);
  }

  ensureRoomStreamsActive() {
    // Make sure room video streams are not affected by external call logic
    frameLink.log("📞 Ensuring room streams remain active");

    // Check all room peer connections and ensure they have video
    roomState.roomPeerConnections.forEach((peerConnection, deviceId) => {
      if (peerConnection && peerConnection.connectionState === "connected") {
        frameLink.log(`📞 Room stream to ${deviceId} is active`);
      }
    });
  }

  updateExternalStreamUI(streamingDevice) {
    const isMyDevice = streamingDevice === roomState.deviceId;
    const statusText = isMyDevice
      ? "📞 Du streamst zu externem Anruf"
      : `📞 ${streamingDevice} streamt zu externem Anruf`;

    // Update UI elements
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = statusText;
    }

    // Update external call status in room video manager
    if (window.roomVideoManager) {
      window.roomVideoManager.updateExternalCallStatus(statusText, isMyDevice);
    }
  }

  updateJoinRoomButtonState() {
    const joinRoomBtn = document.getElementById("join-room");
    if (!joinRoomBtn) {
      console.log("🔘 DEBUG: Join button not found!");
      return;
    }

    const isWebSocketReady = frameLink.api.isReady();
    const isAlreadyInRoom = roomState.inRoom;

    console.log(
      `🔘 DEBUG: updateJoinRoomButtonState - WebSocket=${isWebSocketReady}, InRoom=${isAlreadyInRoom}`
    );

    if (isAlreadyInRoom) {
      joinRoomBtn.disabled = true;
      joinRoomBtn.textContent = "✅ Multi-Device Active";
      joinRoomBtn.style.background = "#4caf50";
      console.log("🔘 DEBUG: Button set to 'Active' state");
    } else if (isWebSocketReady) {
      joinRoomBtn.disabled = false;
      joinRoomBtn.textContent = "🚪 Activate Multi-Device";
      joinRoomBtn.style.background = "#2196f3";
      console.log("🔘 DEBUG: Button set to 'Ready' state");
    } else {
      joinRoomBtn.disabled = true;
      joinRoomBtn.textContent = "⏳ Connecting...";
      joinRoomBtn.style.background = "#ccc";
      console.log("🔘 DEBUG: Button set to 'Connecting' state");
    }

    frameLink.log(
      `🔘 Join button state: WebSocket=${isWebSocketReady}, InRoom=${isAlreadyInRoom}`
    );
  }

  showErrorFeedback(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = "❌ " + message;
      statusElement.style.borderLeftColor = "#f44336";
      statusElement.style.backgroundColor = "#ffebee";
      statusElement.style.color = "#c62828";

      // Clear after 5 seconds
      setTimeout(() => {
        statusElement.style.borderLeftColor = "#2196f3";
        statusElement.style.backgroundColor = "white";
        statusElement.style.color = "#333";
      }, 5000);
    }

    frameLink.log("❌ Error feedback: " + message);
  }

  showSuccessFeedback(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = "✅ " + message;
      statusElement.style.borderLeftColor = "#4caf50";
      statusElement.style.backgroundColor = "#e8f5e8";
      statusElement.style.color = "#2e7d32";

      // Clear after 3 seconds
      setTimeout(() => {
        statusElement.style.borderLeftColor = "#2196f3";
        statusElement.style.backgroundColor = "white";
        statusElement.style.color = "#333";
      }, 3000);
    }

    frameLink.log("✅ Success feedback: " + message);
  }

  async joinRoom() {
    if (!frameLink.api.isReady()) {
      this.showErrorFeedback("Server noch nicht verbunden!");
      return;
    }

    frameLink.log("🚪 Joining multi-device room...");

    // 🔴 EXTERNAL CALL PROTECTION
    const hasExternalCall =
      frameLink.core.currentCall &&
      frameLink.core.currentCall.connectionState === "connected";

    if (hasExternalCall) {
      frameLink.log(
        "📞 External call active - joining room without disturbing call"
      );
      roomState.callActiveWithExternal = true;

      // Markiere als Camera Controller wenn external call aktiv
      roomState.hasCamera = true;
      roomState.amCurrentCameraMaster = true;
      updateCameraStatus("📹 CAMERA ACTIVE (External Call)", "green");
    }

    // Update button to show loading state
    this.updateJoinRoomButtonState();

    // Detect existing call before joining
    this.detectExistingCall();

    // Send join request with error handling
    const message = {
      type: "join-room",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
    };

    frameLink.log("🔍 Sending join-room message:", message);
    console.log(
      "🔍 DEBUG: About to call frameLink.api.sendMessage with:",
      message
    );

    const success = frameLink.api.sendMessage(message);

    console.log("🔍 DEBUG: sendMessage returned:", success);

    // Set up a timeout to check if we get a response
    setTimeout(() => {
      console.log(
        "🔍 DEBUG: 5 seconds after join-room, checking if we got any response..."
      );
      console.log("🔍 DEBUG: roomState.inRoom:", roomState.inRoom);
      console.log("🔍 DEBUG: Connected devices:", roomState.roomDeviceCount);
    }, 5000);

    if (success) {
      roomState.inRoom = true;
      roomState.isLocalRoom = true;

      // Update UI
      this.updateJoinRoomButtonState();

      const roomControls = document.getElementById("room-controls");
      if (roomControls) {
        roomControls.style.display = "block";
      }

      // 🔴 AUTOMATISCHE ERSTE KAMERA-AKTIVIERUNG
      await this.initializeFirstDeviceCamera();

      // Room message handling is setup via RoomMessageHandler class
      // (No need to call setupRoomHandlers - it's automatic via events)

      // Activate room video streaming
      setTimeout(() => {
        frameLink.events.dispatchEvent(
          new CustomEvent("room-joined", {
            detail: { roomId: roomState.roomId, deviceId: roomState.deviceId },
          })
        );
      }, 500);

      frameLink.log("✅ Successfully joined room");
      this.showSuccessFeedback("Multi-Device aktiviert!");
    } else {
      this.showErrorFeedback(
        "Verbindung fehlgeschlagen! Bitte versuche es erneut."
      );
      frameLink.log("❌ Failed to send join-room message");
    }
  }

  requestCameraControl() {
    if (!roomState.inRoom) return;

    frameLink.log("🔄 Requesting camera control");

    const success = frameLink.api.sendMessage({
      type: "camera-request",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
      fromDeviceId: roomState.deviceId,
    });

    if (!success) {
      this.showErrorFeedback("Kamera-Anfrage fehlgeschlagen!");
      frameLink.log("❌ Failed to send camera-request message");
    }
  }

  detectExistingCall() {
    frameLink.log("🔍 Detecting existing call...");

    // Check frameLink core state
    const coreState = frameLink.api.getState();
    if (coreState.currentCall) {
      const state = coreState.currentCall.connectionState;
      frameLink.log(`PeerConnection state: ${state}`);

      if (state === "connected" || state === "connecting") {
        roomState.callActiveWithExternal = true;
        this.updateCallStatusInternal("📞 Existing call detected");

        // Check if local camera is active
        if (coreState.localStream) {
          const videoTracks = coreState.localStream.getVideoTracks();
          const hasActiveVideo = videoTracks.some((track) => track.enabled);

          if (hasActiveVideo) {
            roomState.hasCamera = true;
            roomState.amCurrentCameraMaster = true;
            updateCameraStatus("📹 CAMERA ACTIVE", "green");
          }
        }
      }
    }
  }
  // 🔴 NEU: External Call Handling
  setupExternalCallHandling() {
    // Monitor frameLink call state changes
    frameLink.events.addEventListener("call-started", (event) => {
      frameLink.log("📞 External call started event");
      roomState.callActiveWithExternal = true;

      // Start smart stream switching if multiple devices
      if (roomState.inRoom && roomState.roomDeviceCount > 1) {
        this.determineExternalStreamDevice();
      }

      this.updateCallStatusInternal("📞 External call active");
    });

    frameLink.events.addEventListener("call-ended", (event) => {
      frameLink.log("📞 External call ended event");
      roomState.callActiveWithExternal = false;
      this.updateCallStatusInternal("📞 Call ended");
    });

    // Monitor face detection changes for smart switching
    frameLink.events.addEventListener("face-detection-change", (event) => {
      const { deviceId, hasFace, confidence } = event.detail;

      // If external call is active and we're in a room, check for stream switching
      if (
        roomState.callActiveWithExternal &&
        roomState.inRoom &&
        roomState.roomDeviceCount > 1
      ) {
        this.checkExternalStreamSwitching();
      }
    });
  }

  checkExternalStreamSwitching() {
    // Find device with highest confidence face
    const devicesWithFaces = Array.from(roomState.faceDetectionStates.entries())
      .filter(([_, state]) => state.hasFace)
      .sort((a, b) => b[1].confidence - a[1].confidence);

    if (devicesWithFaces.length > 0) {
      const bestDevice = devicesWithFaces[0][0];

      // Check if this is different from current streaming device
      const currentStreamingDevice = this.getCurrentStreamingDevice();

      if (bestDevice !== currentStreamingDevice) {
        frameLink.log(
          `📞 Switching external stream from ${currentStreamingDevice} to ${bestDevice}`
        );

        // Notify room about new streaming device
        frameLink.api.sendMessage({
          type: "external-stream-device",
          roomId: roomState.roomId,
          fromDeviceId: roomState.deviceId,
          streamingDevice: bestDevice,
          timestamp: Date.now(),
        });

        // Update local state
        this.setExternalStreamingDevice(bestDevice);
      }
    }
  }

  getCurrentStreamingDevice() {
    // Find which device is currently streaming (has video enabled)
    const currentCall = frameLink.core.currentCall;
    if (currentCall && frameLink.core.localStream) {
      const videoTracks = frameLink.core.localStream.getVideoTracks();
      if (videoTracks.length > 0 && videoTracks[0].enabled) {
        return roomState.deviceId;
      }
    }
    return null;
  }

  updateCallStatusInternal(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;
    }
  }

  // 🔴 NEUE METHODEN FÜR AUTOMATISCHE KAMERA-AKTIVIERUNG
  async initializeFirstDeviceCamera() {
    frameLink.log("🎥 Initializing first device camera...");

    try {
      // Warte kurz damit WebSocket-Verbindung stabilisiert ist
      setTimeout(async () => {
        // Prüfe ob wir das erste Gerät im Raum sind
        const isFirstDevice = roomState.roomDeviceCount <= 1;

        if (isFirstDevice) {
          frameLink.log(
            "🎯 First device in room - activating camera automatically"
          );

          // Setze lokalen State
          roomState.hasCamera = true;
          roomState.amCurrentCameraMaster = true;

          // Update UI Status
          updateCameraStatus("📹 CAMERA ACTIVE (First Device)", "green");

          // Stelle sicher dass lokaler Stream aktiv ist
          await this.ensureLocalStreamActive();

          // Benachrichtige andere Systeme
          frameLink.events.dispatchEvent(
            new CustomEvent("camera-control-gained", {
              detail: {
                deviceId: roomState.deviceId,
                reason: "first-device",
                automatic: true,
              },
            })
          );

          frameLink.log("✅ First device camera automatically activated");
        } else {
          frameLink.log("⏸️ Not first device - waiting for camera assignment");
          updateCameraStatus("⏸️ Waiting for camera assignment", "gray");
        }
      }, 1000);
    } catch (error) {
      frameLink.log("❌ Error initializing first device camera:", error);
    }
  }

  async ensureLocalStreamActive() {
    frameLink.log("🔍 Ensuring local stream is active...");

    try {
      // Hole aktuellen Stream vom frameLink core
      const coreState = frameLink.api.getState();

      if (!coreState.localStream) {
        frameLink.log("📹 No local stream found - requesting media");

        // Triggere Media-Initialisierung über frameLink
        if (frameLink.core.instance?.mediaManager) {
          await frameLink.core.instance.mediaManager.initializeMedia();
        } else {
          // Fallback: Direkte Media-Anfrage
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          frameLink.core.localStream = stream;

          // Update video elements
          const localVideo = document.getElementById("localVideo");
          const localRoomVideo = document.getElementById("localRoomVideo");

          if (localVideo) localVideo.srcObject = stream;
          if (localRoomVideo) localRoomVideo.srcObject = stream;
        }
      }

      // Aktiviere Video-Tracks für externe Anrufe
      if (coreState.localStream) {
        coreState.localStream.getVideoTracks().forEach((track) => {
          track.enabled = true;
          frameLink.log(`📹 Enabled video track: ${track.label}`);
        });
      }

      frameLink.log("✅ Local stream is active and enabled");
    } catch (error) {
      frameLink.log("❌ Error ensuring local stream:", error);
      updateCameraStatus("❌ Camera Error", "red");
    }
  }
}

// ================================================================
// 🔴 FEHLENDE GLOBALE FUNKTIONEN HINZUFÜGEN
// ================================================================

function updateCameraStatus(text, color = "black") {
  const statusEl = document.getElementById("camera-status");
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  // Update external call status
  if (window.roomVideoManager) {
    const isActive = text.includes("ACTIVE") || text.includes("CONTROL");
    const deviceName = roomState.deviceId || "Unknown";
    const statusText = isActive
      ? `${deviceName} controls external call`
      : "No active control";
    window.roomVideoManager.updateExternalCallStatus(statusText, isActive);
  }

  frameLink.log(`🎥 Camera Status Update: ${text}`);
}

function updateCallStatus(message) {
  const callInfo = document.getElementById("call-info");
  const callStatus = document.getElementById("call-status");

  if (callInfo && callStatus) {
    callInfo.style.display = "block";
    callStatus.textContent = message;
  }

  frameLink.log(`📞 Call Status Update: ${message}`);
}

// ================================================================
// 📨 ROOM MESSAGE HANDLING
// ================================================================

class RoomMessageHandler {
  constructor(roomVideoManager) {
    this.messageCache = new Map();
    this.roomVideoManager = roomVideoManager;
    this.setupMessageHandling();
  }

  setupMessageHandling() {
    // Listen to WebSocket messages from frameLink
    frameLink.events.addEventListener("websocket-message", (event) => {
      const message = event.detail.message;
      // Only log room-related messages, not ping/pong
      if (
        message.type &&
        [
          "join-room",
          "room-update",
          "room-peer-joined",
          "room-peer-left",
          "camera-request",
          "room-video-offer",
          "room-video-answer",
          "room-video-ice",
        ].includes(message.type)
      ) {
        console.log("📨 DEBUG: Received room message:", message.type, message);
      }
      this.handleMessage(message);
    });
  }

  handleMessage(message) {
    const { type, roomId } = message;

    // Only handle room messages for our room
    if (roomId !== roomState.roomId || !roomState.inRoom) {
      return;
    }

    // Prevent duplicate processing
    if (this.isDuplicateMessage(message)) {
      return;
    }

    frameLink.log(`📨 Room message: ${type}`, message);

    switch (type) {
      case "camera-request":
        this.handleCameraSwitch(message);
        break;
      case "room-update":
        this.handleRoomUpdate(message);
        break;
      case "room-call-start":
        this.handleRoomCallStart(message);
        break;
      case "external-stream-device":
        this.handleExternalStreamDevice(message);
        break;
      case "master-call-start":
        this.handleMasterCallStart(message);
        break;
      case "room-video-offer":
        this.roomVideoManager.handleRoomVideoOffer(message);
        break;
      case "room-video-answer":
        this.roomVideoManager.handleRoomVideoAnswer(message);
        break;
      case "room-video-ice":
        this.roomVideoManager.handleRoomVideoIce(message);
        break;
      case "room-peer-joined":
        this.roomVideoManager.handlePeerJoined(message);
        break;
      case "room-peer-left":
        this.roomVideoManager.handlePeerLeft(message);
        break;
      case "face-detection-update":
        // Delegate to face detection manager
        if (window.enhancedRoomSystem?.faceDetectionManager) {
          window.enhancedRoomSystem.faceDetectionManager.handleFaceDetectionUpdate(
            message
          );
        }
        break;
      // 🔴 NEU: Handle room peer ping
      case "room-peer-ping":
        if (message.toDeviceId === roomState.deviceId) {
          frameLink.log(`🏓 Received ping from ${message.fromDeviceId}`);
          // Ensure we have a connection to the pinger
          this.roomVideoManager.ensureBidirectionalConnection(
            message.fromDeviceId
          );
        }
        break;
    }
  }

  isDuplicateMessage(message) {
    const key = `${message.type}_${message.deviceId || message.targetDevice}_${Date.now().toString().slice(-3)}`;
    const now = Date.now();

    // Cleanup old cache entries
    for (let [cacheKey, timestamp] of this.messageCache.entries()) {
      if (now - timestamp > 2000) {
        this.messageCache.delete(cacheKey);
      }
    }

    if (this.messageCache.has(key)) return true;

    this.messageCache.set(key, now);
    return false;
  }

  handleCameraSwitch(message) {
    const targetDeviceId = message.deviceId;
    const myDeviceId = roomState.deviceId;

    frameLink.log(
      `📹 Camera switch: target=${targetDeviceId}, my=${myDeviceId}`
    );

    if (targetDeviceId === myDeviceId) {
      // ✅ I get camera control
      this.activateCameraControl();
    } else {
      // ❌ Another device gets camera control
      this.deactivateCameraControl(targetDeviceId);
    }

    this.updateExternalCallController(targetDeviceId);
  }

  // 🔴 NEUE KAMERA-KONTROLLE METHODEN
  activateCameraControl() {
    frameLink.log("✅ Activating camera control for this device");

    roomState.hasCamera = true;
    roomState.amCurrentCameraMaster = true;

    // Aktiviere Call-Tracks (wenn externes Call aktiv)
    this.enableExternalCallTracks();

    // 🔴 NEUE LOGIK: Track Replacement bei Manual Switch
    if (roomState.callActiveWithExternal) {
      frameLink.log(
        "📞 External call active - replacing tracks for manual switch"
      );
      setTimeout(() => {
        this.replaceExternalCallTracks(roomState.deviceId);
      }, 300);
    }

    // Update UI
    updateCameraStatus("📹 CAMERA CONTROL ACTIVE", "green");

    // Event für andere Systeme
    frameLink.events.dispatchEvent(
      new CustomEvent("camera-control-gained", {
        detail: {
          deviceId: roomState.deviceId,
          reason: "manual-switch",
        },
      })
    );

    frameLink.log("🎯 Camera control activated successfully");
  }

  deactivateCameraControl(controllingDeviceId) {
    frameLink.log(
      `⏸️ Deactivating camera control - ${controllingDeviceId} takes over`
    );

    roomState.hasCamera = false;
    roomState.amCurrentCameraMaster = false;

    // Deaktiviere nur Call-Tracks, Room-Streams bleiben aktiv
    this.disableExternalCallTracks();

    // Update UI
    updateCameraStatus(`⏸️ ${controllingDeviceId} controls camera`, "gray");

    // Event für andere Systeme
    frameLink.events.dispatchEvent(
      new CustomEvent("camera-control-lost", {
        detail: {
          deviceId: controllingDeviceId,
          previousDevice: roomState.deviceId,
        },
      })
    );
  }

  enableExternalCallTracks() {
    const coreState = frameLink.api.getState();
    const callStream =
      coreState.currentCall?.localStream || coreState.localStream;

    if (callStream) {
      callStream.getVideoTracks().forEach((track) => {
        track.enabled = true;
        frameLink.log(`📹 Enabled external call track: ${track.label}`);
      });
    }

    // Room-Streams bleiben immer aktiv (getrennte Behandlung)
    frameLink.log(
      "✅ External call tracks enabled, room streams remain active"
    );
  }

  disableExternalCallTracks() {
    // Nur deaktivieren wenn externes Call aktiv ist
    if (!roomState.callActiveWithExternal) {
      frameLink.log("ℹ️ No external call active - skipping track disable");
      return;
    }

    const coreState = frameLink.api.getState();
    const callStream =
      coreState.currentCall?.localStream || coreState.localStream;

    if (callStream) {
      // Nur Call-relevante Tracks deaktivieren
      callStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
        frameLink.log(`⏸️ Disabled external call track: ${track.label}`);
      });
    }

    // WICHTIG: Room-Streams bleiben IMMER aktiv
    this.ensureRoomStreamsActive();
  }

  ensureRoomStreamsActive() {
    frameLink.log("🔍 Ensuring room streams remain active...");

    // Check alle Room-Peer-Connections
    roomState.roomPeerConnections.forEach((peerConnection, deviceId) => {
      if (peerConnection && peerConnection.connectionState === "connected") {
        frameLink.log(`✅ Room stream to ${deviceId} is active`);
      }
    });

    // Stelle sicher dass lokales Room-Video weiterhin funktioniert
    const localRoomVideo = document.getElementById("localRoomVideo");
    if (localRoomVideo && !localRoomVideo.srcObject) {
      const coreState = frameLink.api.getState();
      if (coreState.localStream) {
        localRoomVideo.srcObject = coreState.localStream;
        frameLink.log("🔄 Re-attached local room video stream");
      }
    }
  }

  // NEW: Update external call controller display
  updateExternalCallController(controllingDeviceId) {
    // Update room status panel
    if (window.roomVideoManager) {
      window.roomVideoManager.updateRoomStatus(
        controllingDeviceId,
        roomState.isMediaPipeInitialized,
        window.autoCameraSwitching?.isEnabled() || false
      );
    }

    // Update external call status
    const isMyControl = controllingDeviceId === roomState.deviceId;
    const statusText = isMyControl
      ? "You control external call"
      : `${controllingDeviceId} controls external call`;

    if (window.roomVideoManager) {
      window.roomVideoManager.updateExternalCallStatus(statusText, isMyControl);
    }

    frameLink.log(`🎮 External call controller: ${controllingDeviceId}`);
  }

  handleRoomUpdate(message) {
    const devices = message.devices || [];
    const deviceCount = devices.length;
    const previousDeviceCount = roomState.roomDeviceCount;
    roomState.roomDeviceCount = deviceCount;

    // Only log if device count changed
    if (deviceCount !== previousDeviceCount) {
      console.log(
        `📨 Room update: ${deviceCount} devices (was ${previousDeviceCount}):`,
        devices
      );
      frameLink.log(`🏠 Room update: ${deviceCount} devices`, devices);
    }

    // Update UI device count
    if (window.roomVideoManager) {
      window.roomVideoManager.updateDeviceCount();
    }

    // 🔴 FIX: Aktiv mit allen Devices verbinden
    devices.forEach((device) => {
      if (device.deviceId !== roomState.deviceId) {
        // Check if we're already connected
        if (!roomState.roomPeerConnections.has(device.deviceId)) {
          console.log(`📨 Connecting to new device: ${device.deviceId}`);
          frameLink.log(
            `🔍 Discovered new device: ${device.deviceId} - initiating connection`
          );
          // Simulate a peer joined event to trigger connection
          setTimeout(() => {
            this.roomVideoManager.handlePeerJoined({
              deviceId: device.deviceId,
              roomId: roomState.roomId,
            });
          }, Math.random() * 1000); // Random delay to avoid collision
        }
      }
    });
  }

  handleRoomCallStart(message) {
    if (message.fromDeviceId !== roomState.deviceId) {
      frameLink.log("📞 External call started by room device");
      roomState.callActiveWithExternal = true;
      updateCallStatus("📞 External call started");
    }
  }

  handleExternalStreamDevice(message) {
    if (message.fromDeviceId !== roomState.deviceId) {
      frameLink.log(
        `📞 External stream device set to: ${message.streamingDevice}`
      );

      // Update our local state
      if (window.enhancedRoomSystem?.roomManager) {
        window.enhancedRoomSystem.roomManager.setExternalStreamingDevice(
          message.streamingDevice
        );
      }
    }
  }

  handleMasterCallStart(message) {
    if (message.fromDeviceId !== roomState.deviceId) {
      frameLink.log(`📞 Master call started by ${message.fromDeviceId}`);

      // 🔴 CRITICAL: Mark call as active for all devices
      roomState.callActiveWithExternal = true;

      // 🔴 CRITICAL: Set the streaming device if provided
      if (message.streamingDevice) {
        frameLink.log(
          `📞 Master call streaming device: ${message.streamingDevice}`
        );

        // Set streaming device for this room
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.setExternalStreamingDevice(
            message.streamingDevice
          );
        }
      }

      // Update UI to show master call participation
      updateCallStatus("📞 Master call active - participating");

      // Listen for stream switching instructions
      frameLink.log("📞 Waiting for stream switching instructions...");
    }
  }

  initiateCallTakeover() {
    frameLink.log("🔥 Initiating call takeover");

    // Use frameLink API to restart call with new camera
    if (frameLink.api.startCall) {
      setTimeout(() => {
        frameLink.api.startCall();
        updateCallStatus("📞 Call restarted with new camera");
      }, 500);
    }
  }

  updateCameraStatus(text, color = "black") {
    const statusEl = document.getElementById("camera-status");
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color;
    }
  }

  updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;
    }
  }
}

// 🔴 NEUE METHODE: Track Replacement für External Calls
async function replaceExternalCallTracks(newControllerDeviceId) {
  frameLink.log(
    `🔄 Replacing external call tracks: switching to ${newControllerDeviceId}`
  );

  // Prüfe ob external call aktiv ist
  const externalCall = frameLink.core.currentCall;
  if (!externalCall || externalCall.connectionState !== "connected") {
    frameLink.log("ℹ️ No active external call to replace tracks for");
    return;
  }

  try {
    // Hole Stream vom neuen Controller
    let newStream = null;

    if (newControllerDeviceId === roomState.deviceId) {
      // Ich bin der neue Controller - verwende meinen Stream
      newStream = frameLink.core.localStream;
      frameLink.log("📹 Using my local stream for external call");
    } else {
      // Anderes Gerät ist Controller - hole Stream aus room connections
      newStream = roomState.roomVideoStreams.get(newControllerDeviceId);
      frameLink.log(
        `📹 Using stream from room device: ${newControllerDeviceId}`
      );
    }

    if (!newStream) {
      frameLink.log(
        `❌ No stream available from controller: ${newControllerDeviceId}`
      );
      return;
    }

    // Replace video track auf external call
    const videoTrack = newStream.getVideoTracks()[0];
    if (!videoTrack) {
      frameLink.log("❌ No video track in controller stream");
      return;
    }

    // Finde Video Sender in external call
    const videoSender = externalCall
      .getSenders()
      .find((sender) => sender.track && sender.track.kind === "video");

    if (videoSender) {
      await videoSender.replaceTrack(videoTrack);
      frameLink.log(
        `✅ External call video track replaced with ${newControllerDeviceId} stream`
      );

      // Update UI
      this.updateExternalCallUI(newControllerDeviceId);
    } else {
      frameLink.log("❌ No video sender found in external call");
    }
  } catch (error) {
    frameLink.log(`❌ Track replacement failed:`, error);
  }
}

// ================================================================
// 🎥 ROOM VIDEO STREAMING MANAGER
// ================================================================

class RoomVideoManager {
  constructor() {
    this.setupRoomVideo();
    this.peerDiscoveryTimeout = 5000; // 5 seconds for peer discovery
  }

  setupRoomVideo() {
    // Listen to room join events
    frameLink.events.addEventListener("room-joined", () => {
      this.activateRoomVideo();
    });
  }

  activateRoomVideo() {
    frameLink.log("🎥 Activating room video streaming");
    roomState.isRoomVideoActive = true;

    // Set device ID on local video elements FIRST
    this.assignLocalVideoDeviceId();

    // Delayed peer announcement to avoid race conditions
    setTimeout(() => {
      this.announceRoomPeer();
      // Start peer discovery process
      this.startPeerDiscovery();
    }, 1000);
  }

  announceRoomPeer() {
    frameLink.api.sendMessage({
      type: "room-peer-joined",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
      timestamp: Date.now(),
    });
    frameLink.log(`📢 Announced room peer: ${roomState.deviceId}`);
  }

  startPeerDiscovery() {
    frameLink.log("🔍 Starting enhanced peer discovery process");

    // 🔴 EXTERNAL CALL SCHUTZ
    const hasExternalCall =
      frameLink.core.currentCall &&
      frameLink.core.currentCall.connectionState === "connected";

    if (hasExternalCall) {
      frameLink.log("📞 External call detected - careful peer discovery mode");
    }

    // Request list of existing peers
    frameLink.api.sendMessage({
      type: "request-room-peers",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
    });

    // 🔴 SANFTERE PEER DISCOVERY
    this.peerDiscoveryInterval = setInterval(
      () => {
        // Nur re-announce wenn keine kritische Operation läuft
        if (
          !hasExternalCall ||
          Date.now() - (this.lastDiscovery || 0) > 10000
        ) {
          this.announceRoomPeer();
          this.lastDiscovery = Date.now();
        }

        // Check für missing connections - aber weniger aggressiv
        const connectedCount = roomState.roomPeerConnections.size;
        const expectedCount = roomState.roomDeviceCount - 1;

        if (
          connectedCount < expectedCount &&
          Date.now() - (this.lastPeerRequest || 0) > 8000
        ) {
          frameLink.log(
            `⚠️ Missing connections: ${connectedCount}/${expectedCount}`
          );
          frameLink.api.sendMessage({
            type: "request-room-peers",
            roomId: roomState.roomId,
            deviceId: roomState.deviceId,
          });
          this.lastPeerRequest = Date.now();
        }
      },
      hasExternalCall ? 8000 : 5000
    ); // Langsamere Discovery wenn External Call aktiv

    // Set timeout for initial peer discovery
    setTimeout(() => {
      this.completePeerDiscovery();
    }, this.peerDiscoveryTimeout);
  }

  completePeerDiscovery() {
    const connectedPeers = Array.from(roomState.roomPeerConnections.keys());
    frameLink.log(
      `✅ Peer discovery complete. Connected to: ${connectedPeers.length} peers`,
      connectedPeers
    );

    if (connectedPeers.length === 0) {
      frameLink.log("⚠️ No peers discovered - might be first device");
    }
  }

  assignLocalVideoDeviceId() {
    const localVideo = document.getElementById("localVideo");
    const localRoomVideo = document.getElementById("localRoomVideo");

    if (localVideo && !localVideo.dataset.deviceId) {
      localVideo.dataset.deviceId = roomState.deviceId;
    }
    if (localRoomVideo && !localRoomVideo.dataset.deviceId) {
      localRoomVideo.dataset.deviceId = roomState.deviceId;
    }

    frameLink.log(`🔗 Assigned local video device IDs: ${roomState.deviceId}`);
  }

  async handlePeerJoined(message) {
    const remoteDeviceId = message.deviceId;
    if (remoteDeviceId === roomState.deviceId) {
      frameLink.log(`⭕ Ignoring self-announcement: ${remoteDeviceId}`);
      return;
    }

    // 🔴 ERWEITERTE CONNECTION PRÜFUNG
    if (roomState.roomPeerConnections.has(remoteDeviceId)) {
      const existingPc = roomState.roomPeerConnections.get(remoteDeviceId);
      if (
        existingPc.connectionState === "connected" ||
        existingPc.connectionState === "connecting"
      ) {
        frameLink.log(
          `✅ Already connected to: ${remoteDeviceId} (${existingPc.connectionState})`
        );
        return;
      } else {
        frameLink.log(`🔄 Cleaning up failed connection to: ${remoteDeviceId}`);
        existingPc.close();
        roomState.roomPeerConnections.delete(remoteDeviceId);
      }
    }

    // 🔴 RACE CONDITION PREVENTION
    const shouldIOffer = roomState.deviceId < remoteDeviceId;
    if (!shouldIOffer) {
      frameLink.log(
        `🤝 Waiting for offer from ${remoteDeviceId} (they have priority)`
      );
      return;
    }

    frameLink.log(`🚀 Initiating room video connection to: ${remoteDeviceId}`);

    try {
      const peerConnection = frameLink.api.createPeerConnection();
      roomState.roomPeerConnections.set(remoteDeviceId, peerConnection);

      // Add local stream FIRST
      const coreState = frameLink.api.getState();
      if (coreState.localStream) {
        coreState.localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, coreState.localStream);
          frameLink.log(
            `📹 Added track to peer ${remoteDeviceId}: ${track.kind}`
          );
        });
      } else {
        frameLink.log(
          `⚠️ No local stream available for peer ${remoteDeviceId}`
        );
      }

      // Setup event handlers
      this.setupRoomPeerConnectionHandlers(peerConnection, remoteDeviceId);

      // Create and send offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);

      frameLink.api.sendMessage({
        type: "room-video-offer",
        roomId: roomState.roomId,
        fromDeviceId: roomState.deviceId,
        toDeviceId: remoteDeviceId,
        offer: offer,
        timestamp: Date.now(),
      });

      frameLink.log(`📤 Sent room video offer to: ${remoteDeviceId}`);
    } catch (error) {
      frameLink.log(
        `❌ Failed to create peer connection to ${remoteDeviceId}:`,
        error
      );
      roomState.roomPeerConnections.delete(remoteDeviceId);
    }
  }

  async handleRoomVideoOffer(message) {
    if (message.toDeviceId !== roomState.deviceId) {
      frameLink.log(
        `⭕ Offer not for me: ${message.toDeviceId} vs ${roomState.deviceId}`
      );
      return;
    }

    const fromDeviceId = message.fromDeviceId;
    frameLink.log(`📥 Room video offer from: ${fromDeviceId}`);

    try {
      // Check if already connected
      if (roomState.roomPeerConnections.has(fromDeviceId)) {
        frameLink.log(
          `✅ Already connected to ${fromDeviceId} - ignoring offer`
        );
        return;
      }

      const peerConnection = frameLink.api.createPeerConnection();
      roomState.roomPeerConnections.set(fromDeviceId, peerConnection);

      this.setupRoomPeerConnectionHandlers(peerConnection, fromDeviceId);

      // 🔴 SAFETY: Check peer connection state before setting remote description
      if (peerConnection.signalingState === "stable") {
        await peerConnection.setRemoteDescription(message.offer);
      } else {
        frameLink.log(
          `⚠️ Room peer connection in wrong state: ${peerConnection.signalingState} - ignoring offer`
        );
        return;
      }

      // Add local stream
      const coreState = frameLink.api.getState();
      if (coreState.localStream) {
        coreState.localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, coreState.localStream);
          frameLink.log(
            `📹 Added track to peer ${fromDeviceId}: ${track.kind}`
          );
        });
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      frameLink.api.sendMessage({
        type: "room-video-answer",
        roomId: roomState.roomId,
        fromDeviceId: roomState.deviceId,
        toDeviceId: fromDeviceId,
        answer: answer,
        timestamp: Date.now(),
      });

      frameLink.log(`📤 Sent room video answer to: ${fromDeviceId}`);
    } catch (error) {
      frameLink.log(`❌ Failed to handle offer from ${fromDeviceId}:`, error);
      roomState.roomPeerConnections.delete(fromDeviceId);
    }
  }

  async handleRoomVideoAnswer(message) {
    if (message.toDeviceId !== roomState.deviceId) return;

    const fromDeviceId = message.fromDeviceId;
    const peerConnection = roomState.roomPeerConnections.get(fromDeviceId);

    if (peerConnection) {
      try {
        // 🔴 SAFETY: Check peer connection state before setting remote description
        if (peerConnection.signalingState === "have-local-offer") {
          await peerConnection.setRemoteDescription(message.answer);
          frameLink.log(`✅ Room video answer processed from: ${fromDeviceId}`);
        } else {
          frameLink.log(
            `⚠️ Room peer connection in wrong state for answer: ${peerConnection.signalingState} - ignoring answer`
          );
        }
      } catch (error) {
        frameLink.log(
          `❌ Failed to process answer from ${fromDeviceId}:`,
          error
        );
      }
    } else {
      frameLink.log(
        `⚠️ No peer connection found for answer from: ${fromDeviceId}`
      );
    }
  }

  async handleRoomVideoIce(message) {
    if (message.toDeviceId !== roomState.deviceId) return;

    const fromDeviceId = message.fromDeviceId;
    const peerConnection = roomState.roomPeerConnections.get(fromDeviceId);

    if (peerConnection && message.candidate) {
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(message.candidate)
        );
        frameLink.log(`✅ Room ICE candidate added from: ${fromDeviceId}`);
      } catch (error) {
        frameLink.log(
          `❌ Room ICE candidate error from ${fromDeviceId}:`,
          error
        );
      }
    }
  }

  setupRoomPeerConnectionHandlers(peerConnection, remoteDeviceId) {
    // Handle remote streams
    peerConnection.ontrack = (event) => {
      frameLink.log(`📹 Room video stream received from: ${remoteDeviceId}`);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        roomState.roomVideoStreams.set(remoteDeviceId, remoteStream);
        this.addRoomVideoToUI(remoteDeviceId, remoteStream);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate;
        frameLink.log(
          `🔗 ROOM ICE: ${candidate.type} ${candidate.protocol} to ${remoteDeviceId}`
        );

        if (candidate.type === "relay") {
          frameLink.log(`🎉 ROOM TURN RELAY found for ${remoteDeviceId}!`);
        }

        frameLink.api.sendMessage({
          type: "room-video-ice",
          roomId: roomState.roomId,
          fromDeviceId: roomState.deviceId,
          toDeviceId: remoteDeviceId,
          candidate: event.candidate,
          timestamp: Date.now(),
        });
      }
    };

    // 🔴 ERWEITERTE CONNECTION STATE ÜBERWACHUNG
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      frameLink.log(`🔗 Room connection ${remoteDeviceId}: ${state}`);

      if (state === "connected") {
        this.updateRoomDeviceStatus(remoteDeviceId, "connected");
        frameLink.log(
          `🎉 Room video connection established with: ${remoteDeviceId}`
        );

        // 🔴 NEUE LOGIK: Auto-Switch Status Update
        if (
          window.autoCameraSwitching &&
          !autoCameraSwitching.currentControllingDevice
        ) {
          // Wenn noch kein Controller festgelegt, prüfe Face Detection
          setTimeout(() => this.checkInitialCameraController(), 1000);
        }
      } else if (state === "failed" || state === "disconnected") {
        frameLink.log(
          `💥 Room connection failed/disconnected: ${remoteDeviceId}`
        );

        // 🔴 AGGRESSIVE CLEANUP
        this.cleanupFailedConnection(remoteDeviceId);

        // Try to reconnect nach delay - aber nur wenn nicht zu oft
        const lastReconnect = this.lastReconnectAttempt?.[remoteDeviceId] || 0;
        if (Date.now() - lastReconnect > 15000) {
          // Max 1 reconnect pro 15 Sekunden
          setTimeout(() => {
            this.attemptReconnect(remoteDeviceId);
          }, 3000);
        }
      }
    };

    // Ice connection state
    peerConnection.oniceconnectionstatechange = () => {
      frameLink.log(
        `🧊 Room ICE state ${remoteDeviceId}: ${peerConnection.iceConnectionState}`
      );
    };
  }

  // 🔴 NEUE METHODE: Failed Connection Cleanup
  cleanupFailedConnection(deviceId) {
    frameLink.log(`🧹 Cleaning up failed connection: ${deviceId}`);

    // Remove from all state maps
    roomState.roomPeerConnections.delete(deviceId);
    roomState.roomVideoStreams.delete(deviceId);
    roomState.faceDetectionStates.delete(deviceId);

    // Update UI
    if (window.roomVideoManager) {
      window.roomVideoManager.removeRoomDevice(deviceId);
    }

    // Update Auto-Switch wenn nötig
    if (window.autoCameraSwitching?.currentControllingDevice === deviceId) {
      frameLink.log(`🎯 Lost camera controller ${deviceId} - reassigning`);
      this.reassignCameraController();
    }
  }

  // NEW: Attempt to reconnect to failed peer
  attemptReconnect(remoteDeviceId) {
    if (roomState.roomPeerConnections.has(remoteDeviceId)) {
      frameLink.log(`🔄 Attempting to reconnect to: ${remoteDeviceId}`);
      this.removeRoomPeerConnection(remoteDeviceId);

      // Send new peer joined message to trigger reconnection
      setTimeout(() => {
        frameLink.api.sendMessage({
          type: "room-peer-reconnect",
          roomId: roomState.roomId,
          deviceId: roomState.deviceId,
          targetDevice: remoteDeviceId,
        });
      }, 1000);
    }
  }

  addRoomVideoToUI(deviceId, videoStream) {
    frameLink.log(`🖥️ Adding room video to UI: ${deviceId}`);

    // Use existing roomVideoManager from index.html
    if (window.roomVideoManager) {
      window.roomVideoManager.addRoomDevice(
        deviceId,
        videoStream,
        `Device ${deviceId.slice(-4)}`
      );
      window.roomVideoManager.updateDeviceStatus(deviceId, "connected");
    }

    // Set device ID on video element for face detection
    setTimeout(() => {
      const videoElement = document.getElementById(
        `room-video-stream-${deviceId}`
      );
      if (videoElement) {
        videoElement.dataset.deviceId = deviceId;
        frameLink.log(`🔗 Set dataset.deviceId for video: ${deviceId}`);

        // Setup face detection for this video
        if (window.enhancedRoomSystem?.faceDetectionManager) {
          window.enhancedRoomSystem.faceDetectionManager.setupFaceDetectionForVideo(
            videoElement
          );
        }
      }
    }, 500); // Increased delay for UI settling

    // 🔴 NEUE LOGIK: External Call Video Routing
    this.updateExternalCallVideoRouting();
  }

  // 🔴 NEUE METHODE: External Call Video Routing
  updateExternalCallVideoRouting() {
    // Bestimme welches Gerät gerade Camera Control hat
    const activeController =
      window.autoCameraSwitching?.currentControllingDevice ||
      roomState.deviceId;

    // Route Video für External Call
    if (roomState.callActiveWithExternal) {
      let sourceStream = null;

      if (activeController === roomState.deviceId) {
        // Ich bin Controller - verwende local stream
        sourceStream = frameLink.core.localStream;
      } else {
        // Anderer Controller - verwende room stream
        sourceStream = roomState.roomVideoStreams.get(activeController);
      }

      // Update External Video Display (rechte Seite)
      const externalVideo = document.getElementById("remoteVideo");
      if (externalVideo && sourceStream) {
        // Zeige Preview vom aktiven Controller auf externem Video
        const previewTrack = sourceStream.getVideoTracks()[0];
        if (previewTrack) {
          frameLink.log(
            `📺 Routing ${activeController} video to external call preview`
          );
          // Hier könnten wir optional ein Preview zeigen, aber das wäre
          // verwirrend da es nicht der echte externe Stream ist
        }
      }
    }
  }

  updateRoomDeviceStatus(deviceId, status) {
    if (window.roomVideoManager) {
      window.roomVideoManager.updateDeviceStatus(deviceId, status);
    }
  }

  removeRoomPeerConnection(deviceId) {
    frameLink.log(`🗑️ Removing room peer connection: ${deviceId}`);

    const peerConnection = roomState.roomPeerConnections.get(deviceId);
    if (peerConnection) {
      peerConnection.close();
      roomState.roomPeerConnections.delete(deviceId);
    }

    roomState.roomVideoStreams.delete(deviceId);

    if (window.roomVideoManager) {
      window.roomVideoManager.removeRoomDevice(deviceId);
    }
  }

  handlePeerLeft(message) {
    this.removeRoomPeerConnection(message.deviceId);
  }

  // NEW: Handle peer discovery response
  handleRoomPeersResponse(message) {
    frameLink.log(`📋 Received room peers list:`, message.peers);

    message.peers.forEach((peer) => {
      if (
        peer.deviceId !== roomState.deviceId &&
        !roomState.roomPeerConnections.has(peer.deviceId)
      ) {
        frameLink.log(
          `🔍 Discovered peer: ${peer.deviceId} - attempting connection`
        );
        // Trigger connection to discovered peer
        this.handlePeerJoined({ deviceId: peer.deviceId });
      }
    });
  }

  // 🔴 NEU: Bidirectional connection helper
  ensureBidirectionalConnection(remoteDeviceId) {
    // If we already have a connection, don't create another
    if (roomState.roomPeerConnections.has(remoteDeviceId)) {
      frameLink.log(`✅ Already connected to ${remoteDeviceId}`);
      return;
    }

    // FIX: Always create offer from the device with the "lower" ID to avoid conflicts
    const shouldIOffer = roomState.deviceId < remoteDeviceId;

    if (shouldIOffer) {
      frameLink.log(
        `🤝 I (${roomState.deviceId}) will offer to ${remoteDeviceId}`
      );
      this.handlePeerJoined({ deviceId: remoteDeviceId });
    } else {
      frameLink.log(
        `🤝 Waiting for offer from ${remoteDeviceId} to me (${roomState.deviceId})`
      );
      // Send a "ping" to make sure they know about us
      frameLink.api.sendMessage({
        type: "room-peer-ping",
        roomId: roomState.roomId,
        fromDeviceId: roomState.deviceId,
        toDeviceId: remoteDeviceId,
      });
    }
  }

  // 🔴 NEU: Cleanup function
  cleanup() {
    if (this.peerDiscoveryInterval) {
      clearInterval(this.peerDiscoveryInterval);
      this.peerDiscoveryInterval = null;
    }

    // Close all peer connections
    roomState.roomPeerConnections.forEach((pc, deviceId) => {
      frameLink.log(`🔌 Closing connection to ${deviceId}`);
      pc.close();
    });
    roomState.roomPeerConnections.clear();
    roomState.roomVideoStreams.clear();
  }

  // 🔴 NEUE METHODE: Check Initial Camera Controller
  checkInitialCameraController() {
    if (
      window.autoCameraSwitching &&
      !window.autoCameraSwitching.currentControllingDevice
    ) {
      // Prüfe ob ich Face Detection habe
      const myFaceState = roomState.faceDetectionStates.get(roomState.deviceId);
      if (myFaceState?.hasFace && myFaceState?.confidence > 0.7) {
        frameLink.log(
          "🎯 Setting myself as initial camera controller (face detected)"
        );
        window.autoCameraSwitching.currentControllingDevice =
          roomState.deviceId;
        this.activateCameraControl();
      }
    }
  }

  // 🔴 NEUE METHODE: Reassign Camera Controller
  reassignCameraController() {
    if (!window.autoCameraSwitching) return;

    // Finde bestes alternatives Gerät mit Face Detection
    let bestDevice = null;
    let bestConfidence = 0;

    roomState.faceDetectionStates.forEach((state, deviceId) => {
      if (
        state.hasFace &&
        state.confidence > bestConfidence &&
        roomState.roomPeerConnections.has(deviceId)
      ) {
        bestDevice = deviceId;
        bestConfidence = state.confidence;
      }
    });

    if (bestDevice) {
      frameLink.log(`🎯 Reassigning camera controller to: ${bestDevice}`);
      window.autoCameraSwitching.currentControllingDevice = bestDevice;

      // Trigger camera switch
      if (bestDevice === roomState.deviceId) {
        this.activateCameraControl();
      } else {
        this.requestCameraControl(bestDevice);
      }
    } else {
      frameLink.log("⚠️ No suitable camera controller found");
      window.autoCameraSwitching.currentControllingDevice = null;
    }
  }

  // 🔴 NEUE METHODE: Request Camera Control für anderen Device
  requestCameraControl(targetDeviceId) {
    frameLink.api.sendMessage({
      type: "camera-request",
      roomId: roomState.roomId,
      deviceId: targetDeviceId,
      fromDeviceId: roomState.deviceId,
      automatic: true,
      reason: "reassignment",
    });
  }
}

// ================================================================
// 🎭 FACE DETECTION MANAGER
// ================================================================

class FaceDetectionManager {
  constructor() {
    this.initializeFaceDetection();
    this.setupFaceDetectionIntegration();
    this.setupAutoSwitchIntegration(); // NEW: Explicit auto-switch integration
  }

  async initializeFaceDetection() {
    frameLink.log("🎭 Initializing MediaPipe Face Detection...");

    try {
      // Load MediaPipe script if not already loaded
      if (!window.FaceDetection) {
        await this.loadMediaPipeScript();
      }

      // Create Face Detection instance
      roomState.faceDetection = new FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        },
      });

      // Configure face detection
      roomState.faceDetection.setOptions({
        model: "short",
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });

      // Set results handler
      roomState.faceDetection.onResults((results) =>
        this.onFaceDetectionResults(results)
      );

      roomState.isMediaPipeInitialized = true;
      frameLink.log("✅ Face Detection initialized");

      // Start monitoring room videos
      this.startRoomVideoMonitoring();
    } catch (error) {
      frameLink.log("❌ Face Detection initialization failed:", error);
    }
  }

  loadMediaPipeScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  startRoomVideoMonitoring() {
    const roomVideoGrid = document.getElementById("room-video-grid");
    if (!roomVideoGrid) return;

    frameLink.log("👀 Starting room video monitoring for face detection");

    // Monitor for new video elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.classList?.contains("room-video-item")
          ) {
            const videoElement = node.querySelector(".room-video");
            if (videoElement) {
              frameLink.log(`🎥 New room video detected: ${videoElement.id}`);
              setTimeout(
                () => this.setupFaceDetectionForVideo(videoElement),
                1000
              );
            }
          }
        });
      });
    });

    observer.observe(roomVideoGrid, { childList: true, subtree: true });

    // Process existing videos
    const existingVideos = roomVideoGrid.querySelectorAll(".room-video");
    existingVideos.forEach((video) => {
      if (video.srcObject) {
        frameLink.log(`🎥 Existing room video found: ${video.id}`);
        setTimeout(() => this.setupFaceDetectionForVideo(video), 500);
      }
    });
  }

  setupFaceDetectionForVideo(videoElement) {
    if (
      !roomState.isMediaPipeInitialized ||
      !videoElement ||
      !videoElement.srcObject
    ) {
      return;
    }

    const deviceId = this.extractDeviceIdFromVideo(videoElement);
    if (!deviceId) return;

    frameLink.log(`🎭 Setting up face detection for: ${deviceId}`);

    // Create detection canvas
    const canvas = this.createDetectionCanvas(deviceId);
    if (!canvas) return;

    // Initialize face state
    roomState.faceDetectionStates.set(deviceId, {
      hasFace: false,
      confidence: 0,
      lastUpdate: Date.now(),
      videoElement: videoElement,
    });

    // Start detection loop
    this.startFaceDetectionLoop(deviceId);
  }

  extractDeviceIdFromVideo(videoElement) {
    // Try dataset first
    if (videoElement.dataset.deviceId) {
      return videoElement.dataset.deviceId;
    }

    // Try ID pattern matching
    const match = videoElement.id.match(/room-video-stream-(.+)/);
    if (match) return match[1];

    // Local video special case
    if (videoElement.id === "localRoomVideo") {
      const actualDeviceId = roomState.deviceId;
      if (actualDeviceId) {
        videoElement.dataset.deviceId = actualDeviceId;
        return actualDeviceId;
      }
    }

    return null;
  }

  createDetectionCanvas(deviceId) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 180;
      canvas.style.display = "none";
      canvas.id = `face-detection-canvas-${deviceId}`;
      canvas.dataset.deviceId = deviceId;
      canvas._faceDetectionDeviceId = deviceId;

      document.body.appendChild(canvas);

      const context = canvas.getContext("2d");

      roomState.detectionCanvases.set(deviceId, canvas);
      roomState.detectionContexts.set(deviceId, context);
      roomState.canvasToDeviceMap.set(canvas.id, deviceId);

      frameLink.log(`🖼️ Detection canvas created for: ${deviceId}`);
      return canvas;
    } catch (error) {
      frameLink.log(`❌ Canvas creation error:`, error);
      return null;
    }
  }

  startFaceDetectionLoop(deviceId) {
    const processFrame = async () => {
      try {
        // Performance throttling
        if (roomState.activeDetections >= 2 || document.hidden) {
          setTimeout(processFrame, 1200); // Slower when tab not active
          return;
        }

        const state = roomState.faceDetectionStates.get(deviceId);
        const canvas = roomState.detectionCanvases.get(deviceId);
        const context = roomState.detectionContexts.get(deviceId);

        if (!state || !canvas || !context || !state.videoElement) return;

        const video = state.videoElement;
        if (
          video.readyState !== video.HAVE_ENOUGH_DATA ||
          video.videoWidth === 0
        ) {
          setTimeout(processFrame, 800);
          return;
        }

        // Draw frame to canvas
        context.drawImage(video, 0, 0, 240, 180);

        // Process with MediaPipe
        roomState.activeDetections++;
        roomState.processingQueue.set(deviceId, Date.now());

        await roomState.faceDetection.send({
          image: canvas,
          _deviceId: deviceId,
          timestamp: Date.now(),
        });

        // Schedule next frame
        setTimeout(processFrame, 400); // 2.5 FPS for better performance
      } catch (error) {
        roomState.activeDetections = Math.max(
          0,
          roomState.activeDetections - 1
        );
        setTimeout(processFrame, 1600); // Slower retry on error
      }
    };

    // Start with random delay to distribute load
    setTimeout(processFrame, Math.random() * 2000);
  }

  onFaceDetectionResults(results) {
    roomState.activeDetections = Math.max(0, roomState.activeDetections - 1);

    try {
      const canvas = results.image;
      const deviceId = this.findDeviceIdFromCanvas(canvas);

      if (!deviceId) return;

      this.processFaceDetectionResults(deviceId, results);
    } catch (error) {
      // Silent error handling for performance
    }
  }

  findDeviceIdFromCanvas(canvas) {
    // Try multiple methods to find device ID
    if (canvas?._faceDetectionDeviceId) return canvas._faceDetectionDeviceId;
    if (canvas?.dataset?.deviceId) return canvas.dataset.deviceId;
    if (canvas?.id) {
      const deviceId = roomState.canvasToDeviceMap.get(canvas.id);
      if (deviceId) return deviceId;
    }

    // Fallback to processing queue
    const recentProcessing = Array.from(roomState.processingQueue.entries())
      .filter(([_, timestamp]) => Date.now() - timestamp < 1000)
      .sort((a, b) => b[1] - a[1]);

    return recentProcessing.length > 0 ? recentProcessing[0][0] : null;
  }

  processFaceDetectionResults(deviceId, results) {
    const state = roomState.faceDetectionStates.get(deviceId);
    if (!state) return;

    roomState.processingQueue.delete(deviceId);

    const currentTime = Date.now();
    let hasFace = false;
    let maxConfidence = 0;

    if (results?.detections?.length > 0) {
      hasFace = true;
      const detection = results.detections[0];
      maxConfidence =
        detection.score?.[0] || detection.score || detection.confidence || 0.8;
      if (Array.isArray(maxConfidence)) {
        maxConfidence = maxConfidence[0] || 0.8;
      }
    }

    // Only update on significant changes
    const previousHasFace = state.hasFace;
    const significantChange =
      hasFace !== previousHasFace ||
      Math.abs(maxConfidence - state.confidence) > 0.15;

    if (significantChange) {
      state.hasFace = hasFace;
      state.confidence = maxConfidence;
      state.lastUpdate = currentTime;

      // Throttled logging
      const lastLog = roomState.lastLoggedStates.get(`face-${deviceId}`) || 0;
      if (currentTime - lastLog > 10000) {
        frameLink.log(
          `🎭 ${deviceId}: ${hasFace ? "FACE" : "NO FACE"} (${(maxConfidence * 100).toFixed(0)}%)`
        );
        roomState.lastLoggedStates.set(`face-${deviceId}`, currentTime);
      }

      // Update UI
      this.updateFaceDetectionUI(deviceId, hasFace, maxConfidence);

      // 🤖 NEW: Explicit Auto-Switch Integration
      this.triggerAutoSwitchProcessing(deviceId, hasFace, maxConfidence);

      // Notify other systems via events
      frameLink.events.dispatchEvent(
        new CustomEvent("face-detection-change", {
          detail: { deviceId, hasFace, confidence: maxConfidence },
        })
      );

      // Send to other devices via WebSocket
      this.notifyFaceDetectionChange(deviceId, hasFace, maxConfidence);
    }
  }

  updateFaceDetectionUI(deviceId, hasFace, confidence) {
    // Update room video manager
    if (window.roomVideoManager) {
      const status = hasFace ? "face-detected" : "connected";
      const statusText = hasFace
        ? `Face (${(confidence * 100).toFixed(0)}%)`
        : "Connected";
      window.roomVideoManager.updateDeviceStatus(deviceId, status, statusText);
    }
  }

  notifyFaceDetectionChange(deviceId, hasFace, confidence) {
    // Throttle WebSocket messages
    const now = Date.now();
    const lastNotify = this.notifyFaceDetectionChange._lastNotify || {};
    if (lastNotify[deviceId] && now - lastNotify[deviceId] < 1000) return;

    this.notifyFaceDetectionChange._lastNotify = lastNotify;
    lastNotify[deviceId] = now;

    frameLink.api.sendMessage({
      type: "face-detection-update",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      targetDeviceId: deviceId,
      hasFace: hasFace,
      confidence: confidence,
      timestamp: now,
    });
  }

  handleFaceDetectionUpdate(message) {
    // Handle face detection updates from other devices
    const { targetDeviceId, hasFace, confidence } = message;

    frameLink.log(`📥 Face detection update: ${targetDeviceId} = ${hasFace}`);

    // Update local state
    const state = roomState.faceDetectionStates.get(targetDeviceId);
    if (state) {
      state.hasFace = hasFace;
      state.confidence = confidence;
      state.lastUpdate = Date.now();

      this.updateFaceDetectionUI(targetDeviceId, hasFace, confidence);
    }

    // Emit event for auto-switch system
    frameLink.events.dispatchEvent(
      new CustomEvent("face-detection-change", {
        detail: { deviceId: targetDeviceId, hasFace, confidence },
      })
    );
  }

  setupFaceDetectionIntegration() {
    // Create global hooks for auto-switch system
    window.faceDetectionStates = roomState.faceDetectionStates;
    window.faceDetectionManager = this;

    // Create notification function for compatibility
    window.notifyFaceDetectionChange = (deviceId, hasFace, confidence) => {
      this.notifyFaceDetectionChange(deviceId, hasFace, confidence);
    };

    // Process face detection results function for compatibility
    window.processFaceDetectionResults = (deviceId, results) => {
      this.processFaceDetectionResults(deviceId, results);
    };
  }

  // 🤖 NEW: Explicit Auto-Switch Integration
  setupAutoSwitchIntegration() {
    frameLink.log("🤖 Setting up Auto-Switch Integration");

    // Method 1: Direct function hook when auto-switch loads
    const setupAutoSwitchHook = () => {
      if (
        window.autoCameraSwitching &&
        window.autoCameraSwitching._processFaceDetection
      ) {
        frameLink.log("✅ Auto-Switch system found - hooking face detection");

        // Store reference for direct calls
        this.autoSwitchProcessor =
          window.autoCameraSwitching._processFaceDetection;

        return true;
      }
      return false;
    };

    // Try immediate hook
    if (!setupAutoSwitchHook()) {
      // Retry every 500ms for up to 10 seconds
      let attempts = 0;
      const retryInterval = setInterval(() => {
        attempts++;
        if (setupAutoSwitchHook() || attempts >= 20) {
          clearInterval(retryInterval);
          if (attempts >= 20) {
            frameLink.log("⚠️ Auto-Switch system not found after 10 seconds");
          }
        }
      }, 500);
    }

    // Method 2: Global window event bridge
    this.setupGlobalEventBridge();
  }

  // 🤖 NEW: Global Event Bridge for Auto-Switch
  setupGlobalEventBridge() {
    // Create global function for auto-switch to hook into
    window.notifyAutoSwitchFaceDetection = (deviceId, hasFace, confidence) => {
      frameLink.log(
        `🤖 Auto-Switch Bridge: ${deviceId} = ${hasFace} (${confidence})`
      );

      // Call auto-switch directly if available
      if (this.autoSwitchProcessor) {
        this.autoSwitchProcessor(deviceId, hasFace, confidence);
      }

      // Also emit window event as fallback
      window.dispatchEvent(
        new CustomEvent("face-detection-for-auto-switch", {
          detail: { deviceId, hasFace, confidence },
        })
      );
    };

    frameLink.log("✅ Global Auto-Switch event bridge created");
  }

  // 🤖 NEW: Trigger Auto-Switch Processing
  triggerAutoSwitchProcessing(deviceId, hasFace, confidence) {
    try {
      // Method 1: Direct function call
      if (this.autoSwitchProcessor) {
        this.autoSwitchProcessor(deviceId, hasFace, confidence);
        frameLink.log(`🤖 Direct auto-switch call: ${deviceId} = ${hasFace}`);
      }

      // Method 2: Global bridge function
      if (window.notifyAutoSwitchFaceDetection) {
        window.notifyAutoSwitchFaceDetection(deviceId, hasFace, confidence);
      }

      // Method 3: Global hook (legacy compatibility)
      if (window.processFaceDetectionForAutoSwitch) {
        window.processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        frameLink.log(`🤖 Legacy auto-switch call: ${deviceId} = ${hasFace}`);
      }

      // Method 4: Enhanced FrameLink events
      if (window.frameLink && window.frameLink.events) {
        window.frameLink.events.dispatchEvent(
          new CustomEvent("auto-switch-face-detection", {
            detail: { deviceId, hasFace, confidence, timestamp: Date.now() },
          })
        );
      }
    } catch (error) {
      frameLink.log(`❌ Auto-switch processing error:`, error);
    }
  }
}

// ================================================================
// 🚀 ENHANCED ROOM SYSTEM INITIALIZATION
// ================================================================

class EnhancedRoomSystem {
  constructor() {
    this.roomManager = new RoomManager();
    this.roomVideoManager = new RoomVideoManager();
    this.messageHandler = new RoomMessageHandler(this.roomVideoManager);
    this.faceDetectionManager = new FaceDetectionManager();

    this.setupGlobalAPI();
    this.setupFrameLinkIntegration();
  }

  setupGlobalAPI() {
    // Export for external access
    window.multiDeviceRoom = {
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
      isInRoom: () => roomState.inRoom,
      hasCamera: () => roomState.hasCamera,
      callActive: () => roomState.callActiveWithExternal,

      // Room video functions
      getConnectedDevices: () =>
        Array.from(roomState.roomPeerConnections.keys()),
      getVideoStream: (deviceId) => roomState.roomVideoStreams.get(deviceId),

      // Face detection functions
      getFaceDetectionStates: () =>
        Array.from(roomState.faceDetectionStates.entries()),
      getDevicesWithFaces: () => {
        return Array.from(roomState.faceDetectionStates.entries())
          .filter(([_, state]) => state.hasFace)
          .map(([deviceId, state]) => ({
            deviceId,
            confidence: state.confidence,
          }));
      },
    };

    // Debug functions
    window.roomDebug = {
      state: () => roomState,
      forceJoin: () => this.roomManager.joinRoom(),
      forceCamera: () => this.roomManager.requestCameraControl(),
      faceStates: () => Array.from(roomState.faceDetectionStates.entries()),

      // Test functions for debugging
      testWebSocketState: () => {
        console.log("🔍 WebSocket Debug Info:");
        console.log("  frameLink.api.isReady():", frameLink.api.isReady());
        console.log(
          "  frameLink.core.initialized:",
          frameLink.core.initialized
        );
        console.log(
          "  frameLink.core.webSocketReady:",
          frameLink.core.webSocketReady
        );
        console.log(
          "  WebSocket state:",
          frameLink.core.instance?.webSocketManager?.socket?.readyState
        );
        console.log("  WebSocket.OPEN:", WebSocket.OPEN);
      },

      testSendMessage: () => {
        console.log("🔍 Testing sendMessage:");
        const testMessage = { type: "test", timestamp: Date.now() };
        const result = frameLink.api.sendMessage(testMessage);
        console.log("  Result:", result);
        return result;
      },

      testJoinRoom: () => {
        console.log("🔍 Testing join room click:");
        const button = document.getElementById("join-room");
        console.log("  Button found:", !!button);
        console.log("  Button disabled:", button?.disabled);
        console.log("  Button text:", button?.textContent);
        if (button) {
          button.click();
        }
      },

      forceUpdateButton: () => {
        console.log("🔍 Force updating button state:");
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.updateJoinRoomButtonState();
        } else {
          console.log("  Room manager not available");
        }
      },

      checkRoomState: () => {
        console.log("🔍 Current room state:", {
          roomId: roomState.roomId,
          deviceId: roomState.deviceId,
          inRoom: roomState.inRoom,
          deviceCount: roomState.roomDeviceCount,
          connectedPeers: Array.from(roomState.roomPeerConnections.keys()),
          videoStreams: Array.from(roomState.roomVideoStreams.keys()),
        });
      },

      simulateRoomUpdate: () => {
        console.log("🔍 Simulating room update with 2 devices:");
        const fakeMessage = {
          type: "room-update",
          roomId: roomState.roomId,
          devices: [
            { deviceId: roomState.deviceId },
            { deviceId: "test-device-2" },
          ],
        };

        if (window.enhancedRoomSystem?.messageHandler) {
          window.enhancedRoomSystem.messageHandler.handleRoomUpdate(
            fakeMessage
          );
        }
      },

      checkExternalCallStatus: () => {
        console.log("🔍 External call status check:");
        const startBtn = document.getElementById("startCall");
        console.log("  Start button found:", !!startBtn);
        console.log("  Start button disabled:", startBtn?.disabled);
        console.log("  Start button text:", startBtn?.textContent);
        console.log("  Room state:", {
          inRoom: roomState.inRoom,
          deviceCount: roomState.roomDeviceCount,
          hasCamera: roomState.hasCamera,
          callActive: roomState.callActiveWithExternal,
        });
        console.log("  FrameLink core:", {
          initialized: frameLink.core.initialized,
          localStream: !!frameLink.core.localStream,
          currentCall: !!frameLink.core.currentCall,
        });
      },

      testExternalCall: () => {
        console.log("🔍 Testing external call:");
        if (frameLink.api.startCall) {
          frameLink.api.startCall();
        } else {
          console.log("  frameLink.api.startCall not available");
        }
      },

      testSmartStreaming: () => {
        console.log("🔍 Testing smart streaming:");
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.checkExternalStreamSwitching();
        }
      },

      getCurrentStreamingDevice: () => {
        if (window.enhancedRoomSystem?.roomManager) {
          const device =
            window.enhancedRoomSystem.roomManager.getCurrentStreamingDevice();
          console.log("🔍 Current streaming device:", device);
          return device;
        }
      },

      simulateExternalCall: () => {
        console.log("🔍 Simulating external call start:");
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.notifyExternalCallStart();
        }
      },

      testMasterCall: () => {
        console.log("🔍 Testing master call:");
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.initiateMasterCall();
        }
      },

      checkRoomStreams: () => {
        console.log("🔍 Room streams status:");
        console.log(
          "  Room peer connections:",
          roomState.roomPeerConnections.size
        );
        console.log("  Room video streams:", roomState.roomVideoStreams.size);

        roomState.roomPeerConnections.forEach((pc, deviceId) => {
          console.log(`  Device ${deviceId}: ${pc.connectionState}`);
        });
      },
      // 🔴 NEUE DEBUG FUNCTIONS
      testTrackReplacement: (fromDevice, toDevice) => {
        console.log(
          `🧪 Testing track replacement: ${fromDevice} → ${toDevice}`
        );
        if (window.enhancedRoomSystem?.roomManager) {
          window.enhancedRoomSystem.roomManager.replaceExternalCallTracks(
            toDevice
          );
        }
      },

      checkExternalCallTracks: () => {
        const call = frameLink.core.currentCall;
        if (call) {
          call.getSenders().forEach((sender, index) => {
            console.log(`Track ${index}:`, {
              kind: sender.track?.kind,
              label: sender.track?.label,
              enabled: sender.track?.enabled,
              readyState: sender.track?.readyState,
            });
          });
        } else {
          console.log("No external call active");
        }
      },

      simulateFaceSwitch: (deviceId) => {
        console.log(`🧪 Simulating face switch to: ${deviceId}`);
        if (window.autoCameraSwitching?._processFaceDetection) {
          // Deaktiviere aktuelles Gerät
          const current = window.autoCameraSwitching.currentControllingDevice;
          if (current) {
            window.autoCameraSwitching._processFaceDetection(current, false, 0);
          }

          // Aktiviere neues Gerät
          setTimeout(() => {
            window.autoCameraSwitching._processFaceDetection(
              deviceId,
              true,
              0.9
            );
          }, 500);
        }
      },

      forceVideoRouting: () => {
        console.log("🔄 Force updating video routing");
        if (window.enhancedRoomSystem?.roomVideoManager) {
          window.enhancedRoomSystem.roomVideoManager.updateExternalCallVideoRouting();
        }
      },
    };
  }

  setupFrameLinkIntegration() {
    // Wait for frameLink to be ready
    if (frameLink.api.isReady && frameLink.api.isReady()) {
      this.onFrameLinkReady();
    } else {
      frameLink.events.addEventListener("core-ready", () => {
        this.onFrameLinkReady();
      });
    }
  }

  onFrameLinkReady() {
    frameLink.log("🏠 Enhanced Room System integrated with FrameLink Core");

    // Announce room system ready
    frameLink.events.dispatchEvent(
      new CustomEvent("room-system-ready", {
        detail: { roomId: roomState.roomId, deviceId: roomState.deviceId },
      })
    );
  }
}

// ================================================================
// 🚀 AUTO-INITIALIZATION
// ================================================================

window.addEventListener("load", () => {
  // Wait for frameLink core to load
  setTimeout(() => {
    frameLink.log("🏠 Initializing Enhanced Room System...");

    window.enhancedRoomSystem = new EnhancedRoomSystem();

    frameLink.log("✅ Enhanced Room System ready!");
  }, 2000);
});

frameLink.log =
  frameLink.log ||
  ((msg, data) => {
    const timestamp = new Date().toLocaleTimeString();
    if (data) {
      console.log(`[Room ${timestamp}] ${msg}`, data);
    } else {
      console.log(`[Room ${timestamp}] ${msg}`);
    }
  });

frameLink.log("✅ Enhanced simple-room.js loaded - Phase 2 Complete");
