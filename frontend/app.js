// Elemente aus dem DOM
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startCall');

// Button bis WebSocket open deaktiviert lassen
startBtn.disabled = true;

let localStream;
let peerConnection;

// STUN-Server für ICE
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// 1) WebSocket einrichten
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

// 2) PeerConnection + Media holen
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

// 3) Face-API Modelle laden
async function loadFaceModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  console.log('✅ face-api.js Modelle geladen');
}

// 4) Device-Status versenden
function sendDeviceStatus(isActive) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: isActive ? 'DEVICE_ACTIVE' : 'DEVICE_INACTIVE',
        deviceId: 'device-' + Math.random().toString(36).substr(2, 8),
      })
    );
    console.log('📡 Device status:', isActive ? 'ACTIVE' : 'INACTIVE');
  }
}

// 5) Detection-Loop starten
function startFaceDetection() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  setInterval(async () => {
    const result = await faceapi.detectSingleFace(localVideo, options);
    sendDeviceStatus(!!result);
  }, 1000);
}

// 6) Signaling-Nachrichten handling
socket.onmessage = async ({ data }) => {
  const msg = JSON.parse(data);

  if (msg.type === 'offer') {
    console.log('📨 Offer erhalten');
    if (!peerConnection) await initPeerConnection();
    await peerConnection.setRemoteDescription(msg);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: 'answer', ...answer }));
    console.log('📨 Answer gesendet');
    return;
  }

  if (msg.type === 'answer') {
    console.log('📨 Answer erhalten');
    await peerConnection.setRemoteDescription(msg);
    return;
  }

  if (msg.type === 'ice') {
    console.log('📡 ICE-Candidate erhalten');
    if (peerConnection) await peerConnection.addIceCandidate(msg.candidate);
    return;
  }

  if (msg.type === 'DEVICE_ACTIVE') {
    console.log('🔵 Gerät aktiv erkannt');
    return;
  }

  if (msg.type === 'DEVICE_INACTIVE') {
    console.log('⚪ Gerät inaktiv erkannt');
    return;
  }
};

// 7) Klick-Handler
startBtn.addEventListener('click', async () => {
  console.log('▶️ Start-Button geklickt');

  if (socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket nicht offen, Abbruch');
    return;
  }

  if (!peerConnection) {
    await initPeerConnection();
    await loadFaceModels();
    startFaceDetection();
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: 'offer', ...offer }));
  console.log('📨 Offer gesendet');
});
