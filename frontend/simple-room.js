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
    });
  }

  async joinRoom() {
    if (!frameLink.api.isReady()) {
      alert("Server noch nicht verbunden!");
      return;
    }

    frameLink.log("🚪 Joining multi-device room...");

    // Detect existing call before joining
    this.detectExistingCall();

    // Send join request
    const success = frameLink.api.sendMessage({
      type: "join-room",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
    });

    if (success) {
      roomState.inRoom = true;
      roomState.isLocalRoom = true;

      // Update UI
      const joinRoomBtn = document.getElementById("join-room");
      if (joinRoomBtn) {
        joinRoomBtn.disabled = true;
        joinRoomBtn.textContent = "✅ Multi-Device Active";
      }

      const roomControls = document.getElementById("room-controls");
      if (roomControls) {
        roomControls.style.display = "block";
      }

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
    }
  }

  requestCameraControl() {
    if (!roomState.inRoom) return;

    frameLink.log("🔄 Requesting camera control");
    frameLink.api.sendMessage({
      type: "camera-request",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
      fromDeviceId: roomState.deviceId,
    });
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
        this.updateCallStatus("📞 Existing call detected");

        // Check if local camera is active
        if (coreState.localStream) {
          const videoTracks = coreState.localStream.getVideoTracks();
          const hasActiveVideo = videoTracks.some((track) => track.enabled);

          if (hasActiveVideo) {
            roomState.hasCamera = true;
            roomState.amCurrentCameraMaster = true;
            this.updateCameraStatus("📹 CAMERA ACTIVE", "green");
          }
        }
      }
    }
  }
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
      this.handleMessage(event.detail.message);
    });
  }

  handleMessage(message) {
    const { type, roomId } = message;

    // Only handle room messages for our room
    if (roomId !== roomState.roomId || !roomState.inRoom) return;

    // Prevent duplicate processing
    if (this.isDuplicateMessage(message)) return;

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
    const wasMyCamera = roomState.hasCamera;

    frameLink.log(
      `📹 Camera switch: target=${targetDeviceId}, my=${myDeviceId}`
    );

    if (targetDeviceId === myDeviceId) {
      // I get camera control
      roomState.hasCamera = true;
      roomState.amCurrentCameraMaster = roomState.callActiveWithExternal;

      // Activate local video tracks
      const coreState = frameLink.api.getState();
      if (coreState.localStream) {
        coreState.localStream
          .getVideoTracks()
          .forEach((t) => (t.enabled = true));
      }

      this.updateCameraStatus("📹 CAMERA ACTIVE", "green");

      // Emit event for auto-switch system
      frameLink.events.dispatchEvent(
        new CustomEvent("camera-control-gained", {
          detail: { deviceId: myDeviceId },
        })
      );

      // Handle call takeover if needed
      if (roomState.callActiveWithExternal && !wasMyCamera) {
        setTimeout(() => this.initiateCallTakeover(), 500);
      }
    } else {
      // Another device gets camera control
      roomState.hasCamera = false;

      // Deactivate local video tracks
      const coreState = frameLink.api.getState();
      if (coreState.localStream) {
        coreState.localStream
          .getVideoTracks()
          .forEach((t) => (t.enabled = false));
      }

      this.updateCameraStatus(`⏸️ ${targetDeviceId} has camera`, "gray");

      // Emit event for auto-switch system
      frameLink.events.dispatchEvent(
        new CustomEvent("camera-control-lost", {
          detail: { deviceId: targetDeviceId },
        })
      );
    }
  }

  handleRoomUpdate(message) {
    const deviceCount = message.devices?.length || 1;
    roomState.roomDeviceCount = deviceCount;
    frameLink.log(`🏠 Room update: ${deviceCount} devices`);
  }

  handleRoomCallStart(message) {
    if (!roomState.hasCamera && message.fromDeviceId !== roomState.deviceId) {
      frameLink.log("📞 Starting call automatically (from camera master)");
      roomState.callActiveWithExternal = true;
      this.updateCallStatus("📞 Call started by master device");
    }
  }

  initiateCallTakeover() {
    frameLink.log("🔥 Initiating call takeover");

    // Use frameLink API to restart call with new camera
    if (frameLink.api.startCall) {
      setTimeout(() => {
        frameLink.api.startCall();
        this.updateCallStatus("📞 Call restarted with new camera");
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

// ================================================================
// 🎥 ROOM VIDEO STREAMING MANAGER
// ================================================================

class RoomVideoManager {
  constructor() {
    this.setupRoomVideo();
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

    // Announce this device to room
    this.announceRoomPeer();

    // Set device ID on local video elements
    this.assignLocalVideoDeviceId();
  }

  announceRoomPeer() {
    frameLink.api.sendMessage({
      type: "room-peer-joined",
      roomId: roomState.roomId,
      deviceId: roomState.deviceId,
    });
    frameLink.log(`📢 Announced room peer: ${roomState.deviceId}`);
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
  }

  async handlePeerJoined(message) {
    const remoteDeviceId = message.deviceId;
    if (remoteDeviceId === roomState.deviceId) return;

    frameLink.log(`🚀 Initiating room video connection to: ${remoteDeviceId}`);

    const peerConnection = frameLink.api.createPeerConnection();
    roomState.roomPeerConnections.set(remoteDeviceId, peerConnection);

    // Add local stream
    const coreState = frameLink.api.getState();
    if (coreState.localStream) {
      coreState.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, coreState.localStream);
      });
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
    });
  }

  async handleRoomVideoOffer(message) {
    if (message.toDeviceId !== roomState.deviceId) return;

    frameLink.log(`📥 Room video offer from: ${message.fromDeviceId}`);

    const peerConnection = frameLink.api.createPeerConnection();
    roomState.roomPeerConnections.set(message.fromDeviceId, peerConnection);

    this.setupRoomPeerConnectionHandlers(peerConnection, message.fromDeviceId);

    await peerConnection.setRemoteDescription(message.offer);

    // Add local stream
    const coreState = frameLink.api.getState();
    if (coreState.localStream) {
      coreState.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, coreState.localStream);
      });
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    frameLink.api.sendMessage({
      type: "room-video-answer",
      roomId: roomState.roomId,
      fromDeviceId: roomState.deviceId,
      toDeviceId: message.fromDeviceId,
      answer: answer,
    });
  }

  async handleRoomVideoAnswer(message) {
    if (message.toDeviceId !== roomState.deviceId) return;

    const peerConnection = roomState.roomPeerConnections.get(
      message.fromDeviceId
    );
    if (peerConnection) {
      await peerConnection.setRemoteDescription(message.answer);
      frameLink.log(
        `✅ Room video answer processed from: ${message.fromDeviceId}`
      );
    }
  }

  async handleRoomVideoIce(message) {
    if (message.toDeviceId !== roomState.deviceId) return;

    const peerConnection = roomState.roomPeerConnections.get(
      message.fromDeviceId
    );
    if (peerConnection && message.candidate) {
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(message.candidate)
        );
        frameLink.log(
          `✅ Room ICE candidate added from: ${message.fromDeviceId}`
        );
      } catch (error) {
        frameLink.log(`❌ Room ICE candidate error:`, error);
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
        });
      }
    };

    // Connection state monitoring
    peerConnection.onconnectionstatechange = () => {
      frameLink.log(
        `🔗 Room connection ${remoteDeviceId}: ${peerConnection.connectionState}`
      );

      if (peerConnection.connectionState === "connected") {
        this.updateRoomDeviceStatus(remoteDeviceId, "connected");
      } else if (peerConnection.connectionState === "failed") {
        this.removeRoomPeerConnection(remoteDeviceId);
      }
    };
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
        window.faceDetectionManager?.setupFaceDetectionForVideo(videoElement);
      }
    }, 100);
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
}

// ================================================================
// 🎭 FACE DETECTION MANAGER
// ================================================================

class FaceDetectionManager {
  constructor() {
    this.initializeFaceDetection();
    this.setupFaceDetectionIntegration();
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
      if (currentTime - lastLog > 3000) {
        frameLink.log(
          `🎭 ${deviceId}: ${hasFace ? "FACE" : "NO FACE"} (${(maxConfidence * 100).toFixed(0)}%)`
        );
        roomState.lastLoggedStates.set(`face-${deviceId}`, currentTime);
      }

      // Update UI
      this.updateFaceDetectionUI(deviceId, hasFace, maxConfidence);

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
