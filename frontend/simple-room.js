// simple-room.js - Einfaches Room System für Multi-Device

window.addEventListener("load", () => {
  // Room ID aus URL oder generieren
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");

  if (!roomId) {
    // Neuer Room
    roomId = "room-" + Math.random().toString(36).substr(2, 8);
    window.history.replaceState({}, "", "?room=" + roomId);

    // Info anzeigen
    const info = document.createElement("div");
    info.style.cssText =
      "background:#e3f2fd; padding:20px; margin:20px auto; max-width:600px; border-radius:8px;";
    info.innerHTML = `
      <h2>📹 Multi-Device Room erstellt!</h2>
      <p><strong>Room ID:</strong> ${roomId}</p>
      <p>Öffne diese URL auf allen Geräten:</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px;" onclick="this.select()">
      <div style="margin-top:20px; padding:15px; background:white; border-radius:4px;">
        <h3>So funktioniert's:</h3>
        <ol>
          <li>Öffne diese URL auf allen deinen Geräten (PC, Laptop, Tablet)</li>
          <li>Klicke auf "Room beitreten" auf JEDEM Gerät</li>
          <li>Nutze die Kamera-Switch Buttons zum Wechseln</li>
        </ol>
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
    <button id="join-room" style="padding:15px 30px; margin:10px; background:#2196F3; color:white; border:none; border-radius:4px; font-size:18px; cursor:pointer;">
      🚪 Room beitreten
    </button>
    <div id="room-controls" style="display:none; margin-top:20px;">
      <button id="take-camera" style="padding:10px 20px; margin:5px; background:#4caf50; color:white; border:none; border-radius:4px;">
        📹 Kamera übernehmen
      </button>
      <p id="camera-status" style="margin-top:10px; font-weight:bold;">Status: Warte...</p>
    </div>
  `;
  document.body.insertBefore(controls, document.querySelector(".container"));

  // Original Start-Button verstecken
  document.getElementById("startCall").style.display = "none";

  const deviceId = document.getElementById("device-id").textContent;
  let inRoom = false;
  let hasCamera = false;

  // Room beitreten
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
    document.getElementById("join-room").textContent = "✅ Im Room";
    document.getElementById("room-controls").style.display = "block";

    inRoom = true;
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

        // Room-spezifische Messages
        if (msg.roomId === roomId) {
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
              break;

            case "room-update":
              console.log(`Room Update: ${msg.devices.length} Geräte im Room`);
              break;
          }

          // Diese Messages NICHT als WebRTC weiterleiten
          return;
        }

        // Nur WebRTC Messages von Geräten im gleichen Room verarbeiten
        if (
          msg.roomId === roomId &&
          (msg.type === "offer" || msg.type === "answer" || msg.type === "ice")
        ) {
          // Original handler für WebRTC
          if (originalOnMessage) originalOnMessage.call(socket, event);
        }
      } catch (e) {
        // Keine JSON Message - normal weiterleiten
        if (originalOnMessage) originalOnMessage.call(socket, event);
      }
    };

    // Initial: Kamera aus
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
    document.getElementById("camera-status").textContent = "⏸️ Kamera inaktiv";
  }
});
