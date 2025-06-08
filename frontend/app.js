// Elemente aus dem DOM
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startCall");
const statusElement = document.createElement("div");
statusElement.id = "connectionStatus";
statusElement.style.color = "red";
statusElement.textContent = "Nicht verbunden";
document.body.insertBefore(statusElement, startBtn);

// 0) TensorFlow.js CPU-Backend aktivieren
(async () => {
  if (window.faceapi && faceapi.tf) {
    await faceapi.tf.setBackend("cpu");
    console.log("🖥️ TensorFlow.js Backend gesetzt auf CPU");
  }
})();

// Jede Browser-Instanz bekommt eine eindeutige ID
const deviceId = "device-" + Math.random().toString(36).substr(2, 8);
console.log("🔖 Meine deviceId:", deviceId);

// Button bis WebSocket open deaktiviert lassen
startBtn.disabled = true;

let localStream;
let peerConnection;

// STUN-Server-Konfiguration für ICE
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// 1) WebSocket einrichten
const socket = new WebSocket(
  "wss://framelinkwebrtc-multidevice-chat-production.up.railway.app"
);
socket.onopen = () => {
  console.log("✅ WebSocket verbunden");
  startBtn.disabled = false; // Button aktivieren
  statusElement.style.color = "green";
  statusElement.textContent = "Verbunden mit Signaling-Server";
};
socket.onerror = (err) => {
  console.error("❌ WebSocket-Error:", err);
  // Anzeige für Benutzer, dass die Verbindung fehlgeschlagen ist
  alert("Verbindung zum Server fehlgeschlagen. Bitte später erneut versuchen.");
};
socket.onclose = () => {
  console.warn("⚠️ WebSocket geschlossen");
  startBtn.disabled = true; // Button deaktivieren
};

// 2) PeerConnection + lokale Medien abrufen
async function initPeerConnection() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(config);
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = ({ streams: [stream] }) => {
    remoteVideo.srcObject = stream;
  };

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ice", candidate }));
    }
  };

  console.log("🎬 PeerConnection initialisiert");
}

// 3) Face-API-Modelle laden
async function loadFaceModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri("models");
  console.log("✅ face-api.js Modelle geladen");
}

// 4) Device-Status versenden (mit fester Geräte-ID)
function sendDeviceStatus(isActive) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: isActive ? "DEVICE_ACTIVE" : "DEVICE_INACTIVE",
        deviceId: deviceId,
      })
    );
    console.log(
      "📡 Device status:",
      isActive ? "ACTIVE" : "INACTIVE",
      "– von",
      deviceId
    );
  }
}

// 5) Face-Detection-Loop (nur an Status-Änderungen senden)
function startFaceDetection() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  let lastFaceState = null; // null = noch nicht bestimmt, true/false = letzter Zustand

  setInterval(async () => {
    try {
      const result = await Promise.race([
        faceapi.detectSingleFace(localVideo, options),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Detection timeout nach 2000 ms")),
            2000
          )
        ),
      ]);

      const isActive = !!result;
      if (isActive !== lastFaceState) {
        sendDeviceStatus(isActive);
        lastFaceState = isActive;
      }
    } catch (err) {
      console.error("⚠️ Face-Detection-Error:", err.name, err.message);
      if (lastFaceState !== false) {
        sendDeviceStatus(false);
        lastFaceState = false;
      }
      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
      }
    }
  }, 1000);
}

// 6) Signaling-Handler + dynamisches Umschalten
socket.onmessage = async ({ data }) => {
  const msg = JSON.parse(data);

  // —— Dynamisches Umschalten: DEVICE_ACTIVE / DEVICE_INACTIVE —— //
  if (msg.type === "DEVICE_ACTIVE") {
    console.log("🔵 DEVICE_ACTIVE von", msg.deviceId);
    if (!localStream) return;

    if (msg.deviceId === deviceId) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      localStream.getAudioTracks().forEach((t) => (t.enabled = true));
      console.log("✅ Meine Tracks aktiviert");
    } else {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      localStream.getAudioTracks().forEach((t) => (t.enabled = false));
      console.log("⛔ Meine Tracks deaktiviert");
    }
    return;
  }

  if (msg.type === "DEVICE_INACTIVE" && msg.deviceId === deviceId) {
    console.log("⚪ DEVICE_INACTIVE für mich");
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      localStream.getAudioTracks().forEach((t) => (t.enabled = false));
      console.log("⛔ Meine Tracks (INACTIVE) deaktiviert");
    }
    return;
  }

  // —— WebRTC-Signaling: Offer, Answer, ICE —— //
  if (msg.type === "offer") {
    console.log("📨 Offer erhalten");
    // Wenn keine PeerConnection existiert, initialisiere sie
    if (!peerConnection) {
      await initPeerConnection();
      await loadFaceModels();
      startFaceDetection();
    }
    // Wenn peerConnection momentan in 'stable' ist, setze Remote-Offer und antworte
    if (peerConnection.signalingState === "stable") {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", ...answer }));
      console.log("📨 Answer gesendet");
    } else {
      console.warn(
        "PeerConnection nicht im „stable“-Zustand, kein Remote-Offer angewendet."
      );
    }
    return;
  }

  if (msg.type === "answer") {
    console.log("📨 Answer erhalten");
    // Nur anwenden, wenn wir gerade eine lokale Offer erstellt haben
    if (
      peerConnection &&
      peerConnection.signalingState === "have-local-offer"
    ) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
    } else {
      console.warn(
        "Keine lokale Offer ausstehend, kein Remote-Answer angewendet."
      );
    }
    return;
  }

  if (msg.type === "ice") {
    console.log("📡 ICE-Candidate erhalten");
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(msg.candidate);
      } catch (e) {
        console.warn("ICE-Candidate konnte nicht hinzugefügt werden:", e);
      }
    }
    return;
  }
};

// 7) Klick-Handler: Nur einmal Offer erzeugen + face-Detection starten
startBtn.addEventListener("click", async () => {
  console.log("▶️ Start-Button geklickt");

  if (socket.readyState !== WebSocket.OPEN) {
    console.error("WebSocket nicht offen – Abbruch");
    return;
  }

  // Wenn keine PeerConnection existiert, initialisiere und sende Offer
  if (!peerConnection) {
    await initPeerConnection();
    await loadFaceModels();
    startFaceDetection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "offer", ...offer }));
    console.log("📨 Offer gesendet");
    return;
  }

  console.warn("PeerConnection existiert bereits, kein neues Offer gesendet.");
});
