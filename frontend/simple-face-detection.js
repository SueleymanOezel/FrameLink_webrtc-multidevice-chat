// Globale Variablen
let deviceId = `device-${Math.random().toString(36).substr(2, 9)}`;
let roomId = null;
let isActiveCamera = false;
let faceDetector = null;
let lastFaceTime = 0;
let checkInterval = null;

// Setup beim Laden
window.addEventListener("load", () => {
  // Verstecke Call-Buttons
  const startBtn = document.getElementById("startCall");
  if (startBtn) startBtn.style.display = "none";

  const remoteContainer = document.querySelector(
    ".video-container:has(#remoteVideo)"
  );
  if (remoteContainer) remoteContainer.style.display = "none";

  setupFaceDetection();
});

// Face Detection Setup
async function setupFaceDetection() {
  // Room Setup
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("room");

  if (!roomId) {
    roomId = "face-" + Math.random().toString(36).substr(2, 9);
    window.history.replaceState({}, "", "?room=" + roomId);
    showRoomInfo(true);
  } else {
    showRoomInfo(false);
  }

  // Warte auf Kamera
  setTimeout(async () => {
    if (localVideo && localVideo.srcObject) {
      await initFaceDetection();
      modifyWebSocket();
    }
  }, 2000);
}

// Browser Face Detection API verwenden
async function initFaceDetection() {
  try {
    // Prüfe ob Browser Face Detection unterstützt
    if ("FaceDetector" in window) {
      // Chrome/Edge native Face Detection
      faceDetector = new FaceDetector();
      console.log("Native Face Detection verfügbar!");
    } else {
      // Fallback: MediaPipe Face Detection
      console.log("Lade MediaPipe Face Detection...");

      // MediaPipe Script laden
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js";
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);

      const script2 = document.createElement("script");
      script2.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
      script2.crossOrigin = "anonymous";
      document.head.appendChild(script2);

      // Warte bis geladen
      await new Promise((resolve) => {
        script2.onload = resolve;
      });

      // MediaPipe initialisieren
      const faceDetection = new window.FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        },
      });

      faceDetection.setOptions({
        model: "short_range",
        minDetectionConfidence: 0.5,
      });

      faceDetection.onResults(onFaceResults);

      // Kamera mit MediaPipe verbinden
      const camera = new window.Camera(localVideo, {
        onFrame: async () => {
          await faceDetection.send({ image: localVideo });
        },
        width: 640,
        height: 480,
      });

      camera.start();
      console.log("MediaPipe Face Detection gestartet!");
      return;
    }

    // Starte Check-Loop für native Detection
    startFaceCheckLoop();
  } catch (error) {
    console.error("Face Detection Fehler:", error);
    // Fallback zu einfacher Hautfarben-Erkennung
    startSkinColorDetection();
  }
}

// Native Face Detection Loop
function startFaceCheckLoop() {
  checkInterval = setInterval(async () => {
    if (!localVideo || !localVideo.srcObject || !faceDetector) return;

    try {
      const faces = await faceDetector.detect(localVideo);

      if (faces && faces.length > 0) {
        onFaceDetected();
      } else {
        onNoFace();
      }
    } catch (error) {
      console.error("Face check error:", error);
    }
  }, 500);
}

// MediaPipe Results Handler
function onFaceResults(results) {
  if (results.detections && results.detections.length > 0) {
    onFaceDetected();
  } else {
    onNoFace();
  }
}

// Fallback: Hautfarben-Erkennung
function startSkinColorDetection() {
  console.log("Verwende Hautfarben-Erkennung als Fallback");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 160;
  canvas.height = 120;

  checkInterval = setInterval(() => {
    if (!localVideo || !localVideo.srcObject) return;

    ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Zähle Hautfarben-Pixel im mittleren Bereich
    let skinPixels = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const checkRadius = 40;

    for (let y = centerY - checkRadius; y < centerY + checkRadius; y++) {
      for (let x = centerX - checkRadius; x < centerX + checkRadius; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];

        // Einfache Hautfarben-Erkennung
        if (
          r > 95 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 15 &&
          r - b > 15
        ) {
          skinPixels++;
        }
      }
    }

    // Wenn genug Hautfarben-Pixel → wahrscheinlich Gesicht
    if (skinPixels > 500) {
      onFaceDetected();
    } else {
      onNoFace();
    }
  }, 500);
}

// Gesicht erkannt
function onFaceDetected() {
  lastFaceTime = Date.now();

  if (!isActiveCamera && socket && socket.readyState === WebSocket.OPEN) {
    console.log("Gesicht erkannt - fordere Kamera an");
    socket.send(
      JSON.stringify({
        type: "request-camera",
        roomId: roomId,
        deviceId: deviceId,
        timestamp: Date.now(),
      })
    );
  }
}

// Kein Gesicht
function onNoFace() {
  // Nach 3 Sekunden ohne Gesicht → Kamera abgeben
  if (isActiveCamera && Date.now() - lastFaceTime > 3000) {
    console.log("Kein Gesicht seit 3 Sekunden");
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "release-camera",
          roomId: roomId,
          deviceId: deviceId,
        })
      );
    }
  }
}

// WebSocket modifizieren
function modifyWebSocket() {
  const checkWS = setInterval(() => {
    if (window.socket && socket.readyState === WebSocket.OPEN) {
      clearInterval(checkWS);

      // Room beitreten
      socket.send(
        JSON.stringify({
          type: "face-room-join",
          roomId: roomId,
          deviceId: deviceId,
        })
      );

      // Message Handler
      const originalHandler = socket.onmessage;
      socket.onmessage = async (event) => {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();

        try {
          const msg = JSON.parse(data);

          if (msg.roomId === roomId) {
            if (msg.type === "camera-granted" && msg.deviceId === deviceId) {
              activateCamera();
            } else if (msg.type === "camera-revoked") {
              deactivateCamera();
            }
            return;
          }
        } catch (e) {}

        if (originalHandler) originalHandler.call(socket, event);
      };
    }
  }, 100);
}

// UI Funktionen
function showRoomInfo(isNew) {
  const info = document.createElement("div");
  info.style.cssText =
    "background:#e8f5e9; padding:20px; margin:20px auto; max-width:600px; text-align:center; border-radius:8px;";

  if (isNew) {
    info.innerHTML = `
      <h2>👤 Gesichtserkennung aktiviert!</h2>
      <p>Öffne diese URL auf allen Geräten:</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px;" onclick="this.select()">
    `;
  } else {
    info.innerHTML = `
      <p>👤 Raum: ${roomId} | Gerät: ${deviceId.substr(0, 8)}</p>
      <p id="face-status">Status: Warte auf Gesicht...</p>
    `;
  }

  document.body.insertBefore(info, document.body.firstChild);
}

function activateCamera() {
  isActiveCamera = true;
  localVideo.style.border = "4px solid #4caf50";
  updateStatus("👤 Gesicht erkannt - Kamera aktiv!", "#4caf50");
}

function deactivateCamera() {
  isActiveCamera = false;
  localVideo.style.border = "2px solid #ccc";
  updateStatus("⏸️ Warte auf Gesicht...", "#666");
}

function updateStatus(text, color) {
  const status = document.getElementById("face-status");
  if (status) {
    status.textContent = text;
    status.style.color = color;
  }
}
