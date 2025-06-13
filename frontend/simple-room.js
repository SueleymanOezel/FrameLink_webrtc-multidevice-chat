// simple-room.js - Robuste Multi-Device Logic

window.addEventListener("load", () => {
  // Room ID aus URL oder generieren
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");
  let isLocalRoom = false;

  if (!roomId) {
    // Neuer Room
    roomId = "room-" + Math.random().toString(36).substr(2, 8);
    window.history.replaceState({}, "", "?room=" + roomId);
    isLocalRoom = true;

    // Info anzeigen
    const info = document.createElement("div");
    info.style.cssText =
      "background:#e3f2fd; padding:20px; margin:20px auto; max-width:600px; border-radius:8px;";
    info.innerHTML = `
      <h2>📹 Smart Multi-Device Room</h2>
      <p><strong>Room ID:</strong> ${roomId}</p>
      <p>Diese URL funktioniert für beides:</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px;" onclick="this.select()">
      <div style="margin-top:15px; padding:12px; background:white; border-radius:4px;">
        <p><strong>🎯 Wie es funktioniert:</strong></p>
        <p>✓ <strong>Multi-Device:</strong> Öffne auf mehreren eigenen Geräten</p>
        <p>✓ <strong>Video-Chat:</strong> Teile URL mit anderen für Video-Calls</p>
        <p>✓ <strong>Smart Switch:</strong> Kamera-Wechsel funktioniert auch während Calls!</p>
      </div>
    `;
    document.body.insertBefore(info, document.body.firstChild);
  }

  // Room Controls hinzufügen
  const controls = document.createElement("div");
  controls.style.cssText =
    "background:#fff3cd; padding:15px; margin:20px auto; max-width:600px; border-radius:8px; text-align:center;";
  controls.innerHTML = `
    <h3>🏠 Room: ${roomId}</h3>
    <p>Device: <code id="device-id">${Math.random().toString(36).substr(2, 6)}</code></p>
    
    <div style="display:flex; justify-content:center; gap:10px; margin:15px 0; flex-wrap:wrap;">
      <button id="join-room" style="padding:10px 18px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:14px;">
        🚪 Multi-Device aktivieren
      </button>
      <button id="video-call-btn" style="padding:10px 18px; background:#4caf50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:14px;">
        📞 Video-Call starten
      </button>
    </div>
    
    <div id="room-controls" style="display:none; margin-top:15px;">
      <button id="take-camera" style="padding:8px 16px; margin:5px; background:#4caf50; color:white; border:none; border-radius:4px;">
        📹 Kamera übernehmen
      </button>
      <p id="camera-status" style="margin:8px 0; font-weight:bold; font-size:14px;">⏸️ Kamera inaktiv</p>
      <div id="call-info" style="margin:10px 0; padding:8px; background:#f8f9fa; border-radius:4px; display:none; font-size:13px;">
        <div id="call-status">📞 Kein aktiver Call</div>
      </div>
    </div>
  `;
  document.body.insertBefore(controls, document.querySelector(".container"));

  const deviceId = document.getElementById("device-id").textContent;
  let inRoom = false;
  let hasCamera = false;
  let roomDeviceCount = 1;

  // Vereinfachte Call-States
  let callActiveWithExternal = false; // Echter externer Call aktiv
  let amCurrentCameraMaster = false; // Ich bin aktuell der Camera-Master

  // Room beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("Server noch nicht verbunden!");
      return;
    }

    console.log("🚪 Multi-Device beitreten - Debug Start");
    console.log("Socket state:", socket.readyState);
    console.log("Original onmessage:", typeof socket.onmessage);

    // Prüfe ob bereits ein Call aktiv ist
    detectExistingCall();

    socket.send(
      JSON.stringify({
        type: "join-room",
        roomId: roomId,
        deviceId: deviceId,
      })
    );

    document.getElementById("join-room").disabled = true;
    document.getElementById("join-room").textContent = "✅ Multi-Device aktiv";
    document.getElementById("room-controls").style.display = "block";

    inRoom = true;
    isLocalRoom = true;
    console.log("📞 Calling setupRoomHandlers...");
    setupRoomHandlers();
    console.log("✅ setupRoomHandlers completed");
  });

  // Prüfe ob bereits ein Call aktiv ist
  function detectExistingCall() {
    console.log("🔍 Prüfe existierenden Call...");

    // Prüfe PeerConnection State
    if (window.peerConnection) {
      const state = window.peerConnection.connectionState;
      console.log("PeerConnection State:", state);

      if (state === "connected" || state === "connecting") {
        callActiveWithExternal = true;
        console.log(
          "✅ Externer Call detected - callActiveWithExternal:",
          true
        );
        updateCallStatus("📞 Laufender Call erkannt");

        // Prüfe ob ich Kamera habe
        if (window.localStream) {
          const videoTracks = window.localStream.getVideoTracks();
          const hasActiveVideo = videoTracks.some((track) => track.enabled);

          if (hasActiveVideo) {
            hasCamera = true;
            amCurrentCameraMaster = true;
            console.log("✅ Aktive Kamera erkannt");
            document.getElementById("camera-status").textContent =
              "📹 KAMERA AKTIV";
            document.getElementById("camera-status").style.color = "green";
            if (window.localVideo)
              window.localVideo.style.border = "4px solid #4caf50";
          }
        }
      }
    }

    // Zusätzlich: Prüfe ob Remote Video läuft
    if (window.remoteVideo && window.remoteVideo.srcObject) {
      console.log("✅ Remote Video Stream erkannt");
      callActiveWithExternal = true;
    }
  }
  document.getElementById("video-call-btn").addEventListener("click", () => {
    console.log(
      `🎯 Video-Call Start - inRoom: ${inRoom}, devices: ${roomDeviceCount}, hasCamera: ${hasCamera}`
    );

    if (inRoom && roomDeviceCount > 1) {
      // Multi-Device: Nur Gerät mit Kamera darf callen
      if (hasCamera) {
        console.log("✅ Multi-Device Call mit Kamera");
        if (window.startCall) window.startCall();
      } else {
        console.log("❌ Multi-Device Call ohne Kamera - fordere Kamera an");
        alert(
          "Du brauchst die Kamera für einen Call! Klicke 'Kamera übernehmen'"
        );
      }
    } else {
      // Solo oder kein Room: Normal callen
      console.log("✅ Solo/Normal Call");
      if (window.startCall) window.startCall();
    }
  });

  // Kamera übernehmen
  document.getElementById("take-camera").addEventListener("click", () => {
    if (!inRoom) return;
    console.log("🔄 Kamera-Übernahme angefordert");
    socket.send(
      JSON.stringify({
        type: "camera-request",
        roomId: roomId,
        deviceId: deviceId,
      })
    );
  });

  // Room Message Handler
  function setupRoomHandlers() {
    console.log("🔧 setupRoomHandlers() gestartet");

    const originalOnMessage = socket.onmessage;
    console.log("Original onmessage gefunden:", typeof originalOnMessage);
    console.log(
      "Original onmessage function:",
      originalOnMessage.toString().slice(0, 100) + "..."
    );

    socket.onmessage = async (event) => {
      console.log("📨 Message empfangen in Room-Handler");

      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);
        console.log("📨 Parsed message:", msg.type, msg.roomId || "no-room");

        // Room Messages verarbeiten
        if (msg.roomId === roomId && inRoom && isLocalRoom) {
          console.log("🏠 Room message verarbeiten:", msg.type);

          switch (msg.type) {
            case "camera-request":
              console.log("📹 Camera request verarbeiten");
              handleCameraSwitch(msg);
              return;

            case "call-status-sync":
              console.log("📞 Call status sync");
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              roomDeviceCount = msg.devices?.length || 1;
              return;
          }
        }

        // WebRTC Messages: VEREINFACHTE LOGIC
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          console.log("🔍 WebRTC Message:", msg.type);
          console.log("   - inRoom:", inRoom, "isLocalRoom:", isLocalRoom);
          console.log(
            "   - hasCamera:",
            hasCamera,
            "callActiveWithExternal:",
            callActiveWithExternal
          );
          console.log("   - roomDeviceCount:", roomDeviceCount);

          // REGEL 1: Wenn ich nicht im Room bin → Normal verarbeiten
          if (!inRoom || !isLocalRoom) {
            console.log("✅ WebRTC (nicht im Room): Normal verarbeiten");
            if (originalOnMessage) originalOnMessage.call(socket, event);
            return;
          }

          // REGEL 2: Wenn ich alleine im Room bin → Normal verarbeiten
          if (roomDeviceCount <= 1) {
            console.log("✅ WebRTC (Solo im Room): Normal verarbeiten");
            if (originalOnMessage) originalOnMessage.call(socket, event);
            if (msg.type === "offer" || msg.type === "answer") {
              callActiveWithExternal = true;
              updateCallStatus("📞 Externer Call aktiv");
            }
            return;
          }

          // REGEL 3: Multi-Device Room Logic
          const shouldProcessWebRTC =
            hasCamera || !callActiveWithExternal || roomDeviceCount === 1;

          console.log("   - shouldProcessWebRTC:", shouldProcessWebRTC);
          console.log(
            "   - Grund: hasCamera(" +
              hasCamera +
              ") || !callActiveWithExternal(" +
              !callActiveWithExternal +
              ") || soloDevice(" +
              (roomDeviceCount === 1) +
              ")"
          );

          if (shouldProcessWebRTC) {
            console.log("✅ WebRTC Message wird verarbeitet:", msg.type);
            console.log("📞 Calling originalOnMessage...");
            if (originalOnMessage) originalOnMessage.call(socket, event);

            // Call Status aktualisieren
            if (msg.type === "offer" || msg.type === "answer") {
              callActiveWithExternal = true;
              amCurrentCameraMaster = hasCamera;
              updateCallStatus(
                hasCamera
                  ? "📞 Externer Call (Master)"
                  : "📞 Externer Call empfangen"
              );
            }
          } else {
            console.log(
              "❌ WebRTC Message ignoriert (Multi-Device ohne Kamera):",
              msg.type
            );
          }

          return;
        }

        // Andere Messages weiterleiten
        console.log("📨 Andere Message weitergeleitet:", msg.type);
        if (originalOnMessage) originalOnMessage.call(socket, event);
      } catch (e) {
        console.log("📨 Parse Error - direkt weiterleiten");
        if (originalOnMessage) originalOnMessage.call(socket, event);
      }
    };

    console.log("✅ Room handler installiert");

    // Initial setup
    if (window.localStream) {
      window.localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
  }

  // VEREINFACHTE Kamera Switch Logic
  function handleCameraSwitch(msg) {
    const wasMyCamera = hasCamera;

    if (msg.deviceId === deviceId) {
      // Ich bekomme die Kamera
      hasCamera = true;
      amCurrentCameraMaster = callActiveWithExternal;

      if (window.localStream) {
        window.localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      }

      document.getElementById("camera-status").textContent = "📹 KAMERA AKTIV";
      document.getElementById("camera-status").style.color = "green";
      if (window.localVideo)
        window.localVideo.style.border = "4px solid #4caf50";

      console.log(
        "✅ Kamera übernommen - hasCamera:",
        hasCamera,
        "callActive:",
        callActiveWithExternal
      );

      // Re-check für aktiven Call falls nicht detected
      if (!callActiveWithExternal) {
        console.log("🔍 Re-check für aktiven Call...");
        detectExistingCall();
      }

      // Wenn externer Call aktiv → Initiiere Takeover
      if (callActiveWithExternal && !wasMyCamera) {
        console.log("🔄 Übernehme aktiven Call mit neuer Kamera");
        setTimeout(() => {
          initiateCallTakeover();
        }, 500);
      }
    } else {
      // Jemand anders bekommt die Kamera
      hasCamera = false;

      if (window.localStream) {
        window.localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      document.getElementById("camera-status").textContent =
        `⏸️ ${msg.deviceId} hat Kamera`;
      document.getElementById("camera-status").style.color = "gray";
      if (window.localVideo) window.localVideo.style.border = "2px solid #ccc";

      console.log("⏸️ Kamera abgegeben an:", msg.deviceId);

      // Wenn ich hatte Call-Master → Übergebe
      if (callActiveWithExternal && wasMyCamera) {
        console.log("🔄 Übergebe aktiven Call an anderes Gerät");
        handoverCallToDevice(msg.deviceId);
      }
    }
  }

  // VEREINFACHTE Call-Takeover Logic
  function initiateCallTakeover() {
    console.log("🔥 Call-Takeover gestartet");

    if (!callActiveWithExternal) {
      console.log(
        "❌ Kein aktiver Call für Takeover - Prüfe PeerConnection..."
      );

      // Fallback: Prüfe PeerConnection direkt
      if (
        window.peerConnection &&
        window.peerConnection.connectionState === "connected"
      ) {
        console.log("✅ Connected PeerConnection gefunden - forciere Takeover");
        callActiveWithExternal = true;
      } else {
        console.log("❌ Keine aktive PeerConnection für Takeover");
        return;
      }
    }

    updateCallStatus("🔄 Übernehme Call...");

    // Erstelle neues Offer mit aktueller Kamera
    setTimeout(() => {
      if (window.peerConnection && hasCamera) {
        console.log("🔧 Erstelle Takeover-Offer...");

        // Stelle sicher dass lokaler Stream in PeerConnection ist
        if (window.localStream) {
          // Entferne alte Tracks
          const senders = window.peerConnection.getSenders();
          senders.forEach((sender) => {
            if (sender.track) {
              window.peerConnection.removeTrack(sender);
            }
          });

          // Füge neue Tracks hinzu
          window.localStream.getTracks().forEach((track) => {
            console.log("➕ Füge Track hinzu:", track.kind, track.enabled);
            window.peerConnection.addTrack(track, window.localStream);
          });
        }

        // Neues Offer erstellen
        window.peerConnection
          .createOffer()
          .then((offer) => {
            window.peerConnection.setLocalDescription(offer);
            socket.send(
              JSON.stringify({
                type: "offer",
                offer: offer,
              })
            );
            console.log("📤 Takeover-Offer gesendet");
            updateCallStatus("📞 Call-Übernahme aktiv");
          })
          .catch((err) => {
            console.log("❌ Takeover-Offer Fehler:", err);
          });
      } else {
        console.log("❌ Kein PeerConnection oder keine Kamera für Takeover");
      }
    }, 300);
  }

  // Call an anderes Gerät übergeben
  function handoverCallToDevice(newMasterDevice) {
    console.log("🔄 Übergebe Call an", newMasterDevice);

    updateCallStatus(`⏳ Call übertragen an ${newMasterDevice}`);
    amCurrentCameraMaster = false;

    // Für saubere Übergabe: PeerConnection nicht sofort schließen
    // Lasse das neue Master-Device den Call übernehmen
  }

  // Call Status UI aktualisieren
  function updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;

      if (message.includes("aktiv") || message.includes("Master")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeft = "4px solid #28a745";
      } else if (
        message.includes("übertragen") ||
        message.includes("Übernahme")
      ) {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeft = "4px solid #ffc107";
      } else {
        callInfo.style.background = "#f8f9fa";
        callInfo.style.borderLeft = "4px solid #6c757d";
      }
    }
  }

  // Original startCall erweitern
  const originalStartCall = window.startCall;
  if (originalStartCall) {
    window.startCall = function () {
      console.log(
        `🚀 startCall() - inRoom: ${inRoom}, devices: ${roomDeviceCount}, hasCamera: ${hasCamera}`
      );

      // Multi-Device: Nur mit Kamera
      if (inRoom && roomDeviceCount > 1 && !hasCamera) {
        console.log("⚠️ Call-Start ignoriert - keine Kamera in Multi-Device");
        alert("Du brauchst die Kamera für einen Call!");
        return;
      }

      // Call starten
      callActiveWithExternal = true;
      amCurrentCameraMaster = hasCamera;
      updateCallStatus("📞 Call wird gestartet...");

      const result = originalStartCall.apply(this, arguments);

      if (hasCamera) {
        updateCallStatus("📞 Externer Call aktiv (Master)");
      }

      return result;
    };
  }

  // End Call erweitern
  const originalEndCall = window.endCall;
  if (originalEndCall) {
    window.endCall = function () {
      callActiveWithExternal = false;
      amCurrentCameraMaster = false;

      updateCallStatus("📞 Call beendet");

      return originalEndCall.apply(this, arguments);
    };
  }
});
