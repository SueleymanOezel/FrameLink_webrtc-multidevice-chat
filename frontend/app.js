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

  // Begrenze die Anzahl der Einträge
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

// STUN-Server-Konfiguration für ICE
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// WebSocket-Verbindung und Steuerung
let socket;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 Sekunden

// 1) WebSocket einrichten mit Retry-Mechanismus
function connectWebSocket() {
  // Wenn bereits ein Reconnect-Timer läuft, abbrechen
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  debug("Versuche WebSocket-Verbindung aufzubauen...");
  statusElement.textContent = "Verbindung wird aufgebaut...";
  statusElement.style.color = "blue";
  statusElement.style.backgroundColor = "#eeeeff";

  // Verschiedene URLs ausprobieren
  const baseUrl = "framelinkwebrtc-multidevice-chat-production.up.railway.app";
  // Erstelle ein Array mit möglichen WebSocket-URLs
  const wsUrls = [
    `wss://${baseUrl}`, // Standard-URL ohne Port
    `wss://${baseUrl}/`, // Mit Trailing Slash
    `wss://${baseUrl}/ws`, // Mit /ws Pfad
    `wss://${baseUrl}/socket`, // Mit /socket Pfad
    `wss://${baseUrl}:443`, // Mit explizitem HTTPS-Port
  ];

  // Index der aktuellen URL
  const currentUrlIndex = reconnectAttempts % wsUrls.length;
  const wsUrl = wsUrls[currentUrlIndex];

  debug(`WebSocket-URL (Versuch ${reconnectAttempts + 1}): ${wsUrl}`);

  // Verbindungstimeout setzen
  const connectionTimeout = setTimeout(() => {
    debug("WebSocket-Verbindungs-Timeout nach 10 Sekunden");
    if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      handleReconnect("Timeout");
    }
  }, 10000);

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      debug("✅ WebSocket verbunden");
      statusElement.style.color = "green";
      statusElement.style.backgroundColor = "#eeffee";
      statusElement.style.border = "1px solid green";
      statusElement.textContent = "Verbunden mit Signaling-Server";
      startBtn.disabled = false; // Button aktivieren
      reconnectAttempts = 0; // Reset reconnect counter on successful connection

      // Ping senden, um die Verbindung zu testen
      sendPing();
    };

    socket.onerror = (err) => {
      debug(`❌ WebSocket-Error: ${JSON.stringify(err)}`);

      // Stelle sicher, dass wir nicht mehrfach handleReconnect aufrufen
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
      debug(
        `⚠️ WebSocket geschlossen: Code ${event.code} (${reason}), Grund: ${event.reason || "Kein Grund angegeben"}`
      );

      statusElement.style.color = "red";
      statusElement.style.backgroundColor = "#ffeeee";
      statusElement.style.border = "1px solid red";
      statusElement.textContent = `Verbindung getrennt: Code ${event.code} (${reason})`;
      startBtn.disabled = true; // Button deaktivieren

      handleReconnect("Closed");
    };

    // 6) Signaling-Handler + dynamisches Umschalten
    socket.onmessage = async ({ data }) => {
      debug(
        "📩 Nachricht erhalten: " +
          data.substring(0, 50) +
          (data.length > 50 ? "..." : "")
      );

      try {
        const msg = JSON.parse(data);

        // —— Pong-Antwort —— //
        if (msg.type === "pong") {
          debug("🏓 Pong erhalten");
          return;
        }

        // —— Dynamisches Umschalten: DEVICE_ACTIVE / DEVICE_INACTIVE —— //
        if (msg.type === "DEVICE_ACTIVE") {
          debug("🔵 DEVICE_ACTIVE von " + msg.deviceId);
          if (!localStream) return;

          if (msg.deviceId === deviceId) {
            localStream.getVideoTracks().forEach((t) => (t.enabled = true));
            localStream.getAudioTracks().forEach((t) => (t.enabled = true));
            debug("✅ Meine Tracks aktiviert");
          } else {
            localStream.getVideoTracks().forEach((t) => (t.enabled = false));
            localStream.getAudioTracks().forEach((t) => (t.enabled = false));
            debug("⛔ Meine Tracks deaktiviert");
          }
          return;
        }

        if (msg.type === "DEVICE_INACTIVE" && msg.deviceId === deviceId) {
          debug("⚪ DEVICE_INACTIVE für mich");
          if (localStream) {
            localStream.getVideoTracks().forEach((t) => (t.enabled = false));
            localStream.getAudioTracks().forEach((t) => (t.enabled = false));
            debug("⛔ Meine Tracks (INACTIVE) deaktiviert");
          }
          return;
        }

        // —— WebRTC-Signaling: Offer, Answer, ICE —— //
        if (msg.type === "offer") {
          debug("📨 Offer erhalten");
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
            sendMessage({ type: "answer", ...answer });
            debug("📨 Answer gesendet");
          } else {
            debug(
              "PeerConnection nicht im stable-Zustand, kein Remote-Offer angewendet."
            );
          }
          return;
        }

        if (msg.type === "answer") {
          debug("📨 Answer erhalten");
          // Nur anwenden, wenn wir gerade eine lokale Offer erstellt haben
          if (
            peerConnection &&
            peerConnection.signalingState === "have-local-offer"
          ) {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(msg)
            );
          } else {
            debug(
              "Keine lokale Offer ausstehend, kein Remote-Answer angewendet."
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
              debug(
                "ICE-Candidate konnte nicht hinzugefügt werden: " + e.message
              );
            }
          }
          return;
        }

        // Unbekannter Nachrichtentyp
        debug("⚠️ Unbekannter Nachrichtentyp: " + msg.type);
      } catch (error) {
        debug("Fehler beim Verarbeiten der Nachricht: " + error.message);
      }
    };
  } catch (err) {
    clearTimeout(connectionTimeout);
    debug("Fehler beim Erstellen der WebSocket-Instanz: " + err.message);
    handleReconnect("Creation Error");
  }
}

// Helper-Funktion für die WebSocket-Nachrichtensendung
function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const messageStr = JSON.stringify(message);
    socket.send(messageStr);
    debug(
      "📤 Nachricht gesendet: " +
        messageStr.substring(0, 50) +
        (messageStr.length > 50 ? "..." : "")
    );
    return true;
  } else {
    debug(
      "⚠️ Nachricht konnte nicht gesendet werden - WebSocket nicht verbunden"
    );
    return false;
  }
}

// Ping-Funktion
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
    debug(
      `Maximale Anzahl an Wiederverbindungsversuchen (${MAX_RECONNECT_ATTEMPTS}) erreicht.`
    );
    statusElement.textContent = `Verbindung fehlgeschlagen nach ${MAX_RECONNECT_ATTEMPTS} Versuchen. Bitte Seite neu laden.`;
    return;
  }

  const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
  debug(
    `Versuche erneute Verbindung in ${delay / 1000} Sekunden... (Versuch ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
  );
  statusElement.textContent = `Verbindung wird in ${delay / 1000} Sekunden erneut versucht... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;

  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, delay);
}

// HTTP-Verbindungstest vor WebSocket-Verbindung
async function testHttpConnection() {
  try {
    debug("Teste HTTP-Verbindung zum Server...");
    const baseUrl =
      "https://framelinkwebrtc-multidevice-chat-production.up.railway.app";

    // Teste Ping-Endpoint
    const pingUrl = `${baseUrl}/ping`;
    debug(`Versuche HTTP-Verbindung zu: ${pingUrl}`);

    const response = await fetch(pingUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
    });

    if (response.ok) {
      const data = await response.json();
      debug(`✅ HTTP-Verbindung erfolgreich: ${JSON.stringify(data)}`);
      return true;
    } else {
      debug(
        `❌ HTTP-Verbindung fehlgeschlagen: ${response.status} ${response.statusText}`
      );

      // Versuche die Root-URL
      debug(`Versuche HTTP-Verbindung zu: ${baseUrl}`);
      const rootResponse = await fetch(baseUrl, {
        method: "GET",
        mode: "cors",
      });

      if (rootResponse.ok) {
        debug(`✅ HTTP-Verbindung zur Root-URL erfolgreich`);
        return true;
      } else {
        debug(
          `❌ HTTP-Verbindung zur Root-URL fehlgeschlagen: ${rootResponse.status} ${rootResponse.statusText}`
        );
        return false;
      }
    }
  } catch (error) {
    debug(`❌ HTTP-Verbindungstest fehlgeschlagen: ${error.message}`);
    return false;
  }
}

// 2) PeerConnection + lokale Medien abrufen
async function initPeerConnection() {
  try {
    debug("Starte Medien-Zugriff...");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    debug("✅ Medien-Zugriff erfolgreich");
    localVideo.srcObject = localStream;

    debug("Erstelle RTCPeerConnection...");
    peerConnection = new RTCPeerConnection(config);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = ({ streams: [stream] }) => {
      debug("🎬 Remote-Track erhalten");
      remoteVideo.srcObject = stream;
    };

    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendMessage({ type: "ice", candidate });
        debug("📡 ICE-Candidate gesendet");
      }
    };

    // Zusätzliche Event-Handler für besseres Debugging
    peerConnection.oniceconnectionstatechange = () => {
      debug("ICE Verbindungsstatus: " + peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
      debug("Signaling-Status: " + peerConnection.signalingState);
    };

    peerConnection.onconnectionstatechange = () => {
      debug("Verbindungsstatus: " + peerConnection.connectionState);
    };

    debug("🎬 PeerConnection initialisiert");
    return true;
  } catch (error) {
    debug("❌ Fehler beim Initialisieren der PeerConnection: " + error.message);
    alert("Fehler beim Zugriff auf Kamera/Mikrofon: " + error.message);
    return false;
  }
}

// 3) Face-API-Modelle laden
async function loadFaceModels() {
  try {
    debug("Lade Face-API-Modelle...");
    await faceapi.nets.tinyFaceDetector.loadFromUri("models");
    debug("✅ face-api.js Modelle geladen");
    return true;
  } catch (error) {
    debug("❌ Fehler beim Laden der Face-API-Modelle: " + error.message);
    return false;
  }
}

// 4) Device-Status versenden (mit fester Geräte-ID)
function sendDeviceStatus(isActive) {
  sendMessage({
    type: isActive ? "DEVICE_ACTIVE" : "DEVICE_INACTIVE",
    deviceId: deviceId,
  });

  debug(
    "📡 Device status: " +
      (isActive ? "ACTIVE" : "INACTIVE") +
      " – von " +
      deviceId
  );
}

// 5) Face-Detection-Loop (nur an Status-Änderungen senden)
function startFaceDetection() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  let lastFaceState = null; // null = noch nicht bestimmt, true/false = letzter Zustand
  let detectionFailCount = 0;
  const MAX_FAILURES = 3; // Nach 3 Fehlern in Folge als "kein Gesicht" werten

  debug("🔍 Starte Face-Detection-Loop");

  const detectionInterval = setInterval(async () => {
    if (!localVideo.srcObject || !localVideo.videoWidth) {
      debug("Video noch nicht bereit für Face-Detection");
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
        debug(
          "👤 Gesichtserkennung: " +
            (isActive ? "Gesicht erkannt" : "Kein Gesicht")
        );
      }
    } catch (err) {
      debug("⚠️ Face-Detection-Error: " + err.name + " " + err.message);
      detectionFailCount++;

      if (detectionFailCount >= MAX_FAILURES && lastFaceState !== false) {
        sendDeviceStatus(false);
        lastFaceState = false;
        debug(
          "⚠️ Face-Detection: Mehrere Fehler in Folge, setze Status auf INACTIVE"
        );
      }

      if (localStream && detectionFailCount >= MAX_FAILURES) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        debug("⛔ Tracks deaktiviert wegen Face-Detection-Fehlern");
      }
    }
  }, 1000);

  // Event-Handler zum Bereinigen des Intervalls hinzufügen
  window.addEventListener("beforeunload", () => {
    clearInterval(detectionInterval);
  });
}

// Ping-Funktion, um die Verbindung aktiv zu halten
function startKeepAlive() {
  const pingInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendPing();
    } else {
      debug("Ping nicht möglich - WebSocket nicht verbunden");
    }
  }, 30000); // Alle 30 Sekunden

  // Event-Handler zum Bereinigen des Intervalls hinzufügen
  window.addEventListener("beforeunload", () => {
    clearInterval(pingInterval);
  });
}

// 7) Klick-Handler: Nur einmal Offer erzeugen + face-Detection starten
startBtn.addEventListener("click", async () => {
  debug("▶️ Start-Button geklickt");

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    debug("WebSocket nicht offen – Abbruch");
    alert("Keine Verbindung zum Server. Bitte warten oder Seite neu laden.");
    return;
  }

  // Wenn keine PeerConnection existiert, initialisiere und sende Offer
  if (!peerConnection) {
    const peerInitialized = await initPeerConnection();
    if (!peerInitialized) {
      debug("PeerConnection konnte nicht initialisiert werden");
      return;
    }

    const modelsLoaded = await loadFaceModels();
    if (modelsLoaded) {
      startFaceDetection();
    } else {
      debug("Face-Detection startet ohne Modelle!");
    }

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendMessage({ type: "offer", ...offer });
      debug("📨 Offer gesendet");
    } catch (error) {
      debug("Fehler beim Erstellen/Senden des Angebots: " + error.message);
      alert("Fehler beim Starten des Anrufs: " + error.message);
    }
    return;
  }

  debug("PeerConnection existiert bereits, kein neues Offer gesendet.");
});

// Initialisierung der App
async function initApp() {
  debug("🚀 App wird initialisiert...");

  // Zuerst HTTP-Verbindung testen
  const httpConnected = await testHttpConnection();
  if (httpConnected) {
    debug("HTTP-Verbindung zum Server hergestellt, versuche WebSocket...");
  } else {
    debug("HTTP-Verbindung fehlgeschlagen, versuche trotzdem WebSocket...");
    statusElement.textContent =
      "Server scheint nicht erreichbar zu sein, versuche Verbindung...";
  }

  // WebSocket-Verbindung starten
  connectWebSocket();

  // Keep-Alive starten
  startKeepAlive();
}

// App starten
window.addEventListener("load", initApp);
