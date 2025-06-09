// ========== RAUM-VERWALTUNG ==========
let currentRoomId = null;
let deviceId = `device-${Math.random().toString(36).substr(2, 9)}`;

// Raum aus URL holen oder erstellen
function setupRoom() {
  const params = new URLSearchParams(window.location.search);
  currentRoomId = params.get("room");

  if (!currentRoomId) {
    currentRoomId = "room-" + Math.random().toString(36).substr(2, 9);
    const newUrl = window.location.href + "?room=" + currentRoomId;
    window.history.replaceState({}, "", newUrl);

    // Info-Box anzeigen
    const infoBox = document.createElement("div");
    infoBox.style.cssText =
      "background:#e3f2fd; border:1px solid #1976d2; padding:15px; margin:10px; text-align:center;";
    infoBox.innerHTML = `
      <h3>🏠 Neuer Raum erstellt!</h3>
      <p>Öffne diese URL auf deinen anderen Geräten:</p>
      <input value="${window.location.href}" onclick="this.select()" style="width:80%; padding:5px;">
    `;
    document.body.insertBefore(infoBox, document.body.firstChild);
  }

  console.log(`Raum: ${currentRoomId}, Gerät: ${deviceId}`);
}

// ========== FACE DETECTION ==========
let isSendingVideo = false;
let faceCheckInterval = null;

// Face-API initialisieren
async function initFaceDetection() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model"
    );
    console.log("Face-API geladen!");
    startFaceCheck();
    return true;
  } catch (error) {
    console.error("Face-API Fehler:", error);
    return false;
  }
}

// Face-Check Loop
function startFaceCheck() {
  faceCheckInterval = setInterval(async () => {
    if (!localVideo || !localVideo.srcObject) return;

    try {
      const detection = await faceapi.detectSingleFace(
        localVideo,
        new faceapi.TinyFaceDetectorOptions()
      );

      if (detection && detection.score > 0.5) {
        // Gesicht erkannt - will aktiv werden
        if (!isSendingVideo && socket && socket.readyState === WebSocket.OPEN) {
          console.log("Gesicht erkannt - fordere Kamera an");
          socket.send(
            JSON.stringify({
              type: "face-detected",
              roomId: currentRoomId,
              deviceId: deviceId,
              timestamp: Date.now(),
            })
          );
        }
      }
    } catch (error) {
      // Ignoriere Fehler
    }
  }, 1000);
}

// ========== KAMERA STEUERUNG ==========
function activateCamera() {
  if (isSendingVideo) return;

  console.log("Aktiviere Kamera");
  isSendingVideo = true;

  if (localStream) {
    localStream.getVideoTracks().forEach((track) => (track.enabled = true));
  }

  localVideo.style.border = "3px solid #4CAF50";
  showStatus("📹 Diese Kamera überträgt", "green");
}

function deactivateCamera() {
  if (!isSendingVideo) return;

  console.log("Deaktiviere Kamera");
  isSendingVideo = false;

  if (localStream) {
    localStream.getVideoTracks().forEach((track) => (track.enabled = false));
  }

  localVideo.style.border = "3px solid #ccc";
  showStatus("⏸️ Kamera wartet", "gray");
}

// ========== INTEGRATION ==========
// WebSocket erweitern
const originalConnect = connectWebSocket;
window.connectWebSocket = function () {
  originalConnect();

  // Nach Verbindung Raum beitreten
  const checkConnection = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      clearInterval(checkConnection);

      // Raum beitreten
      socket.send(
        JSON.stringify({
          type: "join-room",
          roomId: currentRoomId,
          deviceId: deviceId,
        })
      );

      // Face-Detection Nachrichten verarbeiten
      const originalOnMessage = socket.onmessage;
      socket.onmessage = async (event) => {
        // Original Handler
        await originalOnMessage.call(socket, event);

        // Face-Detection prüfen
        try {
          let data = event.data;
          if (data instanceof Blob) data = await data.text();
          const msg = JSON.parse(data);

          if (msg.type === "face-detected" && msg.roomId === currentRoomId) {
            if (msg.deviceId === deviceId) {
              activateCamera();
            } else if (isSendingVideo) {
              deactivateCamera();
            }
          }
        } catch (e) {}
      };
    }
  }, 100);
};

// ========== AUTO-START ==========
window.addEventListener("load", async () => {
  // Raum setup
  setupRoom();

  // Warte 2 Sekunden, dann starte Face-Detection
  setTimeout(async () => {
    const success = await initFaceDetection();
    if (success) {
      // Am Anfang ist Kamera aus
      deactivateCamera();
      showStatus("FrameLink aktiv - warte auf Gesichtserkennung", "blue");
    }
  }, 2000);
});
