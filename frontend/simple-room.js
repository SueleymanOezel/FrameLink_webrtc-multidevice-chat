// simple-room.js - Einfaches Room System für Multi-Device + Video-Chat

window.addEventListener("load", () => {
  // Room ID aus URL oder generieren
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");
  let isLocalRoom = false; // Flag für lokales Multi-Device Management

  if (!roomId) {
    // Neuer Room
    roomId = "room-" + Math.random().toString(36).substr(2, 8);
    window.history.replaceState({}, "", "?room=" + roomId);
    isLocalRoom = true; // Das ist ein lokaler Room für eigene Geräte

    // Info anzeigen
    const info = document.createElement("div");
    info.style.cssText =
      "background:#e3f2fd; padding:20px; margin:20px auto; max-width:600px; border-radius:8px;";
    info.innerHTML = `
      <h2>📹 Multi-Device Room erstellt!</h2>
      <p><strong>Room ID:</strong> ${roomId}</p>
      <p>Öffne diese URL auf allen deinen Geräten:</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px;" onclick="this.select()">
      <div style="margin-top:20px; padding:15px; background:white; border-radius:4px;">
        <h3>So funktioniert's:</h3>
        <ol>
          <li>📱 <strong>Multi-Device:</strong> Öffne diese URL auf allen deinen Geräten und klicke "Room beitreten"</li>
          <li>👥 <strong>Video-Chat:</strong> Teile diese URL mit anderen Personen für Video-Calls</li>
          <li>🎥 <strong>Kamera-Switch:</strong> Nutze "Kamera übernehmen" zum Wechseln zwischen Geräten</li>
        </ol>
      </div>
    `;
    document.body.insertBefore(info, document.body.firstChild);
  } else {
    // Existierender Room - könnte lokaler Multi-Device oder Video-Chat sein
    isLocalRoom = false; // Standardmäßig als Video-Chat behandeln
  }

  // Room Controls hinzufügen
  const controls = document.createElement("div");
  controls.style.cssText =
    "background:#fff3cd; padding:15px; margin:20px auto; max-width:600px; border-radius:8px; text-align:center;";
  controls.innerHTML = `
    <h3>🏠 Room: ${roomId}</h3>
    <p>Device: <code id="device-id">${Math.random().toString(36).substr(2, 6)}</code></p>
    
    <div style="display:flex; justify-content:center; gap:15px; margin:10px 0;">
      <button id="join-room" style="padding:15px 25px; background:#2196F3; color:white; border:none; border-radius:4px; font-size:16px; cursor:pointer;">
        🚪 Multi-Device beitreten
      </button>
      <div style="border-left:2px solid #ddd; margin:0 10px;"></div>
      <div>
        <p style="margin:5px 0; font-size:14px;"><strong>Video-Chat mit anderen:</strong></p>
        <button id="external-call" onclick="document.getElementById('startCall').click()" style="padding:15px 25px; background:#4caf50; color:white; border:none; border-radius:4px; font-size:16px; cursor:pointer;">
          📞 Video-Call starten
        </button>
      </div>
    </div>
    
    <div id="room-controls" style="display:none; margin-top:20px;">
      <button id="take-camera" style="padding:10px 20px; margin:5px; background:#4caf50; color:white; border:none; border-radius:4px;">
        📹 Kamera übernehmen
      </button>
      <p id="camera-status" style="margin-top:10px; font-weight:bold;">Status: Warte...</p>
    </div>
  `;
  document.body.insertBefore(controls, document.querySelector(".container"));

  // Start-Button für Video-Calls mit anderen Personen weiterhin verfügbar lassen
  // document.getElementById("startCall").style.display = "none";

  const deviceId = document.getElementById("device-id").textContent;
  let inRoom = false;
  let hasCamera = false;

  // Room beitreten (für Multi-Device Management)
  document.getElementById("join-room").addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("Noch nicht mit Server verbunden! Bitte warten...");
      return;
    }

    // Sende Join-Message
    socket.send(
      JSON.stringify({
        type: "join-room",
        roomId: roomId,
        deviceId: deviceId,
      })
    );

    document.getElementById("join-room").disabled = true;
    document.getElementById("join-room").textContent =
      "✅ Im Multi-Device Room";
    document.getElementById("room-controls").style.display = "block";

    inRoom = true;
    isLocalRoom = true; // Jetzt definitiv lokaler Room
    setupRoomHandlers();
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

        // **WICHTIG:** Room-spezifische Messages nur verarbeiten wenn wir im lokalen Room sind
        if (msg.roomId === roomId && inRoom && isLocalRoom) {
          switch (msg.type) {
            case "camera-request":
              // Jemand will die Kamera
              if (msg.deviceId === deviceId) {
                // Ich bekomme sie
                hasCamera = true;
                if (localStream) {
                  localStream
                    .getVideoTracks()
                    .forEach((t) => (t.enabled = true));
                }
                document.getElementById("camera-status").textContent =
                  "📹 KAMERA AKTIV";
                document.getElementById("camera-status").style.color = "green";
                localVideo.style.border = "4px solid #4caf50";
              } else {
                // Jemand anders bekommt sie
                hasCamera = false;
                if (localStream) {
                  localStream
                    .getVideoTracks()
                    .forEach((t) => (t.enabled = false));
                }
                document.getElementById("camera-status").textContent =
                  `⏸️ ${msg.deviceId} hat Kamera`;
                document.getElementById("camera-status").style.color = "gray";
                localVideo.style.border = "2px solid #ccc";
              }
              return; // Diese Message NICHT weiterleiten

            case "room-update":
              console.log(`Room Update: ${msg.devices.length} Geräte im Room`);
              return; // Diese Message NICHT weiterleiten
          }
        }

        // **WebRTC Messages:** Immer verarbeiten für Video-Chat Funktionalität
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          // Aber NICHT die lokalen Room-WebRTC Messages
          if (!(msg.roomId === roomId && inRoom && isLocalRoom)) {
            // Original handler für externe WebRTC Calls
            if (originalOnMessage) originalOnMessage.call(socket, event);
          }
        } else {
          // Alle anderen Messages normal weiterleiten
          if (originalOnMessage) originalOnMessage.call(socket, event);
        }
      } catch (e) {
        // Keine JSON Message - normal weiterleiten
        if (originalOnMessage) originalOnMessage.call(socket, event);
      }
    };

    // Initial: Kamera aus (nur wenn im lokalen Room)
    if (localStream && isLocalRoom) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
    if (isLocalRoom) {
      document.getElementById("camera-status").textContent =
        "⏸️ Kamera inaktiv";
    }
  }

  // Wenn jemand direkt einen Video-Call startet ohne Room beizutreten
  const originalStartCall = window.startCall;
  if (originalStartCall) {
    window.startCall = function () {
      // Bei externem Video-Call: Room-System deaktivieren
      if (inRoom && isLocalRoom) {
        console.log(
          "Video-Call gestartet - lokales Room-System temporär deaktiviert"
        );
        // Kamera wieder aktivieren für Video-Call
        if (localStream) {
          localStream.getVideoTracks().forEach((t) => (t.enabled = true));
        }
      }
      return originalStartCall.apply(this, arguments);
    };
  }
});
