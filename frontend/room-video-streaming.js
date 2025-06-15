// room-video-streaming.js - Step 1.2: Room Video Streaming Logic
// ================================================================
// Funktionen: WebRTC Peer-Connections zwischen Room-Geräten
// Unterscheidung: Room-interne vs externe Calls
// Status: NEU - Erweitert simple-room.js

window.addEventListener("load", () => {
  console.log("🎥 Room Video Streaming wird geladen...");

  // ================================================================
  // STATE MANAGEMENT - Room Video Streaming
  // ================================================================

  let roomPeerConnections = new Map(); // deviceId -> RTCPeerConnection
  let roomVideoStreams = new Map(); // deviceId -> MediaStream
  let isRoomVideoActive = false;
  let localDeviceId = null;
  let currentRoomId = null;

  // ================================================================
  // INITIALIZATION - Integration mit existing code
  // ================================================================

  // Warte bis simple-room.js geladen ist
  function waitForRoomSystem() {
    if (window.multiDeviceRoom && window.multiDeviceRoom.deviceId) {
      localDeviceId = window.multiDeviceRoom.deviceId;
      currentRoomId = window.multiDeviceRoom.roomId;
      console.log("✅ Room System erkannt:", { localDeviceId, currentRoomId });
      initRoomVideoSystem();
    } else {
      console.log("⏳ Warte auf Room System...");
      setTimeout(waitForRoomSystem, 1000);
    }
  }

  // Start initialization
  setTimeout(waitForRoomSystem, 500);

  // ================================================================
  // ROOM VIDEO SYSTEM INITIALIZATION
  // ================================================================

  function initRoomVideoSystem() {
    console.log("🔧 Room Video System initialisiert");

    // Check multiple possible WebSocket references
    const socket =
      window.socket ||
      window.ws ||
      (window.connectWebSocket && window.connectWebSocket.socket);

    console.log("🔍 WebSocket Check:", {
      windowSocket: !!window.socket,
      globalSocket: !!socket,
      socketReadyState: socket?.readyState,
      WebSocketOPEN: WebSocket.OPEN,
    });

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log("✅ WebSocket gefunden und verbunden");
      hookIntoWebSocket(socket);
    } else if (socket) {
      console.log("⏳ WebSocket gefunden aber nicht connected, warte...");
      setTimeout(initRoomVideoSystem, 1000);
    } else {
      console.log("❌ Kein WebSocket gefunden, versuche global zu finden...");
      findWebSocketGlobally();
    }
  }

  // Fallback: Global nach WebSocket suchen
  function findWebSocketGlobally() {
    console.log("🔍 Suche WebSocket global...");

    // Warte auf app.js load
    setTimeout(() => {
      if (window.socket) {
        console.log("✅ WebSocket nach Wartezeit gefunden");
        hookIntoWebSocket(window.socket);
      } else {
        console.log("❌ WebSocket immer noch nicht gefunden, retry...");
        if (findWebSocketGlobally.retries < 10) {
          findWebSocketGlobally.retries++;
          setTimeout(findWebSocketGlobally, 2000);
        } else {
          console.error("❌ WebSocket nicht gefunden nach 10 Versuchen");
        }
      }
    }, 2000);
  }
  findWebSocketGlobally.retries = 0;

  // ================================================================
  // WEBSOCKET INTEGRATION - Erweitere existing Message Handler
  // ================================================================

  function hookIntoWebSocket(socket) {
    if (!socket) {
      console.error("❌ Kein Socket übergeben an hookIntoWebSocket");
      return;
    }

    console.log("🔗 Hooking into WebSocket für Room Video Streaming");
    console.log(
      "Socket State:",
      socket.readyState,
      "WebSocket.OPEN:",
      WebSocket.OPEN
    );

    // Store socket reference globally
    window.roomVideoSocket = socket;

    // Store original onmessage if it exists
    const existingHandler = socket.onmessage;

    // Enhanced message handler
    socket.onmessage = async (event) => {
      // First, call existing handler
      if (existingHandler) {
        existingHandler.call(socket, event);
      }

      // Then handle room video messages
      await handleRoomVideoMessage(event);
    };

    console.log("✅ WebSocket Hook installiert");

    // Test room video system by announcing peer
    setTimeout(() => {
      if (isRoomVideoActive) {
        console.log("🎥 Teste Room Video System...");
        announceRoomPeer();
      }
    }, 2000);
  }

  // ================================================================
  // ROOM VIDEO MESSAGE HANDLING
  // ================================================================

  async function handleRoomVideoMessage(event) {
    try {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      const msg = JSON.parse(data);

      // Only handle room video messages
      if (!msg.roomId || msg.roomId !== currentRoomId) return;

      console.log("🎥 Room Video Message:", msg.type, "from", msg.fromDeviceId);

      switch (msg.type) {
        case "room-video-offer":
          await handleRoomVideoOffer(msg);
          break;
        case "room-video-answer":
          await handleRoomVideoAnswer(msg);
          break;
        case "room-video-ice":
          await handleRoomVideoIce(msg);
          break;
        case "room-peer-joined":
          await initiateRoomVideoConnection(msg.deviceId);
          break;
        case "room-peer-left":
          await removeRoomPeerConnection(msg.deviceId);
          break;
      }
    } catch (e) {
      // Ignore parsing errors - not all messages are JSON
    }
  }

  // ================================================================
  // ROOM PEER CONNECTION MANAGEMENT
  // ================================================================

  // Create WebRTC connection between room devices
  async function createRoomPeerConnection(remoteDeviceId) {
    console.log("🔗 Erstelle Room PeerConnection zu:", remoteDeviceId);

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "18dd3dc42100ea8643228a68",
          credential: "9u70h1tuJ9YA0ONB",
        },
      ],
    });

    // Add local stream tracks
    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, window.localStream);
        console.log("➕ Local track hinzugefügt für Room-Gerät:", track.kind);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("📹 Room Video Stream empfangen von:", remoteDeviceId);
      const remoteStream = event.streams[0];
      roomVideoStreams.set(remoteDeviceId, remoteStream);

      // Add to UI
      addRoomVideoToUI(remoteDeviceId, remoteStream);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (
        event.candidate &&
        window.roomVideoSocket?.readyState === WebSocket.OPEN
      ) {
        console.log("📤 Sende Room ICE Candidate zu:", remoteDeviceId);
        window.roomVideoSocket.send(
          JSON.stringify({
            type: "room-video-ice",
            roomId: currentRoomId,
            fromDeviceId: localDeviceId,
            toDeviceId: remoteDeviceId,
            candidate: event.candidate,
          })
        );
      }
    };

    // Connection state monitoring
    peerConnection.onconnectionstatechange = () => {
      console.log(
        `Room PeerConnection ${remoteDeviceId}:`,
        peerConnection.connectionState
      );

      if (peerConnection.connectionState === "connected") {
        updateRoomDeviceStatus(remoteDeviceId, "connected");
      } else if (peerConnection.connectionState === "failed") {
        console.log("❌ Room connection failed to:", remoteDeviceId);
        removeRoomPeerConnection(remoteDeviceId);
      }
    };

    roomPeerConnections.set(remoteDeviceId, peerConnection);
    return peerConnection;
  }

  // ================================================================
  // ROOM VIDEO OFFER/ANSWER HANDLING
  // ================================================================

  // Initiate connection to new room device
  async function initiateRoomVideoConnection(remoteDeviceId) {
    if (remoteDeviceId === localDeviceId) return; // Don't connect to self

    console.log("🚀 Initiiere Room Video Connection zu:", remoteDeviceId);

    const peerConnection = await createRoomPeerConnection(remoteDeviceId);

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);

      // Send offer via WebSocket
      window.roomVideoSocket.send(
        JSON.stringify({
          type: "room-video-offer",
          roomId: currentRoomId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          offer: offer,
        })
      );

      console.log("📤 Room Video Offer gesendet zu:", remoteDeviceId);
    } catch (error) {
      console.error("❌ Room Video Offer Fehler:", error);
    }
  }

  // Handle incoming room video offer
  async function handleRoomVideoOffer(msg) {
    if (msg.toDeviceId !== localDeviceId) return; // Not for me

    console.log("📥 Room Video Offer empfangen von:", msg.fromDeviceId);

    const peerConnection = await createRoomPeerConnection(msg.fromDeviceId);

    try {
      await peerConnection.setRemoteDescription(msg.offer);

      // Ensure local stream is available
      if (!window.localStream) {
        console.log("⏳ Warte auf lokalen Stream...");
        await waitForLocalStream();
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Send answer
      window.roomVideoSocket.send(
        JSON.stringify({
          type: "room-video-answer",
          roomId: currentRoomId,
          fromDeviceId: localDeviceId,
          toDeviceId: msg.fromDeviceId,
          answer: answer,
        })
      );

      console.log("📤 Room Video Answer gesendet zu:", msg.fromDeviceId);
    } catch (error) {
      console.error("❌ Room Video Answer Fehler:", error);
    }
  }

  // Handle incoming room video answer
  async function handleRoomVideoAnswer(msg) {
    if (msg.toDeviceId !== localDeviceId) return; // Not for me

    console.log("📥 Room Video Answer empfangen von:", msg.fromDeviceId);

    const peerConnection = roomPeerConnections.get(msg.fromDeviceId);
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(msg.answer);
        console.log("✅ Room Video Answer verarbeitet von:", msg.fromDeviceId);
      } catch (error) {
        console.error("❌ Room Video Answer Verarbeitung Fehler:", error);
      }
    }
  }

  // Handle room video ICE candidates
  async function handleRoomVideoIce(msg) {
    if (msg.toDeviceId !== localDeviceId) return; // Not for me

    const peerConnection = roomPeerConnections.get(msg.fromDeviceId);
    if (peerConnection && msg.candidate) {
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(msg.candidate)
        );
        console.log("✅ Room ICE Candidate hinzugefügt von:", msg.fromDeviceId);
      } catch (error) {
        console.error("❌ Room ICE Candidate Fehler:", error);
      }
    }
  }

  // ================================================================
  // UI INTEGRATION - Connect to room video grid
  // ================================================================

  function addRoomVideoToUI(deviceId, videoStream) {
    console.log("🖥️ Füge Room Video zur UI hinzu:", deviceId);

    // Use existing roomVideoManager from index.html
    if (window.roomVideoManager) {
      window.roomVideoManager.addRoomDevice(
        deviceId,
        videoStream,
        `Device ${deviceId.slice(-4)}`
      );
      window.roomVideoManager.updateDeviceStatus(deviceId, "connected");
    }

    // Update device count
    updateRoomDeviceCount();
  }

  function removeRoomVideoFromUI(deviceId) {
    console.log("🗑️ Entferne Room Video aus UI:", deviceId);

    if (window.roomVideoManager) {
      window.roomVideoManager.removeRoomDevice(deviceId);
    }

    updateRoomDeviceCount();
  }

  function updateRoomDeviceStatus(deviceId, status) {
    if (window.roomVideoManager) {
      window.roomVideoManager.updateDeviceStatus(deviceId, status);
    }
  }

  function updateRoomDeviceCount() {
    const connectedDevices = roomPeerConnections.size + 1; // +1 for local device
    console.log("📊 Room Devices gesamt:", connectedDevices);

    if (window.roomVideoManager) {
      window.roomVideoManager.updateRoomStatus(
        localDeviceId ? `Device ${localDeviceId.slice(-4)}` : "Local",
        false, // Face detection not yet implemented
        false // Auto-switch not yet implemented
      );
    }
  }

  // ================================================================
  // UTILITY FUNCTIONS
  // ================================================================

  // Wait for local stream to be available
  function waitForLocalStream() {
    return new Promise((resolve) => {
      const checkStream = () => {
        if (window.localStream) {
          resolve(window.localStream);
        } else {
          setTimeout(checkStream, 500);
        }
      };
      checkStream();
    });
  }

  // Remove room peer connection
  async function removeRoomPeerConnection(deviceId) {
    console.log("🗑️ Entferne Room PeerConnection:", deviceId);

    const peerConnection = roomPeerConnections.get(deviceId);
    if (peerConnection) {
      peerConnection.close();
      roomPeerConnections.delete(deviceId);
    }

    roomVideoStreams.delete(deviceId);
    removeRoomVideoFromUI(deviceId);
  }

  // ================================================================
  // INTEGRATION WITH EXISTING MULTI-DEVICE SYSTEM
  // ================================================================

  // Announce this device as available for room video
  function announceRoomPeer() {
    if (window.roomVideoSocket?.readyState === WebSocket.OPEN) {
      console.log("📢 Announcing room peer:", localDeviceId);
      window.roomVideoSocket.send(
        JSON.stringify({
          type: "room-peer-joined",
          roomId: currentRoomId,
          deviceId: localDeviceId,
        })
      );
    }
  }

  // Hook into existing room join process
  function enhanceRoomJoinProcess() {
    // Monitor for room join events
    const originalJoinBtn = document.getElementById("join-room");
    if (originalJoinBtn) {
      originalJoinBtn.addEventListener("click", () => {
        setTimeout(() => {
          console.log("🎥 Room beigetreten - aktiviere Video Streaming");
          isRoomVideoActive = true;

          // Announce this device to room for video connections
          announceRoomPeer();
        }, 2000);
      });
    }
  }

  // Initialize enhanced room functionality
  setTimeout(enhanceRoomJoinProcess, 2000);

  // ================================================================
  // GLOBAL API - For external access
  // ================================================================

  window.roomVideoStreaming = {
    isActive: () => isRoomVideoActive,
    getConnectedDevices: () => Array.from(roomPeerConnections.keys()),
    getVideoStream: (deviceId) => roomVideoStreams.get(deviceId),
    initiateConnection: initiateRoomVideoConnection,
    removeConnection: removeRoomPeerConnection,

    // Debug functions
    debug: {
      logConnections: () => {
        console.log("🔍 Room Video Debug:");
        console.log("- Local Device:", localDeviceId);
        console.log("- Room ID:", currentRoomId);
        console.log(
          "- Connected Peers:",
          Array.from(roomPeerConnections.keys())
        );
        console.log("- Video Streams:", Array.from(roomVideoStreams.keys()));
      },
    },
  };

  console.log("✅ Room Video Streaming System geladen");
});
