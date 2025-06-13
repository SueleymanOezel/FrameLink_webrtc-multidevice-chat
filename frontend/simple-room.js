// simple-room.js - Multi-Device mit korrekter Call-Logik

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
  let externalCallActive = false;
  let isCallMaster = false; // Nur Master-Device führt externe Calls
  let roomDeviceCount = 1;

  // Hilfsfunktion: Prüfe ob andere Geräte im Room sind
  function hasOtherDevicesInRoom() {
    return roomDeviceCount > 1;
  }

  // Room beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("Server noch nicht verbunden!");
      return;
    }

    console.log("🚪 Multi-Device beitreten");

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
    setupRoomHandlers();
  });

  // Video-Call starten
  document.getElementById("video-call-btn").addEventListener("click", () => {
    if (inRoom && hasOtherDevicesInRoom()) {
      // Multi-Device Room: Koordinierter externe Call
      startCoordinatedExternalCall();
    } else {
      // Normaler Call (kein Room oder Solo-Device)
      if (window.startCall) window.startCall();
    }
  });

  // Kamera übernehmen
  document.getElementById("take-camera").addEventListener("click", () => {
    if (!inRoom) return;
    socket.send(
      JSON.stringify({
        type: "camera-request",
        roomId: roomId,
        deviceId: deviceId,
      })
    );
  });

  // Koordinierter externer Call für Multi-Device
  function startCoordinatedExternalCall() {
    console.log("🎯 Koordinierter externer Call gestartet");

    if (hasCamera) {
      // Ich habe die Kamera -> Ich werde Master
      isCallMaster = true;
      updateCallStatus("📞 Starte externen Call (Master)");

      // Informiere andere Geräte dass ich Master bin
      socket.send(
        JSON.stringify({
          type: "external-call-master",
          roomId: roomId,
          masterDevice: deviceId,
        })
      );

      // Externer Call starten
      if (window.startCall) {
        window.startCall();
      }
    } else {
      // Ich habe keine Kamera -> Werde Slave
      isCallMaster = false;
      updateCallStatus("⏳ Warte auf Master Device...");

      // Bitte das Gerät mit Kamera den Call zu starten
      socket.send(
        JSON.stringify({
          type: "request-external-call",
          roomId: roomId,
          requestingDevice: deviceId,
        })
      );
    }
  }

  // Room Message Handler
  function setupRoomHandlers() {
    const originalOnMessage = socket.onmessage;

    socket.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);

        // Room Messages verarbeiten
        if (msg.roomId === roomId && inRoom && isLocalRoom) {
          switch (msg.type) {
            case "camera-request":
              handleCameraSwitch(msg);
              return;

            case "external-call-master":
              if (msg.masterDevice !== deviceId) {
                isCallMaster = false;
                updateCallStatus(`📞 ${msg.masterDevice} führt externen Call`);
              }
              return;

            case "request-external-call":
              if (hasCamera) {
                console.log(
                  `📞 ${msg.requestingDevice} bittet um externen Call`
                );
                startCoordinatedExternalCall();
              }
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              roomDeviceCount = msg.devices?.length || 1;
              return;
          }
        }

        // WebRTC Messages: Nur Master verarbeitet externe Calls
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          if (inRoom && isLocalRoom && hasOtherDevicesInRoom()) {
            // Multi-Device Mode: Nur Master verarbeitet externe WebRTC
            if (isCallMaster || !externalCallActive) {
              console.log(`✅ WebRTC (Master): ${msg.type}`);
              if (originalOnMessage) originalOnMessage.call(socket, event);

              if (msg.type === "offer" || msg.type === "answer") {
                externalCallActive = true;
                broadcastCallStatus();
              }
            } else {
              console.log(`❌ WebRTC ignoriert (nicht Master): ${msg.type}`);
            }
          } else {
            // Solo-Device oder kein Room: Normal verarbeiten
            console.log(`✅ WebRTC (Solo/Normal): ${msg.type}`);
            if (originalOnMessage) originalOnMessage.call(socket, event);
          }
        } else {
          // Andere Messages normal weiterleiten
          if (originalOnMessage) originalOnMessage.call(socket, event);
        }
      } catch (e) {
        if (originalOnMessage) originalOnMessage.call(socket, event);
      }
    };

    // Initial setup
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
  }

  // Kamera Switch Handler mit echtem Call-Handover
  function handleCameraSwitch(msg) {
    const wasMyCamera = hasCamera;
    const wasCallMaster = isCallMaster;

    if (msg.deviceId === deviceId) {
      // Ich bekomme die Kamera
      hasCamera = true;

      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      }

      document.getElementById("camera-status").textContent = "📹 KAMERA AKTIV";
      document.getElementById("camera-status").style.color = "green";
      localVideo.style.border = "4px solid #4caf50";

      // Wenn externer Call aktiv und ich war nicht Master -> Übernehme Call
      if (externalCallActive && !wasCallMaster) {
        console.log("🔄 Übernehme Master-Role für externen Call");
        takeoverExternalCall();
      }
    } else {
      // Jemand anders bekommt die Kamera
      hasCamera = false;

      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      document.getElementById("camera-status").textContent =
        `⏸️ ${msg.deviceId} hat Kamera`;
      document.getElementById("camera-status").style.color = "gray";
      localVideo.style.border = "2px solid #ccc";

      // Wenn ich war Master und externer Call aktiv -> Übergebe Call
      if (externalCallActive && wasCallMaster) {
        console.log("🔄 Übergebe Master-Role an anderes Gerät");
        handoverExternalCall(msg.deviceId);
      }
    }

    broadcastCallStatus();
  }

  // Externen Call übernehmen
  function takeoverExternalCall() {
    isCallMaster = true;
    updateCallStatus("🔄 Übernehme externen Call");

    // Informiere alle über neuen Master
    socket.send(
      JSON.stringify({
        type: "external-call-master",
        roomId: roomId,
        masterDevice: deviceId,
      })
    );

    // Erstelle neue PeerConnection für externen Call
    setTimeout(() => {
      if (window.peerConnection) {
        // Re-negotiate mit externem Partner
        window.peerConnection.createOffer().then((offer) => {
          window.peerConnection.setLocalDescription(offer);
          socket.send(
            JSON.stringify({
              type: "offer",
              offer: offer,
            })
          );
          console.log("📤 Neues Offer für Call-Takeover gesendet");
        });
      }
    }, 500);
  }

  // Externen Call übergeben
  function handoverExternalCall(newMasterDevice) {
    isCallMaster = false;
    updateCallStatus(`⏳ Call übertragen an ${newMasterDevice}`);

    // PeerConnection schließen
    if (window.peerConnection) {
      window.peerConnection.close();
      window.peerConnection = null;
    }

    // Remote Video zurücksetzen
    if (window.remoteVideo) {
      window.remoteVideo.srcObject = null;
    }
  }

  // Call Status broadcast
  function broadcastCallStatus() {
    if (!inRoom) return;

    socket.send(
      JSON.stringify({
        type: "call-status-sync",
        roomId: roomId,
        deviceId: deviceId,
        hasCamera: hasCamera,
        isCallMaster: isCallMaster,
        callActive: externalCallActive,
      })
    );
  }

  // Call Status UI aktualisieren
  function updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;

      if (message.includes("Master") || message.includes("aktiv")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeft = "4px solid #28a745";
      } else {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeft = "4px solid #ffc107";
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

      // Wenn Multi-Device Room: Master-Logic anwenden
      if (inRoom && hasOtherDevicesInRoom()) {
        if (hasCamera) {
          externalCallActive = true;
          isCallMaster = true;
          updateCallStatus("📞 Externer Call aktiv (Master)");
          broadcastCallStatus();
          return originalStartCall.apply(this, arguments);
        } else {
          console.log("⚠️ Call-Start ignoriert - keine Kamera in Multi-Device");
          return;
        }
      } else {
        // Solo-Device oder kein Room: Normal
        externalCallActive = true;
        return originalStartCall.apply(this, arguments);
      }
    };
  }

  // End Call erweitern
  const originalEndCall = window.endCall;
  if (originalEndCall) {
    window.endCall = function () {
      externalCallActive = false;
      isCallMaster = false;

      updateCallStatus("📞 Call beendet");
      broadcastCallStatus();

      return originalEndCall.apply(this, arguments);
    };
  }
});
