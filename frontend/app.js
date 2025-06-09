// DOM Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startCall");
const statusDiv = document.getElementById("status") || createStatusDiv();

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

// Status anzeigen
function showStatus(message, color = "black") {
  console.log(message);
  statusDiv.textContent = message;
  statusDiv.style.color = color;
}

// WebSocket-Verbindung
function connectWebSocket() {
  // WebSocket URL - kann über Umgebungsvariable überschrieben werden
  const wsUrl = window.WEBSOCKET_URL || "wss://framelink-signaling.glitch.me";

  showStatus("Verbinde mit Server...", "blue");

  socket = new WebSocket(wsUrl);

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
    // Automatisch neu verbinden nach 3 Sekunden
    setTimeout(connectWebSocket, 3000);
  };

  socket.onmessage = async (event) => {
    try {
      // Konvertiere Blob zu Text falls nötig
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

// PeerConnection erstellen
function createPeerConnection() {
  peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "18dd3dc42100ea8643228a68",
        credential: "9u70h1tuJ9YA0ONB",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "18dd3dc42100ea8643228a68",
        credential: "9u70h1tuJ9YA0ONB",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "18dd3dc42100ea8643228a68",
        credential: "9u70h1tuJ9YA0ONB",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "18dd3dc42100ea8643228a68",
        credential: "9u70h1tuJ9YA0ONB",
      },
    ],
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

    // Bei Verbindungsverlust neu verbinden
    if (
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

  // ICE Kandidaten senden
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // Debug: Zeige welcher Typ verwendet wird
      console.log(
        "ICE Candidate Typ:",
        event.candidate.type,
        "Protokoll:",
        event.candidate.protocol
      );

      socket.send(
        JSON.stringify({
          type: "ice",
          candidate: event.candidate,
        })
      );
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
      // Prüfe ob Track bereits hinzugefügt wurde
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

// Lokale Tracks hinzufügen
localStream.getTracks().forEach((track) => {
  peerConnection.addTrack(track, localStream);
});

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

  // Bei Verbindungsverlust neu verbinden
  if (
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

// ICE Candidates
peerConnection.onicecandidate = (event) => {
  if (event.candidate && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "ice",
        candidate: event.candidate,
      })
    );
  }
};

// Anruf starten
async function startCall() {
  if (!localStream) {
    if (!(await initMedia())) return;
  }

  createPeerConnection();

  // Offer erstellen
  const offer = await peerConnection.createOffer();
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

// Button Event
startBtn.addEventListener("click", startCall);

// App starten
window.addEventListener("load", () => {
  connectWebSocket();
  initMedia(); // Kamera direkt initialisieren
});
