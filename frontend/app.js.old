// DOM Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startCall");
const statusDiv = document.getElementById("status") || createStatusDiv();
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const endCallBtn = document.getElementById("endCallBtn");

// Status-Anzeige erstellen falls nicht vorhanden
function createStatusDiv() {
  const div = document.createElement("div");
  div.id = "status";
  div.style.padding = "10px";
  div.style.margin = "10px";
  div.style.backgroundColor = "#f0f0f0";
  div.style.border = "1px solid #ccc";
  document.body.insertBefore(div, document.body.firstChild);
  return div;
}

// Globale Variablen
let localStream;
let peerConnection;
let socket;
let cameraEnabled = true;
let micEnabled = true;

// ================================================================
// ENHANCED TURN CONFIGURATION - Deine verbesserte Version
// ================================================================

const TURN_USERNAME = "18dd3dc42100ea8643228a68";
const TURN_CREDENTIAL = "9u70h1tuJ9YA0ONB";

const ENHANCED_ICE_SERVERS = [
  // STUN Servers
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },

  // UDP-TURN (oft schneller und zuverlässiger)
  {
    urls: "turn:global.relay.metered.ca:3478?transport=udp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=udp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },

  // TCP-TURN (Fallback wenn UDP blockiert ist)
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },

  // Backup: Original Konfiguration
  {
    urls: "turn:global.relay.metered.ca:80",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
];

// Status anzeigen
function showStatus(message, color = "black") {
  console.log(message);
  statusDiv.textContent = message;
  statusDiv.style.color = color;
}

// WebSocket-Verbindung
function connectWebSocket() {
  const wsUrl = window.WEBSOCKET_URL || "wss://framelink-signaling.fly.dev";

  showStatus("Verbinde mit Server...", "blue");

  socket = new WebSocket(wsUrl);
  window.socket = socket;

  socket.onopen = () => {
    showStatus("Mit Server verbunden!", "green");
    startBtn.disabled = false;
  };

  socket.onerror = (error) => {
    showStatus("Verbindungsfehler!", "red");
    console.error("WebSocket Fehler:", error);
  };

  socket.onclose = () => {
    showStatus("Verbindung getrennt", "orange");
    startBtn.disabled = true;
    window.socket = null;
    setTimeout(connectWebSocket, 3000);
  };

  socket.onmessage = async (event) => {
    try {
      let data;
      if (event.data instanceof Blob) {
        data = await event.data.text();
      } else {
        data = event.data;
      }

      const message = JSON.parse(data);

      if (message.type === "offer") {
        await handleOffer(message);
      } else if (message.type === "answer") {
        await handleAnswer(message);
      } else if (message.type === "ice") {
        await handleIceCandidate(message);
      }
    } catch (error) {
      console.error("Fehler beim Verarbeiten der Nachricht:", error);
    }
  };
}

// Medien initialisieren
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
    showStatus("Kamera bereit", "green");
    return true;
  } catch (error) {
    showStatus("Kamera-Fehler: " + error.message, "red");
    return false;
  }
}

// PeerConnection erstellen mit Enhanced TURN Config
function createPeerConnection() {
  console.log("🔧 Creating PeerConnection with Enhanced TURN Config...");

  peerConnection = new RTCPeerConnection({
    iceServers: ENHANCED_ICE_SERVERS,
    iceTransportPolicy: "all", // Erlaube alle Candidate-Typen
    iceCandidatePoolSize: 15, // Mehr Candidates für bessere Konnektivität
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  // Lokale Tracks hinzufügen
  if (localStream && localStream.getTracks) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  } else {
    console.warn("localStream noch nicht verfügbar - wird später hinzugefügt");
  }

  // Remote Stream empfangen
  peerConnection.ontrack = (event) => {
    console.log("Remote track empfangen:", event.streams);
    remoteVideo.srcObject = event.streams[0];
    showStatus("Verbindung hergestellt!", "green");
  };

  // Verbindungsstatus überwachen
  peerConnection.onconnectionstatechange = () => {
    console.log("Verbindungsstatus:", peerConnection.connectionState);
    showStatus(`Verbindung: ${peerConnection.connectionState}`, "blue");

    if (peerConnection.connectionState === "connected") {
      showStatus("Video Call erfolgreich verbunden!", "green");
    } else if (
      peerConnection.connectionState === "failed" ||
      peerConnection.connectionState === "disconnected"
    ) {
      showStatus("Verbindung verloren - bitte neu starten", "orange");

      setTimeout(() => {
        if (peerConnection.connectionState === "disconnected") {
          showStatus("Versuche neu zu verbinden...", "blue");
        }
      }, 3000);
    }
  };

  // Enhanced ICE candidate handling mit detailliertem Logging
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // Detailliertes Logging für TURN Debug
      const candidate = event.candidate;
      console.log(
        "ICE Candidate Typ:",
        candidate.type,
        "Protokoll:",
        candidate.protocol
      );

      if (candidate.type === "relay") {
        console.log("🎉 TURN RELAY Candidate gefunden!", {
          address: candidate.address,
          port: candidate.port,
          protocol: candidate.protocol,
        });
      }

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "ice",
            candidate: event.candidate,
          })
        );
      }
    }
  };

  // ICE connection state monitoring
  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", peerConnection.iceConnectionState);

    if (peerConnection.iceConnectionState === "connected") {
      console.log(
        "🎉 ICE Connection erfolgreicht - NAT traversal funktioniert!"
      );
    } else if (peerConnection.iceConnectionState === "failed") {
      console.error("❌ ICE Connection failed - TURN Server Problem");
      showStatus("TURN Server Verbindung fehlgeschlagen", "red");
    }
  };
}

// Tracks nachträglich hinzufügen
async function addLocalStreamToPeerConnection() {
  if (!localStream) {
    const success = await initMedia();
    if (!success) return;
  }

  if (peerConnection && localStream) {
    localStream.getTracks().forEach((track) => {
      const senders = peerConnection.getSenders();
      const trackAlreadyAdded = senders.some(
        (sender) => sender.track === track
      );

      if (!trackAlreadyAdded) {
        peerConnection.addTrack(track, localStream);
        console.log("Track nachträglich hinzugefügt:", track.kind);
      }
    });
  }
}

// Kamera an/aus
function toggleCamera() {
  if (!localStream) return;
  cameraEnabled = !cameraEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled;
  });
  toggleCameraBtn.textContent = cameraEnabled
    ? "📹 Camera On"
    : "📹 Camera Off";
  showStatus(`Kamera ${cameraEnabled ? "aktiv" : "deaktiviert"}`, "blue");
}

// Mikrofon an/aus
function toggleMicrophone() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  toggleMicBtn.textContent = micEnabled ? "🎤 Mic On" : "🎤 Mic Off";
  showStatus(`Mikrofon ${micEnabled ? "aktiv" : "deaktiviert"}`, "blue");
}

// Anruf beenden
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  showStatus("Anruf beendet", "red");

  // Buttons zurücksetzen
  startBtn.disabled = false;
  toggleCameraBtn.disabled = true;
  toggleMicBtn.disabled = true;
  endCallBtn.disabled = true;
}

// Anruf starten
async function startCall() {
  // Buttons aktiv setzen
  toggleCameraBtn.disabled = false;
  toggleMicBtn.disabled = false;
  endCallBtn.disabled = false;

  if (!localStream) {
    if (!(await initMedia())) return;
  }

  createPeerConnection();

  // Offer erstellen
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  await peerConnection.setLocalDescription(offer);

  // Offer senden
  socket.send(
    JSON.stringify({
      type: "offer",
      offer: offer,
    })
  );

  showStatus("Anruf gestartet...", "blue");
}

// Offer verarbeiten
async function handleOffer(message) {
  createPeerConnection();

  await peerConnection.setRemoteDescription(message.offer);

  // Stelle sicher dass localStream verfügbar ist
  await addLocalStreamToPeerConnection();

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.send(
    JSON.stringify({
      type: "answer",
      answer: answer,
    })
  );

  showStatus("Anruf angenommen", "green");
}

// Answer verarbeiten
async function handleAnswer(message) {
  await peerConnection.setRemoteDescription(message.answer);
}

// ICE Candidate verarbeiten
async function handleIceCandidate(message) {
  try {
    if (peerConnection && message.candidate) {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(message.candidate)
      );
      console.log("ICE Candidate hinzugefügt");
    }
  } catch (error) {
    console.error("Fehler beim Hinzufügen von ICE Candidate:", error);
  }
}

// Button Events
startBtn.addEventListener("click", startCall);

// App starten
window.addEventListener("load", () => {
  connectWebSocket();
  initMedia();

  // Button-Events
  toggleCameraBtn.addEventListener("click", toggleCamera);
  toggleMicBtn.addEventListener("click", toggleMicrophone);
  endCallBtn.addEventListener("click", endCall);

  // Debug: Log TURN config on load
  console.log("🔧 Enhanced TURN Configuration loaded:", {
    servers: ENHANCED_ICE_SERVERS.length,
    username: TURN_USERNAME,
    transports: ["udp", "tcp", "original"],
  });
});
