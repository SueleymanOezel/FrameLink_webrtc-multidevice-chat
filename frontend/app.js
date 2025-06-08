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

// Debugging-Anzeige hinzufügen
const debugElement = document.createElement("div");
debugElement.id = "debugInfo";
debugElement.style.padding = "5px";
debugElement.style.margin = "5px 0";
debugElement.style.fontSize = "12px";
debugElement.style.color = "#666";
debugElement.style.border = "1px dashed #ccc";
debugElement.style.display = "none"; // Standardmäßig ausgeblendet
document.body.insertBefore(debugElement, statusElement);

// Debug-Toggle-Button
const debugBtn = document.createElement("button");
debugBtn.textContent = "Debug-Info anzeigen";
debugBtn.onclick = () => {
  if (debugElement.style.display === "none") {
    debugElement.style.display = "block";
    debugBtn.textContent = "Debug-Info ausblenden";
  } else {
    debugElement.style.display = "none";
    debugBtn.textContent = "Debug-Info anzeigen";
  }
};
document.body.insertBefore(debugBtn, debugElement);

// Debug-Logging-Funktion
function debug(message) {
  const now = new Date().toLocaleTimeString();
  console.log(`[${now}] ${message}`);
  const logEntry = document.createElement("div");
  logEntry.textContent = `[${now}] ${message}`;
  debugElement.appendChild(logEntry);
  debugElement.scrollTop = debugElement.scrollHeight;
  while (debugElement.childNodes.length > 50) {
    debugElement.removeChild(debugElement.firstChild);
  }
}

// 0) TensorFlow.js CPU-Backend aktivieren
(async () => {
  if (window.faceapi && faceapi.tf) {
    await faceapi.tf.setBackend("cpu");
    debug("🖥️ TensorFlow.js Backend gesetzt auf CPU");
  }
})();

// Jede Browser-Instanz bekommt eine eindeutige ID
const deviceId = "device-" + Math.random().toString(36).substr(2, 8);
debug("🔖 Meine deviceId: " + deviceId);

// Button bis WebSocket open deaktiviert lassen
startBtn.disabled = true;

let localStream;
let peerConnection;
let socket;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000; // 3 Sekunden

// STUN-Server-Konfiguration für ICE
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// 1) WebSocket einrichten mit Retry-Mechanismus
function connectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  debug("Versuche WebSocket-Verbindung aufzubauen...");
  statusElement.textContent = "Verbindung wird aufgebaut...";
  statusElement.style.color = "blue";
  statusElement.style.backgroundColor = "#eeeeff";

  // Korrekte Railway-URL mit Port 8765
  const url = "ws://shortline.proxy.rlwy.net:21652";
  debug("WebSocket-URL: " + url);

  // Verbindungstimeout
  const connectionTimeout = setTimeout(() => {
    debug("WebSocket-Verbindungs-Timeout nach 10 Sekunden");
    if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      handleReconnect("Timeout");
    }
  }, 10000);

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      debug("✅ WebSocket verbunden");
      statusElement.style.color = "green";
      statusElement.style.backgroundColor = "#eeffee";
      statusElement.style.border = "1px solid green";
      statusElement.textContent = "Verbunden mit Signaling-Server";
      startBtn.disabled = false;
      reconnectAttempts = 0;
      sendPing();
    };

    socket.onerror = (err) => {
      debug(`❌ WebSocket-Error: ${JSON.stringify(err)}`);
      if (socket.readyState === WebSocket.CONNECTING) {
        clearTimeout(connectionTimeout);
        handleReconnect("Error");
      }
    };

    socket.onclose = (event) => {
      clearTimeout(connectionTimeout);
      const reasons = {
        1000: "Normal Closure",
        1001: "Going Away",
        1006: "Abnormal Closure",
        1011: "Internal Error",
        1015: "TLS Handshake",
      };
      const reason = reasons[event.code] || "Unknown reason";
      debug(`⚠️ WebSocket geschlossen: Code ${event.code} (${reason})`);
      statusElement.style.color = "red";
      statusElement.style.backgroundColor = "#ffeeee";
      statusElement.textContent = `Verbindung getrennt: ${reason}`;
      startBtn.disabled = true;
      handleReconnect("Closed");
    };

    socket.onmessage = async ({ data }) => {
      debug(
        "📩 Nachricht erhalten: " +
          data.substring(0, 50) +
          (data.length > 50 ? "..." : "")
      );
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        debug("⚠️ Ungültiges JSON erhalten");
        return;
      }

      if (msg.type === "pong") {
        debug("🏓 Pong erhalten");
        return;
      }

      if (msg.type === "DEVICE_ACTIVE") {
        debug("🔵 DEVICE_ACTIVE von " + msg.deviceId);
        if (!localStream) return;
        const active = msg.deviceId === deviceId;
        localStream.getTracks().forEach((t) => (t.enabled = active));
        debug(
          active ? "✅ Meine Tracks aktiviert" : "⛔ Meine Tracks deaktiviert"
        );
        return;
      }
      if (msg.type === "DEVICE_INACTIVE" && msg.deviceId === deviceId) {
        debug("⚪ DEVICE_INACTIVE für mich");
        if (localStream)
          localStream.getTracks().forEach((t) => (t.enabled = false));
        debug("⛔ Meine Tracks deaktiviert");
        return;
      }

      if (msg.type === "offer") {
        debug("📨 Offer erhalten");
        if (!peerConnection) {
          await initPeerConnection();
          await loadFaceModels();
          startFaceDetection();
        }
        if (peerConnection.signalingState === "stable") {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg)
          );
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          sendMessage({ type: "answer", ...answer });
          debug("📨 Answer gesendet");
        }
        return;
      }
      if (msg.type === "answer") {
        debug("📨 Answer erhalten");
        if (
          peerConnection &&
          peerConnection.signalingState === "have-local-offer"
        ) {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg)
          );
        }
        return;
      }
      if (msg.type === "ice") {
        debug("📡 ICE-Candidate erhalten");
        if (peerConnection) {
          try {
            await peerConnection.addIceCandidate(msg.candidate);
          } catch (e) {
            debug("⚠️ ICE-Candidate Fehler: " + e.message);
          }
        }
        return;
      }
      debug("⚠️ Unbekannter Nachrichtentyp: " + msg.type);
    };
  } catch (err) {
    clearTimeout(connectionTimeout);
    debug("Fehler beim Erstellen der WebSocket-Instanz: " + err.message);
    handleReconnect("Creation Error");
  }
}

// Helper: Nachricht senden
function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const str = JSON.stringify(message);
    socket.send(str);
    debug(
      "📤 Nachricht gesendet: " +
        str.substring(0, 50) +
        (str.length > 50 ? "..." : "")
    );
    return true;
  }
  debug("⚠️ Nachricht nicht gesendet - WS nicht offen");
  return false;
}

// Ping/Pong
function sendPing() {
  if (sendMessage({ type: "ping", timestamp: Date.now() })) {
    debug("🏓 Ping gesendet");
  }
}

// Reconnect-Logik
function handleReconnect(reason) {
  debug(`Reconnect ausgelöst durch: ${reason}`);
  reconnectAttempts++;
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    statusElement.textContent = `Verbindung fehlgeschlagen nach ${reconnectAttempts} Versuchen. Bitte neu laden.`;
    return;
  }
  const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
  debug(
    `Neuer Verbindungsversuch in ${delay / 1000}s (Versuch ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
  );
  statusElement.textContent = `Verbindung in ${delay / 1000}s erneut...`;
  reconnectTimer = setTimeout(connectWebSocket, delay);
}

// 2) PeerConnection + lokale Medien
async function initPeerConnection() {
  try {
    debug("Starte Medien-Zugriff...");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    debug("✅ Medien-Zugriff OK");
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(config);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = ({ streams: [s] }) => {
      debug("🎬 Remote-Track erhalten");
      remoteVideo.srcObject = s;
    };
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendMessage({ type: "ice", candidate });
        debug("📡 ICE-Candidate gesendet");
      }
    };
    peerConnection.onconnectionstatechange = () =>
      debug("ConnectionState: " + peerConnection.connectionState);
    peerConnection.onsignalingstatechange = () =>
      debug("SignalingState: " + peerConnection.signalingState);
    peerConnection.oniceconnectionstatechange = () =>
      debug("ICEState: " + peerConnection.iceConnectionState);

    debug("🎬 PeerConnection initialisiert");
    return true;
  } catch (e) {
    debug("❌ Medienzugriff fehlgeschlagen: " + e.message);
    alert("Kamera/Mikrofon-Fehler: " + e.message);
    return false;
  }
}

// 3) Face-API-Modelle
async function loadFaceModels() {
  try {
    debug("Lade Face-API-Modelle...");
    await faceapi.nets.tinyFaceDetector.loadFromUri("models");
    debug("✅ Modelle geladen");
    return true;
  } catch (e) {
    debug("❌ Modelle-Ladefehler: " + e.message);
    return false;
  }
}

// 4) Device-Status senden
function sendDeviceStatus(isActive) {
  sendMessage({
    type: isActive ? "DEVICE_ACTIVE" : "DEVICE_INACTIVE",
    deviceId,
  });
  debug("📡 Device status: " + (isActive ? "ACTIVE" : "INACTIVE"));
}

// 5) Face-Detection-Loop
function startFaceDetection() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  let lastState = null,
    failCount = 0;
  debug("🔍 Starte Face-Detection-Loop");
  const interval = setInterval(async () => {
    if (!localVideo.videoWidth) return;
    try {
      const result = await Promise.race([
        faceapi.detectSingleFace(localVideo, options),
        new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 2000)),
      ]);
      const active = !!result;
      if (active !== lastState) {
        sendDeviceStatus(active);
        lastState = active;
        debug("👤 Face-Detection: " + (active ? "erkannt" : "nicht erkannt"));
      }
      failCount = 0;
    } catch (e) {
      failCount++;
      debug("⚠️ Detection-Fehler: " + e.message);
      if (failCount >= 3 && lastState !== false) {
        sendDeviceStatus(false);
        lastState = false;
        debug("⚠️ Setze auf INACTIVE nach Wiederholungs-Fehlern");
      }
      if (failCount >= 3 && localStream) {
        localStream.getTracks().forEach((t) => (t.enabled = false));
        debug("⛔ Tracks deaktiviert nach Fehlern");
      }
    }
  }, 1000);
  window.addEventListener("beforeunload", () => clearInterval(interval));
}

// 6) Klick-Handler
startBtn.addEventListener("click", async () => {
  debug("▶️ Start-Button geklickt");
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert("Keine Verbindung zum Server. Bitte warten.");
    return;
  }
  if (!peerConnection) {
    if (!(await initPeerConnection())) return;
    if (await loadFaceModels()) startFaceDetection();
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendMessage({ type: "offer", ...offer });
      debug("📨 Offer gesendet");
    } catch (e) {
      debug("Offer-Fehler: " + e.message);
      alert("Fehler beim Starten des Anrufs.");
    }
  } else {
    debug("PeerConnection existiert bereits.");
  }
});

// Keep-Alive
function startKeepAlive() {
  const timer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) sendPing();
    else debug("Kein Ping - WS nicht offen");
  }, 30000);
  window.addEventListener("beforeunload", () => clearInterval(timer));
}

// App-Init
async function initApp() {
  debug("🚀 App initialisiere...");
  await testHttpConnection?.();
  connectWebSocket();
  startKeepAlive();
}
window.addEventListener("load", initApp);
