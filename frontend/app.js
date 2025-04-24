// Elemente aus dem DOM
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startCall');

// Button bis WebSocket open deaktivieren
startBtn.disabled = true;

let localStream;
let peerConnection;

// STUN-Server-Konfiguration
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// 1. WebSocket-Setup
const socket = new WebSocket('ws://localhost:8765');
socket.onopen = () => {
  console.log('✅ WebSocket verbunden');
  startBtn.disabled = false;
};
socket.onerror = (err) => console.error('❌ WebSocket-Error:', err);
socket.onclose = () => {
  console.warn('⚠️ WebSocket geschlossen');
  startBtn.disabled = true;
};

// 2. initPeerConnection (erstellt PC & holt Media)
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
      socket.send(JSON.stringify({ type: 'ice', candidate }));
    }
  };

  console.log('🎬 PeerConnection initialisiert');
}

// 3. Signaling-Handler
socket.onmessage = async ({ data }) => {
  const msg = JSON.parse(data);

  if (msg.type === 'offer') {
    console.log('📨 Offer erhalten');

    // Wenn noch keine PC existiert, erstelle sie jetzt
    if (!peerConnection) {
      try {
        await initPeerConnection();
      } catch (err) {
        console.error('Fehler beim initialisieren der PeerConnection:', err);
        return;
      }
    }

    await peerConnection.setRemoteDescription(msg);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'answer', ...answer }));
      console.log('📨 Answer gesendet');
    }
    return;
  }

  if (msg.type === 'answer') {
    console.log('📨 Answer erhalten');
    await peerConnection.setRemoteDescription(msg);
    return;
  }

  if (msg.type === 'ice') {
    console.log('📡 ICE-Candidate erhalten');

    // Stelle sicher, dass PC existiert (ansonsten verwirf)
    if (peerConnection) {
      await peerConnection.addIceCandidate(msg.candidate);
    }
    return;
  }
};

// 4. Klick-Handler zum Starten des Calls
startBtn.addEventListener('click', async () => {
  console.log('▶️ Start-Button geklickt');

  if (socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket nicht offen, Abbruch');
    return;
  }

  // PC & Stream initialisieren (falls noch nicht geschehen)
  if (!peerConnection) {
    try {
      await initPeerConnection();
    } catch (err) {
      console.error('Init fehlgeschlagen:', err);
      return;
    }
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.send(JSON.stringify({ type: 'offer', ...offer }));
  console.log('📨 Offer gesendet');
});
