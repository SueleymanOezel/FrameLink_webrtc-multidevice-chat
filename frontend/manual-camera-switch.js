window.addEventListener("load", () => {
  // Warte bis WebSocket bereit
  setTimeout(() => {
    if (!window.socket) return;

    // Test-UI hinzufügen
    const testPanel = document.createElement("div");
    testPanel.style.cssText =
      "background:#fff3cd; padding:15px; margin:10px auto; max-width:600px; border-radius:8px; text-align:center;";
    testPanel.innerHTML = `
      <h3>🧪 Kamera-Switch Test</h3>
      <p>Device ID: <code id="test-device-id">${Math.random().toString(36).substr(2, 6)}</code></p>
      <button id="claim-camera" style="padding:10px 20px; margin:5px; background:#4caf50; color:white; border:none; border-radius:4px; cursor:pointer;">
        📹 Kamera übernehmen
      </button>
      <button id="release-camera" style="padding:10px 20px; margin:5px; background:#f44336; color:white; border:none; border-radius:4px; cursor:pointer;">
        ⏹️ Kamera freigeben
      </button>
      <p id="camera-state" style="margin-top:10px; font-weight:bold;">Status: Unbekannt</p>
    `;

    document.body.insertBefore(testPanel, document.body.firstChild);

    const deviceId = document.getElementById("test-device-id").textContent;
    let hasCamera = true;

    // Button Handler
    document.getElementById("claim-camera").addEventListener("click", () => {
      console.log("Übernehme Kamera...");
      socket.send(
        JSON.stringify({
          type: "camera-claim",
          deviceId: deviceId,
          timestamp: Date.now(),
        })
      );
    });

    document.getElementById("release-camera").addEventListener("click", () => {
      console.log("Gebe Kamera frei...");
      socket.send(
        JSON.stringify({
          type: "camera-release",
          deviceId: deviceId,
        })
      );
    });

    // Message Handler
    const originalOnMessage = socket.onmessage;
    socket.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);
        console.log("Nachricht:", msg.type, msg.deviceId);

        if (msg.type === "camera-claim") {
          if (msg.deviceId === deviceId) {
            // Ich habe die Kamera
            hasCamera = true;
            if (localStream) {
              localStream.getVideoTracks().forEach((t) => (t.enabled = true));
            }
            document.getElementById("camera-state").textContent =
              "Status: 📹 AKTIV";
            document.getElementById("camera-state").style.color = "green";
            localVideo.style.border = "4px solid #4caf50";
          } else {
            // Jemand anders hat die Kamera
            hasCamera = false;
            if (localStream) {
              localStream.getVideoTracks().forEach((t) => (t.enabled = false));
            }
            document.getElementById("camera-state").textContent =
              `Status: ⏸️ Inaktiv (${msg.deviceId} ist aktiv)`;
            document.getElementById("camera-state").style.color = "gray";
            localVideo.style.border = "2px solid #ccc";
          }
          return;
        }

        if (
          msg.type === "camera-release" &&
          msg.deviceId !== deviceId &&
          hasCamera
        ) {
          // Jemand gibt Kamera frei, aber ich bleibe aktiv
          console.log(`${msg.deviceId} hat Kamera freigegeben`);
          return;
        }
      } catch (e) {}

      // Normale Nachrichten
      if (originalOnMessage) originalOnMessage.call(socket, event);
    };

    // Initial state
    document.getElementById("camera-state").textContent =
      "Status: Bereit zum Testen";
  }, 2000); // 2 Sekunden warten bis alles geladen ist
});
