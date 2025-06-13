// simple-room.js - Optimized Multi-Device Base Version
// 🎯 Core Features: Multi-Device Room, Camera Switching, External Calls

class MultiDeviceRoom {
  constructor() {
    this.roomId = null;
    this.deviceId = this.generateDeviceId();
    this.isLocalRoom = false;
    this.inRoom = false;
    this.hasCamera = false;
    this.roomDeviceCount = 1;
    this.callActiveWithExternal = false;
    this.socket = null;
    this.originalOnMessage = null;

    this.init();
  }

  generateDeviceId() {
    return Math.random().toString(36).substr(2, 6);
  }

  init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.parseRoomFromURL();
    this.createUI();
    this.bindEvents();
    this.detectExistingCall();
    this.log("📹 Multi-Device Room initialized");
  }

  parseRoomFromURL() {
    const params = new URLSearchParams(window.location.search);
    this.roomId = params.get("room");

    if (!this.roomId) {
      this.roomId = "room-" + Math.random().toString(36).substr(2, 8);
      window.history.replaceState({}, "", "?room=" + this.roomId);
      this.isLocalRoom = true;
    }
  }

  createUI() {
    // Room Info anzeigen
    if (this.isLocalRoom) {
      this.createRoomInfo();
    }

    // Room Controls erstellen
    this.createRoomControls();
  }

  createRoomInfo() {
    const info = document.createElement("div");
    info.className = "multi-device-info";
    info.style.cssText = `
      background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
      padding: 20px;
      margin: 20px auto;
      max-width: 600px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;

    info.innerHTML = `
      <h2 style="margin:0 0 15px 0; color:#1976d2;">📹 Smart Multi-Device Room</h2>
      <p><strong>Room ID:</strong> <code style="background:#fff; padding:2px 6px; border-radius:4px;">${this.roomId}</code></p>
      <div style="margin:15px 0;">
        <label style="display:block; margin-bottom:5px; font-weight:bold;">Share this URL:</label>
        <input value="${window.location.href}" readonly 
               style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;"
               onclick="this.select(); document.execCommand('copy'); this.style.background='#d4edda';">
      </div>
      <div style="background:white; padding:12px; border-radius:6px; margin-top:15px;">
        <p style="margin:5px 0; font-size:14px;"><strong>🎯 Features:</strong></p>
        <ul style="margin:5px 0 0 20px; font-size:14px;">
          <li><strong>Multi-Device:</strong> Open on multiple devices</li>
          <li><strong>Video-Chat:</strong> Share URL for external calls</li>
          <li><strong>Camera Switch:</strong> Switch camera during calls</li>
        </ul>
      </div>
    `;

    document.body.insertBefore(info, document.body.firstChild);
  }

  createRoomControls() {
    const controls = document.createElement("div");
    controls.className = "multi-device-controls";
    controls.style.cssText = `
      background: linear-gradient(135deg, #fff3cd 0%, #fce4ec 100%);
      padding: 20px;
      margin: 20px auto;
      max-width: 600px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    controls.innerHTML = `
      <h3 style="margin:0 0 10px 0; color:#f57c00;">🏠 Room: ${this.roomId}</h3>
      <p style="margin:0 0 20px 0;">Device: <code id="device-id" style="background:#fff; padding:2px 6px; border-radius:4px;">${this.deviceId}</code></p>
      
      <div style="display:flex; justify-content:center; gap:12px; margin:20px 0; flex-wrap:wrap;">
        <button id="join-room" class="btn btn-primary">🚪 Activate Multi-Device</button>
        <button id="video-call-btn" class="btn btn-success">📞 Start Video Call</button>
      </div>
      
      <div id="room-controls" style="display:none; margin-top:20px;">
        <button id="take-camera" class="btn btn-camera">📹 Take Camera Control</button>
        <p id="camera-status" style="margin:12px 0; font-weight:bold; font-size:16px;">⏸️ Camera Inactive</p>
        <div id="call-info" style="display:none; margin:15px 0; padding:12px; background:#f8f9fa; border-radius:6px; border-left:4px solid #6c757d;">
          <div id="call-status">📞 No active call</div>
        </div>
      </div>
    `;

    // Add CSS for buttons
    this.addButtonStyles();

    document.body.insertBefore(controls, document.querySelector(".container"));
  }

  addButtonStyles() {
    if (document.getElementById("multi-device-styles")) return;

    const style = document.createElement("style");
    style.id = "multi-device-styles";
    style.textContent = `
      .btn {
        padding: 10px 18px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-block;
      }
      .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
      .btn:disabled { background: #ccc !important; cursor: not-allowed; transform: none; }
      .btn-primary { background: #2196F3; color: white; }
      .btn-success { background: #4caf50; color: white; }
      .btn-camera { background: #ff9800; color: white; }
    `;
    document.head.appendChild(style);
  }

  bindEvents() {
    document
      .getElementById("join-room")
      ?.addEventListener("click", () => this.joinRoom());
    document
      .getElementById("video-call-btn")
      ?.addEventListener("click", () => this.startVideoCall());
    document
      .getElementById("take-camera")
      ?.addEventListener("click", () => this.takeCameraControl());
  }

  // 🔍 Detect existing calls when joining room
  detectExistingCall() {
    // Check PeerConnection state
    if (window.peerConnection) {
      const state = window.peerConnection.connectionState;
      if (state === "connected" || state === "connecting") {
        this.callActiveWithExternal = true;
        this.updateCallStatus("📞 Existing call detected");

        // Check if I have active camera
        if (window.localStream) {
          const hasActiveVideo = window.localStream
            .getVideoTracks()
            .some((track) => track.enabled);
          if (hasActiveVideo) {
            this.hasCamera = true;
            this.updateCameraStatus("📹 CAMERA ACTIVE", "green", "#4caf50");
          }
        }
      }
    }

    // Check remote video
    if (window.remoteVideo?.srcObject) {
      this.callActiveWithExternal = true;
    }
  }

  // 🚪 Join multi-device room
  async joinRoom() {
    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
      alert("Server not connected!");
      return;
    }

    this.socket = window.socket;
    this.log("🚪 Joining multi-device room");

    // Send join request
    this.socket.send(
      JSON.stringify({
        type: "join-room",
        roomId: this.roomId,
        deviceId: this.deviceId,
      })
    );

    // Update UI
    const joinBtn = document.getElementById("join-room");
    joinBtn.disabled = true;
    joinBtn.textContent = "✅ Multi-Device Active";
    document.getElementById("room-controls").style.display = "block";

    this.inRoom = true;
    this.setupRoomHandlers();
  }

  // 📞 Start video call
  startVideoCall() {
    this.log(
      `🎯 Starting video call - inRoom: ${this.inRoom}, devices: ${this.roomDeviceCount}, hasCamera: ${this.hasCamera}`
    );

    if (this.inRoom && this.roomDeviceCount > 1) {
      // Multi-device: Only device with camera can call
      if (this.hasCamera) {
        this.log("✅ Multi-device call with camera");
        window.startCall?.();
      } else {
        this.log("❌ Multi-device call without camera");
        alert(
          "You need camera control to make a call! Click 'Take Camera Control'"
        );
      }
    } else {
      // Solo or no room: normal call
      this.log("✅ Solo/normal call");
      window.startCall?.();
    }
  }

  // 📹 Take camera control
  takeCameraControl() {
    if (!this.inRoom) return;

    this.log("🔄 Requesting camera control");
    this.socket.send(
      JSON.stringify({
        type: "camera-request",
        roomId: this.roomId,
        deviceId: this.deviceId,
      })
    );
  }

  // 🔧 Setup room message handlers
  setupRoomHandlers() {
    this.originalOnMessage = this.socket.onmessage;

    this.socket.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);

        // Handle room messages
        if (msg.roomId === this.roomId && this.inRoom && this.isLocalRoom) {
          if (this.handleRoomMessage(msg)) return;
        }

        // Handle WebRTC messages with multi-device logic
        if (["offer", "answer", "ice"].includes(msg.type)) {
          if (this.handleWebRTCMessage(msg, event)) return;
        }

        // Forward other messages
        this.originalOnMessage?.call(this.socket, event);
      } catch (error) {
        this.originalOnMessage?.call(this.socket, event);
      }
    };

    // Initial setup
    if (window.localStream) {
      window.localStream
        .getVideoTracks()
        .forEach((track) => (track.enabled = false));
    }

    this.log("✅ Room handlers setup complete");
  }

  // 🏠 Handle room-specific messages
  handleRoomMessage(msg) {
    switch (msg.type) {
      case "camera-request":
        this.handleCameraSwitch(msg);
        return true;

      case "room-update":
        this.roomDeviceCount = msg.devices?.length || 1;
        this.log(`Room: ${this.roomDeviceCount} devices connected`);
        return true;

      default:
        return false;
    }
  }

  // 🌐 Handle WebRTC messages with multi-device logic
  handleWebRTCMessage(msg, event) {
    // Rule 1: Not in room → process normally
    if (!this.inRoom || !this.isLocalRoom) {
      this.originalOnMessage?.call(this.socket, event);
      return true;
    }

    // Rule 2: Solo in room → process normally
    if (this.roomDeviceCount <= 1) {
      this.originalOnMessage?.call(this.socket, event);
      if (["offer", "answer"].includes(msg.type)) {
        this.callActiveWithExternal = true;
        this.updateCallStatus("📞 External call active");
      }
      return true;
    }

    // Rule 3: Multi-device logic

    // Auto-assign camera if no one has it and external call comes
    if (
      !this.hasCamera &&
      !this.callActiveWithExternal &&
      ["offer", "answer"].includes(msg.type)
    ) {
      this.log("🎯 Auto-assigning camera for external call");
      this.hasCamera = true;

      if (window.localStream) {
        window.localStream
          .getVideoTracks()
          .forEach((track) => (track.enabled = true));
      }

      this.updateCameraStatus("📹 CAMERA AUTO-ACTIVE", "orange", "#ff9800");

      // Inform other devices
      this.socket.send(
        JSON.stringify({
          type: "camera-request",
          roomId: this.roomId,
          deviceId: this.deviceId,
        })
      );
    }

    // Process WebRTC if I have camera OR no call active yet
    const shouldProcess = this.hasCamera || !this.callActiveWithExternal;

    if (shouldProcess) {
      this.originalOnMessage?.call(this.socket, event);

      if (["offer", "answer"].includes(msg.type)) {
        this.callActiveWithExternal = true;
        this.updateCallStatus(
          this.hasCamera
            ? "📞 External call (Master)"
            : "📞 External call received"
        );
      }
    } else {
      this.log(`❌ WebRTC ignored (no camera): ${msg.type}`);
    }

    return true;
  }

  // 📹 Handle camera switching between devices
  handleCameraSwitch(msg) {
    if (msg.deviceId === this.deviceId) {
      // I get the camera
      this.hasCamera = true;

      if (window.localStream) {
        window.localStream
          .getVideoTracks()
          .forEach((track) => (track.enabled = true));
      }

      this.updateCameraStatus("📹 CAMERA ACTIVE", "green", "#4caf50");
      this.log(
        `✅ Camera taken - hasCamera: ${this.hasCamera}, callActive: ${this.callActiveWithExternal}`
      );

      // Re-check for active call if not detected
      if (!this.callActiveWithExternal) {
        this.detectExistingCall();
      }
    } else {
      // Someone else gets the camera
      this.hasCamera = false;

      if (window.localStream) {
        window.localStream
          .getVideoTracks()
          .forEach((track) => (track.enabled = false));
      }

      this.updateCameraStatus(`⏸️ ${msg.deviceId} has camera`, "gray", "#ccc");
      this.log(`⏸️ Camera given to: ${msg.deviceId}`);
    }
  }

  // 🎨 Update camera status UI
  updateCameraStatus(text, color, borderColor) {
    const statusEl = document.getElementById("camera-status");
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color;
    }

    if (window.localVideo && borderColor) {
      window.localVideo.style.border = `4px solid ${borderColor}`;
    }
  }

  // 📞 Update call status UI
  updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;

      // Color coding
      if (message.includes("active") || message.includes("Master")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeftColor = "#28a745";
      } else if (message.includes("received") || message.includes("detected")) {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeftColor = "#ffc107";
      } else {
        callInfo.style.background = "#f8f9fa";
        callInfo.style.borderLeftColor = "#6c757d";
      }
    }
  }

  // 🔧 Extend original functions
  setupCallInterception() {
    // Extend startCall
    const originalStartCall = window.startCall;
    if (originalStartCall) {
      window.startCall = (...args) => {
        this.log(
          `🚀 startCall() - inRoom: ${this.inRoom}, devices: ${this.roomDeviceCount}, hasCamera: ${this.hasCamera}`
        );

        // Multi-device: only with camera
        if (this.inRoom && this.roomDeviceCount > 1 && !this.hasCamera) {
          this.log("⚠️ Call start ignored - no camera in multi-device");
          alert("You need camera control to make a call!");
          return;
        }

        // Start call
        this.callActiveWithExternal = true;
        this.updateCallStatus("📞 Starting call...");

        const result = originalStartCall.apply(this, args);

        if (this.hasCamera || this.roomDeviceCount <= 1) {
          this.updateCallStatus("📞 External call active");
        }

        return result;
      };
    }

    // Extend endCall
    const originalEndCall = window.endCall;
    if (originalEndCall) {
      window.endCall = (...args) => {
        this.callActiveWithExternal = false;
        this.updateCallStatus("📞 Call ended");
        return originalEndCall.apply(this, args);
      };
    }
  }

  // 📝 Logging utility
  log(message) {
    console.log(`[MultiDevice] ${message}`);
  }
}

// 🚀 Initialize when page loads
window.addEventListener("load", () => {
  // Create global instance
  window.multiDeviceRoom = new MultiDeviceRoom();

  // Setup call interception after a short delay to ensure other scripts loaded
  setTimeout(() => {
    window.multiDeviceRoom.setupCallInterception();
  }, 100);
});
