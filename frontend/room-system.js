// room-system.js - Raum-basiertes Multi-Device System

// Globale Variablen
let deviceId = `device-${Math.random().toString(36).substr(2, 9)}`;
let roomId = null;
let isHost = false;
let isActiveDevice = false;
let remoteCallActive = false;
let faceCheckInterval = null;

// Setup beim Laden
window.addEventListener("load", () => {
  setupRoomSystem();
});

// Raum-System initialisieren
function setupRoomSystem() {
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("room");

  if (!roomId) {
    // Neuer Raum erstellen
    createNewRoom();
  } else {
    // Bestehendem Raum beitreten
    joinExistingRoom();
  }
}

// Neuen Raum erstellen
function createNewRoom() {
  roomId = "room-" + Math.random().toString(36).substr(2, 9);
  isHost = true;
  window.history.replaceState({}, "", "?room=" + roomId);

  // UI für neuen Raum
  const setupUI = document.createElement("div");
  setupUI.style.cssText =
    "background:#e3f2fd; padding:20px; margin:20px auto; max-width:700px; border-radius:8px;";
  setupUI.innerHTML = `
    <h2>🏠 Neuer Multi-Device Raum erstellt!</h2>
    <div style="background:white; padding:15px; margin:15px 0; border-radius:4px;">
      <h3>Schritt 1: Geräte hinzufügen</h3>
      <p>Öffne diese URL auf allen deinen Geräten (PC, Laptop, Tablet):</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px; font-size:16px;" onclick="this.select()">
      <button onclick="navigator.clipboard.writeText('${window.location.href}')" style="margin-top:10px; padding:10px 20px;">
        📋 URL kopieren
      </button>
    </div>
    
    <div style="background:white; padding:15px; margin:15px 0; border-radius:4px;">
      <h3>Schritt 2: Remote Person einladen</h3>
      <p>Gib der Remote Person diese spezielle URL:</p>
      <input id="remote-url" value="${window.location.origin}${window.location.pathname}?join=${roomId}" 
             readonly style="width:100%; padding:10px; font-size:16px;" onclick="this.select()">
      <button onclick="navigator.clipboard.writeText(document.getElementById('remote-url').value)" 
              style="margin-top:10px; padding:10px 20px;">
        📋 Remote URL kopieren
      </button>
    </div>
    
    <div id="device-list" style="background:white; padding:15px; margin:15px 0; border-radius:4px;">
      <h3>Verbundene Geräte:</h3>
      <ul id="devices">
        <li>${getDeviceType()} (dieses Gerät) - <span id="my-status">Warte auf Gesicht...</span></li>
      </ul>
    </div>
  `;

  document.body.insertBefore(setupUI, document.body.firstChild);

  // Als Raum-Gerät initialisieren
  initializeAsRoomDevice();
}

// Bestehendem Raum beitreten
function joinExistingRoom() {
  // Prüfe ob es ein Remote-Join ist
  const joinRoom = new URLSearchParams(window.location.search).get("join");

  if (joinRoom) {
    // Remote Person will dem Raum beitreten
    joinAsRemotePerson(joinRoom);
  } else {
    // Weiteres Gerät im gleichen Netzwerk
    joinAsRoomDevice();
  }
}

// Als Raum-Gerät beitreten
function joinAsRoomDevice() {
  const info = document.createElement("div");
  info.style.cssText =
    "background:#e8f5e9; padding:15px; margin:20px auto; max-width:600px; border-radius:8px; text-align:center;";
  info.innerHTML = `
    <h3>🏠 Raum ${roomId} beigetreten</h3>
    <p>Gerät: ${getDeviceType()} (${deviceId.substr(0, 8)})</p>
    <div id="my-status" style="margin-top:10px; padding:10px; background:white; border-radius:4px;">
      Status: <span id="device-status">Warte auf Gesicht...</span>
    </div>
  `;

  document.body.insertBefore(info, document.body.firstChild);

  // Face Detection Button verstecken
  const startBtn = document.getElementById("startCall");
  if (startBtn) startBtn.style.display = "none";

  initializeAsRoomDevice();
}

// Als Remote Person beitreten
function joinAsRemotePerson(targetRoom) {
  roomId = targetRoom;

  const info = document.createElement("div");
  info.style.cssText =
    "background:#fff3cd; padding:20px; margin:20px auto; max-width:600px; border-radius:8px; text-align:center;";
  info.innerHTML = `
    <h2>📱 Remote-Verbindung zu Raum ${roomId}</h2>
    <p>Du verbindest dich mit einem Multi-Device Raum.</p>
    <p>Die andere Person kann zwischen mehreren Kameras wechseln.</p>
    <button id="start-remote-call" style="margin-top:20px; padding:15px 30px; font-size:18px; 
            background:#4caf50; color:white; border:none; border-radius:4px; cursor:pointer;">
      📞 Videoanruf starten
    </button>
  `;

  document.body.insertBefore(info, document.body.firstChild);

  // Original Start-Button verstecken
  const origStartBtn = document.getElementById("startCall");
  if (origStartBtn) origStartBtn.style.display = "none";

  // Remote Call Handler
  document
    .getElementById("start-remote-call")
    .addEventListener("click", startRemoteCall);
}

// Als Raum-Gerät initialisieren
function initializeAsRoomDevice() {
  // WebSocket modifizieren
  const checkWS = setInterval(() => {
    if (window.socket && socket.readyState === WebSocket.OPEN) {
      clearInterval(checkWS);

      // Raum beitreten
      socket.send(
        JSON.stringify({
          type: "join-device-room",
          roomId: roomId,
          deviceId: deviceId,
          deviceType: getDeviceType(),
        })
      );

      // Message Handler erweitern
      enhanceWebSocketForRoom();

      // Face Detection starten
      startSimpleFaceDetection();
    }
  }, 100);
}

// WebSocket für Raum-Kommunikation erweitern
function enhanceWebSocketForRoom() {
  const originalHandler = socket.onmessage;

  socket.onmessage = async (event) => {
    let data = event.data;
    if (data instanceof Blob) data = await data.text();

    try {
      const msg = JSON.parse(data);

      // Raum-spezifische Nachrichten
      if (msg.roomId === roomId) {
        switch (msg.type) {
          case "device-active":
            if (msg.deviceId === deviceId) {
              becomeActiveDevice();
            } else {
              becomeInactiveDevice();
            }
            return;

          case "remote-call-starting":
            handleRemoteCallStart();
            return;

          case "remote-call-ended":
            handleRemoteCallEnd();
            return;

          case "device-list-update":
            updateDeviceList(msg.devices);
            return;
        }
      }

      // WebRTC Nachrichten nur weiterleiten wenn:
      // 1. Wir sind das aktive Gerät UND
      // 2. Ein Remote Call läuft
      if (isActiveDevice && remoteCallActive) {
        if (originalHandler) originalHandler.call(socket, event);
      }
    } catch (e) {
      // Fehler ignorieren
    }
  };
}

// Einfache Face Detection
function startSimpleFaceDetection() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 160;
  canvas.height = 120;

  let noFaceCount = 0;

  faceCheckInterval = setInterval(() => {
    if (!localVideo || !localVideo.srcObject) return;

    ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Gesicht im mittleren Bereich suchen
    let facePixels = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let y = centerY - 30; y < centerY + 30; y++) {
      for (let x = centerX - 30; x < centerX + 30; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];

        // Hautfarben-Check
        if (r > 95 && g > 40 && b > 20 && r > g && r > b) {
          facePixels++;
        }
      }
    }

    if (facePixels > 300) {
      // Gesicht erkannt
      console.log(`Gesicht erkannt! Pixel: ${facePixels}`);
      noFaceCount = 0;

      if (!isActiveDevice && socket) {
        socket.send(
          JSON.stringify({
            type: "request-active",
            roomId: roomId,
            deviceId: deviceId,
          })
        );
      }
    } else {
      // Kein Gesicht
      noFaceCount++;

      // Nach 6 Checks (3 Sekunden) ohne Gesicht → abgeben
      if (isActiveDevice && noFaceCount > 6) {
        socket.send(
          JSON.stringify({
            type: "release-active",
            roomId: roomId,
            deviceId: deviceId,
          })
        );
      }
    }
  }, 500);
}

// Remote Call starten (für Remote Person)
function startRemoteCall() {
  document.getElementById("start-remote-call").disabled = true;
  document.getElementById("start-remote-call").textContent = "Verbinde...";

  // Sende Call-Request an Raum
  socket.send(
    JSON.stringify({
      type: "remote-call-request",
      roomId: roomId,
    })
  );

  // Normalen Call starten
  startCall();
}

// Gerät wird aktiv
function becomeActiveDevice() {
  isActiveDevice = true;
  localVideo.style.border = "4px solid #4caf50";
  updateStatus("📹 AKTIVE KAMERA", "#4caf50");

  // Wenn Remote Call läuft, Video aktivieren
  if (remoteCallActive && localStream) {
    localStream.getVideoTracks().forEach((track) => (track.enabled = true));
  }
}

// Gerät wird inaktiv
function becomeInactiveDevice() {
  isActiveDevice = false;
  localVideo.style.border = "2px solid #ccc";
  updateStatus("⏸️ Standby", "#666");

  // Video deaktivieren
  if (localStream) {
    localStream.getVideoTracks().forEach((track) => (track.enabled = false));
  }
}

// Remote Call startet
function handleRemoteCallStart() {
  remoteCallActive = true;
  showStatus("📞 Remote-Anruf aktiv", "green");
}

// Remote Call endet
function handleRemoteCallEnd() {
  remoteCallActive = false;
  showStatus("☎️ Remote-Anruf beendet", "red");
}

// Hilfsfunktionen
function getDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|android/i.test(ua)) return "Handy";
  return "PC/Laptop";
}

function updateStatus(text, color) {
  const status =
    document.getElementById("device-status") ||
    document.getElementById("my-status");
  if (status) {
    status.innerHTML = `<span style="color:${color}">${text}</span>`;
  }
}

function updateDeviceList(devices) {
  const list = document.getElementById("devices");
  if (list && devices) {
    list.innerHTML = devices
      .map(
        (d) =>
          `<li>${d.deviceType} - ${d.deviceId === deviceId ? "(dieses Gerät)" : ""} 
       ${d.isActive ? "📹 AKTIV" : "⏸️"}</li>`
      )
      .join("");
  }
}
