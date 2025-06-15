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
      integrateWithSimpleRoom(); // Geändert von initRoomVideoSystem()
    } else {
      console.log("⏳ Warte auf Room System...");
      setTimeout(waitForRoomSystem, 1000);
    }
  }

  // Start initialization mit Delay um sicherzustellen dass app.js geladen ist
  setTimeout(waitForRoomSystem, 2000); // Verlängert von 500ms auf 2000ms

  // ================================================================
  // ROOM VIDEO SYSTEM INITIALIZATION
  // ================================================================

  // ================================================================
  // DIRECT INTEGRATION - Hook directly into simple-room.js
  // ================================================================

  // Direct integration with simple-room.js WebSocket
  function integrateWithSimpleRoom() {
    console.log("🔗 Integriere direkt mit simple-room.js");

    // Check if simple-room has exposed the socket
    const checkSimpleRoomSocket = () => {
      // Try to find socket from global scope
      if (typeof socket !== "undefined" && socket) {
        console.log("✅ Socket aus Global Scope gefunden");
        hookIntoWebSocket(socket);
        return true;
      }

      // Try window.socket
      if (window.socket) {
        console.log("✅ Socket aus window gefunden");
        hookIntoWebSocket(window.socket);
        return true;
      }

      return false;
    };

    // Try immediate check
    if (checkSimpleRoomSocket()) return;

    // Fallback: Override setupRoomHandlers to inject our handler
    const originalSetupRoomHandlers = window.setupRoomHandlers;
    if (originalSetupRoomHandlers) {
      window.setupRoomHandlers = function (...args) {
        console.log("🔧 Hooke in setupRoomHandlers");
        const result = originalSetupRoomHandlers.apply(this, args);

        // Now socket should be available
        setTimeout(() => {
          if (window.socket) {
            console.log("✅ Socket nach setupRoomHandlers gefunden");
            hookIntoWebSocket(window.socket);
          }
        }, 500);

        return result;
      };
    }

    // Fallback: Direct polling
    let pollCount = 0;
    const pollForSocket = () => {
      if (checkSimpleRoomSocket()) return;

      pollCount++;
      if (pollCount < 20) {
        console.log(`🔍 Socket Polling ${pollCount}/20...`);
        setTimeout(pollForSocket, 1000);
      } else {
        console.error("❌ Socket nicht gefunden nach 20 Versuchen");
      }
    };

    setTimeout(pollForSocket, 1000);
  }

  // Fallback: Global nach WebSocket suchen
  function findWebSocketGlobally() {
    console.log("🔍 Suche WebSocket global...");

    // Debug: Zeige alle verfügbaren WebSocket-ähnlichen Objekte
    console.log("🔍 Debug - Verfügbare Objekte:", {
      windowSocket: !!window.socket,
      windowWs: !!window.ws,
      globalSocket: typeof socket !== "undefined" ? !!socket : false,
      simpleRoomSocket: !!window.multiDeviceRoom,
    });

    // Prüfe direkt auf window.socket
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      console.log("✅ WebSocket nach Wartezeit gefunden!");
      hookIntoWebSocket(window.socket);
      return;
    }

    // Fallback: Suche in window nach WebSocket-ähnlichen Objekten
    for (let key in window) {
      try {
        if (
          window[key] &&
          typeof window[key] === "object" &&
          window[key].constructor &&
          window[key].constructor.name === "WebSocket" &&
          window[key].readyState === WebSocket.OPEN
        ) {
          console.log("✅ WebSocket gefunden als:", key);
          hookIntoWebSocket(window[key]);
          return;
        }
      } catch (e) {
        // Ignore access errors
      }
    }

    // Retry logic
    if (findWebSocketGlobally.retries < 15) {
      findWebSocketGlobally.retries++;
      console.log(
        `⏳ Retry ${findWebSocketGlobally.retries}/15 in 1 Sekunde...`
      );
      setTimeout(findWebSocketGlobally, 1000);
    } else {
      console.error("❌ WebSocket nicht gefunden nach 15 Versuchen");
      console.log("🔧 Versuche manuellen Hook...");
      attemptManualWebSocketHook();
    }
  }
  findWebSocketGlobally.retries = 0;

  // Manueller WebSocket Hook als letzter Fallback
  function attemptManualWebSocketHook() {
    console.log("🔧 Manueller WebSocket Hook Versuch...");

    // Überwache window.socket Erstellung
    let socketWatcher = setInterval(() => {
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        console.log("✅ WebSocket endlich gefunden durch Überwachung!");
        clearInterval(socketWatcher);
        hookIntoWebSocket(window.socket);
      }
    }, 500);

    // Stop watching after 30 seconds
    setTimeout(() => {
      clearInterval(socketWatcher);
      console.log("❌ Socket Überwachung gestoppt - WebSocket nicht gefunden");
    }, 30000);
  }

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

    // Ensure local stream is available before adding tracks
    console.log("📹 Prüfe lokalen Stream für PeerConnection...");
    let localStream = window.localStream;

    if (!localStream || localStream.getTracks().length === 0) {
      console.log("⏳ Lokaler Stream nicht verfügbar, warte...");
      try {
        localStream = await waitForLocalStream();
      } catch (error) {
        console.error("❌ Fehler beim Warten auf lokalen Stream:", error);
      }
    }

    // Add local stream tracks
    if (localStream && localStream.getTracks().length > 0) {
      console.log("➕ Füge lokale Tracks zur Room PeerConnection hinzu:");
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
        console.log(`   - ${track.kind} Track hinzugefügt (${track.id})`);
      });
    } else {
      console.error("❌ Kein lokaler Stream verfügbar für Room PeerConnection");
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("📹 Room Video Stream empfangen von:", remoteDeviceId);
      console.log("📹 Stream Details:", {
        streams: event.streams.length,
        tracks: event.streams[0]?.getTracks().length,
      });

      const remoteStream = event.streams[0];
      if (remoteStream) {
        roomVideoStreams.set(remoteDeviceId, remoteStream);
        console.log("💾 Room Stream gespeichert für:", remoteDeviceId);

        // Add to UI
        addRoomVideoToUI(remoteDeviceId, remoteStream);
      } else {
        console.error("❌ Kein Remote Stream in ontrack Event");
      }
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
        console.log(
          "🎉 Room Video Connection established with:",
          remoteDeviceId
        );
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
      console.log("⏳ Warte auf lokalen Stream...");

      const checkStream = () => {
        console.log("🔍 Prüfe lokalen Stream:", {
          windowLocalStream: !!window.localStream,
          hasVideoTracks: window.localStream?.getVideoTracks().length || 0,
          hasAudioTracks: window.localStream?.getAudioTracks().length || 0,
        });

        if (window.localStream && window.localStream.getTracks().length > 0) {
          console.log("✅ Lokaler Stream gefunden!");
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
