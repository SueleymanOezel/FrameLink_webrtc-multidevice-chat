// simple-room.js - Multi-Device mit korrektem Video-Stream Handover

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
        <div id="handover-status" style="margin-top:5px; font-size:12px; color:#666;"></div>
      </div>
    </div>
  `;
  document.body.insertBefore(controls, document.querySelector(".container"));

  const deviceId = document.getElementById("device-id").textContent;
  let inRoom = false;
  let hasCamera = false;
  let externalCallActive = false;
  let isCallMaster = false;
  let roomDeviceCount = 1;
  let handoverInProgress = false;
  let externalPeerId = null; // ID des externen Call-Partners

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
    console.log("🔄 Kamera-Übernahme angefordert");
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

            case "call-handover-init":
              handleCallHandoverInit(msg);
              return;

            case "call-handover-complete":
              handleCallHandoverComplete(msg);
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              roomDeviceCount = msg.devices?.length || 1;
              return;
          }
        }

        // WebRTC Messages: Master-Logic + Handover-Unterstützung
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          if (inRoom && isLocalRoom && hasOtherDevicesInRoom()) {
            // Multi-Device Mode: Komplexe Logic

            if (handoverInProgress && msg.type === "offer") {
              console.log("🔄 Handover-Offer empfangen");
              if (hasCamera) {
                // Ich bin das neue Master-Device, akzeptiere das Offer
                updateHandoverStatus("📥 Empfange Call-Übernahme...");
                if (originalOnMessage) originalOnMessage.call(socket, event);

                // Merke externe Peer ID
                if (msg.from) externalPeerId = msg.from;
              }
              return;
            }

            if (isCallMaster || (!externalCallActive && hasCamera)) {
              console.log(`✅ WebRTC (Master): ${msg.type}`);
              if (originalOnMessage) originalOnMessage.call(socket, event);

              if (msg.type === "offer" || msg.type === "answer") {
                externalCallActive = true;
                if (msg.from) externalPeerId = msg.from;
                broadcastCallStatus();
              }
            } else if (!isCallMaster && externalCallActive) {
              // Slave-Device während externem Call: Ignoriere normale WebRTC
              console.log(`❌ WebRTC ignoriert (Slave): ${msg.type}`);
            } else {
              // Fallback: Normal verarbeiten
              console.log(`✅ WebRTC (Fallback): ${msg.type}`);
              if (originalOnMessage) originalOnMessage.call(socket, event);
            }
          } else {
            // Solo-Device oder kein Room: Normal verarbeiten
            console.log(`✅ WebRTC (Solo): ${msg.type}`);
            if (originalOnMessage) originalOnMessage.call(socket, event);

            if (msg.type === "offer" || msg.type === "answer") {
              externalCallActive = true;
              if (msg.from) externalPeerId = msg.from;
            }
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
      if (window.localVideo)
        window.localVideo.style.border = "4px solid #4caf50";

      // Wenn externer Call aktiv und ich war nicht Master -> Starte Handover
      if (externalCallActive && !wasCallMaster) {
        console.log("🔄 Initiiere Call-Handover");
        initiateCallHandover();
      }
    } else {
      // Jemand anders bekommt die Kamera
      const previousHasCamera = hasCamera;
      hasCamera = false;

      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      document.getElementById("camera-status").textContent =
        `⏸️ ${msg.deviceId} hat Kamera`;
      document.getElementById("camera-status").style.color = "gray";
      if (window.localVideo) window.localVideo.style.border = "2px solid #ccc";

      // Wenn ich war Master und externer Call aktiv -> Bereite Übergabe vor
      if (externalCallActive && previousHasCamera && wasCallMaster) {
        console.log("🔄 Bereite Call-Übergabe vor");
        prepareCallHandover(msg.deviceId);
      }
    }

    broadcastCallStatus();
  }

  // Call-Handover initiieren (neues Master-Device)
  function initiateCallHandover() {
    if (!externalCallActive || !externalPeerId) {
      console.log("❌ Kein aktiver externer Call für Handover");
      return;
    }

    handoverInProgress = true;
    isCallMaster = true;
    updateCallStatus("🔄 Übernehme externen Call");
    updateHandoverStatus("🔄 Initiiere Call-Übernahme...");

    // Informiere Room über Handover-Start
    socket.send(
      JSON.stringify({
        type: "call-handover-init",
        roomId: roomId,
        newMasterDevice: deviceId,
        externalPeerId: externalPeerId,
      })
    );

    // Warte kurz, dann erstelle neue PeerConnection
    setTimeout(() => {
      createNewPeerConnection();
    }, 500);
  }

  // Call-Übergabe vorbereiten (altes Master-Device)
  function prepareCallHandover(newMasterDevice) {
    console.log(`🔄 Bereite Übergabe an ${newMasterDevice} vor`);

    updateCallStatus(`⏳ Übergebe Call an ${newMasterDevice}`);
    updateHandoverStatus("📤 Bereite Übergabe vor...");

    // Informiere das neue Master-Device über den externen Partner
    socket.send(
      JSON.stringify({
        type: "call-handover-init",
        roomId: roomId,
        newMasterDevice: newMasterDevice,
        oldMasterDevice: deviceId,
        externalPeerId: externalPeerId,
      })
    );

    // Kurz warten, dann Connection schließen
    setTimeout(() => {
      completeCallHandover();
    }, 1000);
  }

  // Handover-Initialisierung verarbeiten
  function handleCallHandoverInit(msg) {
    if (msg.newMasterDevice === deviceId) {
      // Ich bin das neue Master-Device
      console.log("📨 Call-Handover Initialisierung empfangen");
      externalPeerId = msg.externalPeerId;
      handoverInProgress = true;
      updateHandoverStatus("📨 Handover-Details empfangen");
    } else if (msg.oldMasterDevice === deviceId) {
      // Ich war das alte Master-Device, bestätige
      updateHandoverStatus("✅ Handover bestätigt");
    }
  }

  // Neue PeerConnection für Handover erstellen
  function createNewPeerConnection() {
    console.log("🔧 Erstelle neue PeerConnection für Handover");
    updateHandoverStatus("🔧 Neue Verbindung aufbauen...");

    // Schließe alte Connection falls vorhanden
    if (window.peerConnection) {
      window.peerConnection.close();
      window.peerConnection = null;
    }

    // Erstelle neue PeerConnection mit lokalem Stream
    if (window.initializePeerConnection) {
      window.initializePeerConnection();

      // Füge lokalen Stream hinzu
      if (window.peerConnection && localStream) {
        localStream.getTracks().forEach((track) => {
          window.peerConnection.addTrack(track, localStream);
        });
      }

      // Erstelle neues Offer für externen Partner
      setTimeout(() => {
        if (window.peerConnection) {
          window.peerConnection.createOffer().then((offer) => {
            window.peerConnection.setLocalDescription(offer);

            // Sende Offer an externen Partner mit Handover-Flag
            socket.send(
              JSON.stringify({
                type: "offer",
                offer: offer,
                handover: true,
                from: deviceId,
              })
            );

            updateHandoverStatus("📤 Handover-Offer gesendet");
            console.log("📤 Handover-Offer an externen Partner gesendet");

            // Handover als fast abgeschlossen markieren
            setTimeout(() => {
              completeHandoverAsNewMaster();
            }, 2000);
          });
        }
      }, 500);
    }
  }

  // Handover als neues Master-Device abschließen
  function completeHandoverAsNewMaster() {
    handoverInProgress = false;
    isCallMaster = true;

    updateCallStatus("📞 Call-Übernahme erfolgreich");
    updateHandoverStatus("✅ Übernahme abgeschlossen");

    // Informiere Room über erfolgreichen Handover
    socket.send(
      JSON.stringify({
        type: "call-handover-complete",
        roomId: roomId,
        newMasterDevice: deviceId,
      })
    );

    // UI nach 3 Sekunden zurücksetzen
    setTimeout(() => {
      updateHandoverStatus("");
    }, 3000);
  }

  // Call-Übergabe abschließen (altes Master-Device)
  function completeCallHandover() {
    isCallMaster = false;
    handoverInProgress = false;

    // PeerConnection schließen
    if (window.peerConnection) {
      console.log("🔌 Schließe alte PeerConnection");
      window.peerConnection.close();
      window.peerConnection = null;
    }

    // Remote Video zurücksetzen
    if (window.remoteVideo) {
      window.remoteVideo.srcObject = null;
    }

    updateCallStatus("⏳ Call übertragen");
    updateHandoverStatus("📤 Übergabe abgeschlossen");

    // UI nach 3 Sekunden zurücksetzen
    setTimeout(() => {
      updateHandoverStatus("");
    }, 3000);
  }

  // Handover-Abschluss verarbeiten
  function handleCallHandoverComplete(msg) {
    if (msg.newMasterDevice !== deviceId) {
      // Anderes Device hat Handover abgeschlossen
      updateCallStatus(`📞 ${msg.newMasterDevice} hat Call übernommen`);
      isCallMaster = false;
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
        externalPeerId: externalPeerId,
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

      if (message.includes("erfolgreich") || message.includes("Master")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeft = "4px solid #28a745";
      } else if (
        message.includes("Übernahme") ||
        message.includes("übertragen")
      ) {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeft = "4px solid #ffc107";
      } else {
        callInfo.style.background = "#f8f9fa";
        callInfo.style.borderLeft = "4px solid #6c757d";
      }
    }
  }

  // Handover Status UI aktualisieren
  function updateHandoverStatus(message) {
    const handoverStatus = document.getElementById("handover-status");
    if (handoverStatus) {
      handoverStatus.textContent = message;
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
      handoverInProgress = false;
      externalPeerId = null;

      updateCallStatus("📞 Call beendet");
      updateHandoverStatus("");
      broadcastCallStatus();

      return originalEndCall.apply(this, arguments);
    };
  }
});
