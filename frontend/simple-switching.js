// Nur wenn URL Parameter "multi=true" hat
if (new URLSearchParams(window.location.search).get("multi") === "true") {
  console.log("Multi-Device Modus aktiviert!");

  // Device ID
  const deviceId = "dev-" + Math.random().toString(36).substr(2, 6);
  let isMyTurn = false;

  // Info anzeigen
  const info = document.createElement("div");
  info.style.cssText =
    "background:#e3f2fd; padding:10px; margin:10px; text-align:center;";
  info.innerHTML = `<h3>Multi-Device Modus | Gerät: ${deviceId}</h3>
                    <p id="switch-status">Warte...</p>`;
  document.body.insertBefore(info, document.body.firstChild);

  // Gesichtserkennung (super einfach)
  let checkInterval = setInterval(() => {
    if (!localVideo || !localVideo.srcObject) return;

    // Canvas für Bewegungserkennung
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 80;
    canvas.height = 60;

    ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Zähle helle Pixel in der Mitte (vereinfachte "Gesichtserkennung")
    let brightPixels = 0;
    const centerStart = data.data.length / 3;
    const centerEnd = (data.data.length * 2) / 3;

    for (let i = centerStart; i < centerEnd; i += 4) {
      const brightness =
        (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
      if (brightness > 100) brightPixels++;
    }

    // Wenn genug helle Pixel → "Gesicht"
    if (brightPixels > 200 && !isMyTurn && socket) {
      console.log("Will Kamera übernehmen!");
      socket.send(
        JSON.stringify({
          type: "want-camera",
          deviceId: deviceId,
        })
      );
    }
  }, 2000); // Alle 2 Sekunden

  // WebSocket Messages erweitern
  const originalOnMessage = socket.onmessage;
  socket.onmessage = async (event) => {
    let data = event.data;
    if (data instanceof Blob) data = await data.text();

    try {
      const msg = JSON.parse(data);

      if (msg.type === "want-camera") {
        // Jemand will die Kamera
        if (msg.deviceId !== deviceId) {
          // Nicht ich - Kamera abgeben
          isMyTurn = false;
          if (localStream) {
            localStream.getVideoTracks().forEach((t) => (t.enabled = false));
          }
          document.getElementById("switch-status").textContent =
            "Kamera inaktiv";
          console.log("Kamera abgegeben an", msg.deviceId);
        } else {
          // Ich bin's - Kamera aktivieren
          isMyTurn = true;
          if (localStream) {
            localStream.getVideoTracks().forEach((t) => (t.enabled = true));
          }
          document.getElementById("switch-status").textContent =
            "📹 KAMERA AKTIV!";
          console.log("Kamera übernommen!");
        }
        return; // Diese Nachricht nicht weiterleiten
      }
    } catch (e) {}

    // Normale Nachrichten weiterleiten
    if (originalOnMessage) originalOnMessage.call(socket, event);
  };

  // Am Anfang Kamera aus
  setTimeout(() => {
    if (localStream && !isMyTurn) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
  }, 1000);
}
