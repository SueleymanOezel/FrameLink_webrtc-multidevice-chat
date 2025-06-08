// Elemente aus dem DOM
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startCall");

// Statusanzeige für die Verbindung
const statusElement = document.createElement("div");
statusElement.id = "connectionStatus";
statusElement.style.padding = "10px";
statusElement.style.margin = "10px 0";
statusElement.style.color = "red";
statusElement.style.backgroundColor = "#ffeeee";
statusElement.style.border = "1px solid red";
statusElement.textContent = "Nicht verbunden mit Signaling-Server";
document.body.insertBefore(statusElement, startBtn.parentNode);

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

// 1) WebSocket einrichten mit Retry-Mechanismus
function connectWebSocket() {
  console.log("Versuche WebSocket-Verbindung aufzubauen...");
  statusElement.textContent = "Verbindung wird aufgebaut...";

  const wsUrl =
    "wss://framelinkwebrtc-multidevice-chat-production.up.railway.app";
  console.log(`WebSocket-URL: ${wsUrl}`);

  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("✅ WebSocket verbunden");
    statusElement.style.color = "green";
    statusElement.style.backgroundColor = "#eeffee";
    statusElement.style.border = "1px solid green";
    statusElement.textContent = "Verbunden mit Signaling-Server";
    startBtn.disabled = false; // Button aktivieren
  };

  socket.onerror = (err) => {
    console.error("❌ WebSocket-Error:", err);
    statusElement.textContent = "Fehler bei der Verbindung zum Server";
    // Details im Log
    console.log("WebSocket Error Details:", {
      url: wsUrl,
      readyState: socket.readyState,
    });
  };

  socket.onclose = (event) => {
    const reasons = {
      1000: "Normal Closure",
      1001: "Going Away",
      1002: "Protocol Error",
      1003: "Unsupported Data",
      1005: "No Status Received",
      1006: "Abnormal Closure",
      1007: "Invalid frame payload data",
      1008: "Policy Violation",
      1009: "Message too big",
      1010: "Missing Extension",
      1011: "Internal Error",
      1012: "Service Restart",
      1013: "Try Again Later",
      1014: "Bad Gateway",
      1015: "TLS Handshake",
    };

    const reason = reasons[event.code] || "Unknown reason";
    console.warn(
      `⚠️ WebSocket geschlossen: Code ${event.code} (${reason}), Grund: ${event.reason}`
    );
    statusElement.style.color = "red";
    statusElement.style.backgroundColor = "#ffeeee";
    statusElement.style.border = "1px solid red";
    statusElement.textContent = `Verbindung getrennt: Code ${event.code} (${reason})`;
    startBtn.disabled = true; // Button deaktivieren

    // Nach 5 Sekunden erneut versuchen
    setTimeout(() => {
      console.log("Versuche erneute Verbindung...");
      initializeSocket();
    }, 5000);
  };

  // 6) Signaling-Handler + dynamisches Umschalten
  socket.onmessage = async ({ data }) => {
    console.log(
      "📩 Nachricht erhalten:",
      data.substring(0, 100) + (data.length > 100 ? "..." : "")
    );

    try {
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
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg)
          );
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.send(JSON.stringify({ type: "answer", ...answer }));
          console.log("📨 Answer gesendet");
        } else {
          console.warn(
            "PeerConnection nicht im stable-Zustand, kein Remote-Offer angewendet."
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
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg)
          );
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

      // Unbekannter Nachrichtentyp
      console.log("⚠️ Unbekannter Nachrichtentyp:", msg.type);
    } catch (error) {
      console.error("Fehler beim Verarbeiten der Nachricht:", error);
    }
  };

  return socket;
}

// 2) PeerConnection + lokale Medien abrufen
async function initPeerConnection() {
  try {
    console.log("Starte Medien-Zugriff...");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    console.log("✅ Medien-Zugriff erfolgreich");
    localVideo.srcObject = localStream;

    console.log("Erstelle RTCPeerConnection...");
    peerConnection = new RTCPeerConnection(config);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = ({ streams: [stream] }) => {
      console.log("🎬 Remote-Track erhalten");
      remoteVideo.srcObject = stream;
    };

    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ice", candidate }));
        console.log("📡 ICE-Candidate gesendet");
      }
    };

    // Zusätzliche Event-Handler für besseres Debugging
    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Verbindungsstatus:", peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
      console.log("Signaling-Status:", peerConnection.signalingState);
    };

    peerConnection.onconnectionstatechange = () => {
      console.log("Verbindungsstatus:", peerConnection.connectionState);
    };

    console.log("🎬 PeerConnection initialisiert");
    return true;
  } catch (error) {
    console.error("❌ Fehler beim Initialisieren der PeerConnection:", error);
    alert("Fehler beim Zugriff auf Kamera/Mikrofon: " + error.message);
    return false;
  }
}

// 3) Face-API-Modelle laden
async function loadFaceModels() {
  try {
    console.log("Lade Face-API-Modelle...");
    await faceapi.nets.tinyFaceDetector.loadFromUri("models");
    console.log("✅ face-api.js Modelle geladen");
    return true;
  } catch (error) {
    console.error("❌ Fehler beim Laden der Face-API-Modelle:", error);
    return false;
  }
}

// 4) Device-Status versenden (mit fester Geräte-ID)
function sendDeviceStatus(isActive) {
  if (socket.readyState === WebSocket.OPEN) {
    const msg = JSON.stringify({
      type: isActive ? "DEVICE_ACTIVE" : "DEVICE_INACTIVE",
      deviceId: deviceId,
    });
    socket.send(msg);
    console.log(
      "📡 Device status:",
      isActive ? "ACTIVE" : "INACTIVE",
      "– von",
      deviceId
    );
  } else {
    console.warn("WebSocket nicht bereit, Status konnte nicht gesendet werden");
  }
}

// 5) Face-Detection-Loop (nur an Status-Änderungen senden)
function startFaceDetection() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  let lastFaceState = null; // null = noch nicht bestimmt, true/false = letzter Zustand
  let detectionFailCount = 0;
  const MAX_FAILURES = 3; // Nach 3 Fehlern in Folge als "kein Gesicht" werten

  console.log("🔍 Starte Face-Detection-Loop");

  const detectionInterval = setInterval(async () => {
    if (!localVideo.srcObject || !localVideo.videoWidth) {
      console.warn("Video noch nicht bereit für Face-Detection");
      return;
    }

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
      detectionFailCount = 0; // Zurücksetzen bei erfolgreicher Erkennung

      if (isActive !== lastFaceState) {
        sendDeviceStatus(isActive);
        lastFaceState = isActive;
        console.log(
          "👤 Gesichtserkennung:",
          isActive ? "Gesicht erkannt" : "Kein Gesicht"
        );
      }
    } catch (err) {
      console.error("⚠️ Face-Detection-Error:", err.name, err.message);
      detectionFailCount++;

      if (detectionFailCount >= MAX_FAILURES && lastFaceState !== false) {
        sendDeviceStatus(false);
        lastFaceState = false;
        console.log(
          "⚠️ Face-Detection: Mehrere Fehler in Folge, setze Status auf INACTIVE"
        );
      }

      if (localStream && detectionFailCount >= MAX_FAILURES) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        console.log("⛔ Tracks deaktiviert wegen Face-Detection-Fehlern");
      }
    }
  }, 1000);

  // Event-Handler zum Bereinigen des Intervalls hinzufügen
  window.addEventListener("beforeunload", () => {
    clearInterval(detectionInterval);
  });
}

// Initialisiere die Socket-Verbindung
let socket;
function initializeSocket() {
  socket = connectWebSocket();
}

// Starte die Socket-Verbindung
initializeSocket();

// 7) Klick-Handler: Nur einmal Offer erzeugen + face-Detection starten
startBtn.addEventListener("click", async () => {
  console.log("▶️ Start-Button geklickt");

  if (socket.readyState !== WebSocket.OPEN) {
    console.error("WebSocket nicht offen – Abbruch");
    alert("Keine Verbindung zum Server. Bitte warten oder Seite neu laden.");
    return;
  }

  // Wenn keine PeerConnection existiert, initialisiere und sende Offer
  if (!peerConnection) {
    const peerInitialized = await initPeerConnection();
    if (!peerInitialized) {
      console.error("PeerConnection konnte nicht initialisiert werden");
      return;
    }

    const modelsLoaded = await loadFaceModels();
    if (modelsLoaded) {
      startFaceDetection();
    } else {
      console.warn("Face-Detection startet ohne Modelle!");
    }

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", ...offer }));
      console.log("📨 Offer gesendet");
    } catch (error) {
      console.error("Fehler beim Erstellen/Senden des Angebots:", error);
      alert("Fehler beim Starten des Anrufs: " + error.message);
    }
    return;
  }

  console.warn("PeerConnection existiert bereits, kein neues Offer gesendet.");
});

// Ping-Funktion, um die Verbindung aktiv zu halten
function startKeepAlive() {
  const pingInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      console.log("🏓 Ping gesendet");
    } else {
      console.warn("Ping nicht möglich - WebSocket nicht verbunden");
    }
  }, 30000); // Alle 30 Sekunden

  // Event-Handler zum Bereinigen des Intervalls hinzufügen
  window.addEventListener("beforeunload", () => {
    clearInterval(pingInterval);
  });
}

// Starte Keep-Alive nach kurzer Verzögerung
setTimeout(startKeepAlive, 5000);
