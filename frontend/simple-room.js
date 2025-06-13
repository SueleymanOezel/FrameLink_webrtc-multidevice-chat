// simple-room.js - Multi-Device mit Call-Handover zwischen Geräten

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
  let hasActivePeerConnection = false;

  // Room beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("Server noch nicht verbunden!");
      return;
    }

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
    if (window.startCall) {
      window.startCall();
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

            case "call-status-sync":
              syncCallStatus(msg);
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              return;
          }
        }

        // WebRTC Messages: Nur verarbeiten wenn dieses Gerät aktive Kamera hat
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          // Wenn ich im Room bin, nur WebRTC verarbeiten wenn ich die aktive Kamera habe
          if (inRoom && isLocalRoom) {
            if (hasCamera || !externalCallActive) {
              // Ich habe die Kamera oder noch kein Call aktiv -> verarbeiten
              if (originalOnMessage) originalOnMessage.call(socket, event);

              // Call Status synchronisieren
              if (msg.type === "offer" || msg.type === "answer") {
                externalCallActive = true;
                broadcastCallStatus();
              }
            } else {
              // Ich habe keine Kamera und Call ist aktiv -> ignorieren
              console.log("WebRTC Message ignoriert - keine aktive Kamera");
            }
          } else {
            // Nicht im Room -> normale Verarbeitung
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

  // Kamera Switch Handler mit Call-Handover
  function handleCameraSwitch(msg) {
    const wasMyCamera = hasCamera;

    if (msg.deviceId === deviceId) {
      // Ich bekomme die Kamera
      hasCamera = true;

      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      }

      document.getElementById("camera-status").textContent = "📹 KAMERA AKTIV";
      document.getElementById("camera-status").style.color = "green";
      localVideo.style.border = "4px solid #4caf50";

      // Wenn Call aktiv ist und ich hatte vorher keine Kamera -> Call übernehmen
      if (externalCallActive && !wasMyCamera) {
        console.log("🔄 Übernehme aktiven Call mit neuer Kamera");
        takeoverActiveCall();
      }
    } else {
      // Jemand anders bekommt die Kamera
      const previousCamera = hasCamera;
      hasCamera = false;

      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      document.getElementById("camera-status").textContent =
        `⏸️ ${msg.deviceId} hat Kamera`;
      document.getElementById("camera-status").style.color = "gray";
      localVideo.style.border = "2px solid #ccc";

      // Wenn ich hatte die Kamera und Call war aktiv -> Call übergeben
      if (externalCallActive && previousCamera) {
        console.log("🔄 Übergebe aktiven Call an anderes Gerät");
        handoverActiveCall(msg.deviceId);
      }
    }

    broadcastCallStatus();
  }

  // Aktiven Call übernehmen (wenn ich Kamera bekomme)
  function takeoverActiveCall() {
    console.log("🔥 Call-Takeover gestartet");

    // Erstelle neue PeerConnection für mich
    if (window.createPeerConnection) {
      window.createPeerConnection();

      // Trigger re-negotiation durch neues Offer
      setTimeout(() => {
        if (window.peerConnection && hasCamera) {
          window.peerConnection.createOffer().then((offer) => {
            window.peerConnection.setLocalDescription(offer);

            // Sende neues Offer mit Call-Takeover Flag
            socket.send(
              JSON.stringify({
                type: "offer",
                offer: offer,
                roomId: roomId,
                deviceHandover: deviceId,
              })
            );

            console.log("📤 Neues Offer gesendet für Call-Takeover");
            updateCallStatus(`📹 Call aktiv (von ${deviceId})`);
          });
        }
      }, 500);
    }
  }

  // Call an anderes Gerät übergeben
  function handoverActiveCall(newDevice) {
    console.log(`🔄 Übergebe Call an ${newDevice}`);

    // Meine PeerConnection beenden
    if (window.peerConnection) {
      window.peerConnection.close();
      window.peerConnection = null;
    }

    // Remote Video zurücksetzen
    if (window.remoteVideo) {
      window.remoteVideo.srcObject = null;
    }

    updateCallStatus(`⏳ Call übertragen an ${newDevice}`);

    // Call-Handover Signal senden
    socket.send(
      JSON.stringify({
        type: "call-handover",
        roomId: roomId,
        fromDevice: deviceId,
        toDevice: newDevice,
      })
    );
  }

  // Call Status synchronisieren
  function broadcastCallStatus() {
    if (!inRoom) return;

    socket.send(
      JSON.stringify({
        type: "call-status-sync",
        roomId: roomId,
        deviceId: deviceId,
        hasCamera: hasCamera,
        callActive: externalCallActive,
        hasConnection: !!window.peerConnection,
      })
    );
  }

  // Call Status von anderen Geräten empfangen
  function syncCallStatus(msg) {
    if (msg.deviceId === deviceId) return; // Eigene Messages ignorieren

    // Wenn anderes Gerät Call aktiviert hat
    if (msg.callActive && !externalCallActive) {
      externalCallActive = true;
      updateCallStatus(`📞 Call aktiv (von ${msg.deviceId})`);
    }

    // Wenn alle Geräte Call beendet haben
    if (!msg.callActive && externalCallActive) {
      const otherDevicesWithCall = false; // Könnte erweitert werden
      if (!otherDevicesWithCall) {
        externalCallActive = false;
        updateCallStatus("📞 Call beendet");
      }
    }
  }

  // Call Status UI aktualisieren
  function updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;

      // Farbe je nach Status
      if (message.includes("aktiv")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeft = "4px solid #28a745";
      } else if (
        message.includes("übertragen") ||
        message.includes("beendet")
      ) {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeft = "4px solid #ffc107";
      }
    }
  }

  // Original Funktionen erweitern
  const originalStartCall = window.startCall;
  if (originalStartCall) {
    window.startCall = function () {
      // Call Status setzen
      externalCallActive = true;
      hasActivePeerConnection = true;

      console.log("🚀 Video-Call gestartet");
      updateCallStatus(`📹 Call gestartet von ${deviceId}`);

      // Nur wenn ich die Kamera habe oder im Room bin
      if (hasCamera || !inRoom) {
        broadcastCallStatus();
        return originalStartCall.apply(this, arguments);
      } else {
        console.log("⚠️ Call gestartet aber keine aktive Kamera");
        updateCallStatus("⚠️ Call ohne aktive Kamera");
      }
    };
  }

  // End Call erweitern
  const originalEndCall = window.endCall;
  if (originalEndCall) {
    window.endCall = function () {
      externalCallActive = false;
      hasActivePeerConnection = false;

      updateCallStatus("📞 Call beendet");
      broadcastCallStatus();

      return originalEndCall.apply(this, arguments);
    };
  }

  // WebRTC Connection State Monitoring
  if (window.addEventListener) {
    window.addEventListener("beforeunload", () => {
      if (externalCallActive) {
        broadcastCallStatus();
      }
    });
  }
});
