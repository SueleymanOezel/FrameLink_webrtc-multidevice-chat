const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let peerConnection;
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

async function start() {
  try {
    // 1. Zugriff auf Kamera + Mikrofon
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;

    // 2. PeerConnection initialisieren
    peerConnection = new RTCPeerConnection(config);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    // 3. Remote-Stream anzeigen (wird später durch Signaling kommen)
    peerConnection.ontrack = ({ streams: [stream] }) => {
      remoteVideo.srcObject = stream;
    };

    console.log('Local stream und PeerConnection gesetzt');
  } catch (err) {
    console.error('Fehler beim Starten der Medien:', err);
  }
}

// App starten
start();
