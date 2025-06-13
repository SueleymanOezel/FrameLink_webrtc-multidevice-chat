// simple-room.js - Multi-Device Room System
// ================================================
// Funktionen: Multi-Device Setup, Kamera-Switching, Externe Calls
// Status: FUNKTIONIERT ✅ - Basis für weitere Features

window.addEventListener("load", () => {
  // ================================================
  // INITIALIZATION - Room Setup und URL Parameter
  // ================================================

  // Room ID aus URL Parameter extrahieren oder neue generieren
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");
  let isLocalRoom = false;

  // Wenn keine Room ID vorhanden → neue Room erstellen
  if (!roomId) {
    roomId = "room-" + Math.random().toString(36).substr(2, 8);
    window.history.replaceState({}, "", "?room=" + roomId);
    isLocalRoom = true;

    // Info-Box für neuen Room anzeigen
    const info = document.createElement("div");
    info.style.cssText =
      "background:#e3f2fd; padding:20px; margin:20px auto; max-width:600px; border-radius:8px;";
    info.innerHTML = `
      <h2>📹 Smart Multi-Device Room</h2>
      <p><strong>Room ID:</strong> ${roomId}</p>
      <p>Diese URL funktioniert für beides:</p>
      <input value="${window.location.href}" readonly style="width:100%; padding:10px;" onclick="this.select()">
      <div style="margin-top:15px; padding:12px; background:white; border-radius:4px;">
        <p><strong>🎯 Wie es funktioniert:</strong></p>
        <p>✓ <strong>Multi-Device:</strong> Öffne auf mehreren eigenen Geräten</p>
        <p>✓ <strong>Video-Chat:</strong> Teile URL mit anderen für Video-Calls</p>
        <p>✓ <strong>Smart Switch:</strong> Kamera-Wechsel funktioniert auch während Calls!</p>
      </div>
    `;
    document.body.insertBefore(info, document.body.firstChild);
  }

  // ================================================
  // UI CREATION - Room Controls Interface
  // ================================================

  // Room Control Panel erstellen
  const controls = document.createElement("div");
  controls.style.cssText =
    "background:#fff3cd; padding:15px; margin:20px auto; max-width:600px; border-radius:8px; text-align:center;";
  controls.innerHTML = `
    <h3>🏠 Room: ${roomId}</h3>
    <p>Device: <code id="device-id">${Math.random().toString(36).substr(2, 6)}</code></p>
    
    <div style="display:flex; justify-content:center; gap:10px; margin:15px 0; flex-wrap:wrap;">
      <button id="join-room" style="padding:10px 18px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:14px;">
        🚪 Multi-Device aktivieren
      </button>
      <button id="video-call-btn" style="padding:10px 18px; background:#4caf50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:14px;">
        📞 Video-Call starten
      </button>
    </div>
    
    <div id="room-controls" style="display:none; margin-top:15px;">
      <button id="take-camera" style="padding:8px 16px; margin:5px; background:#4caf50; color:white; border:none; border-radius:4px;">
        📹 Kamera übernehmen
      </button>
      <p id="camera-status" style="margin:8px 0; font-weight:bold; font-size:14px;">⏸️ Kamera inaktiv</p>
      <div id="call-info" style="margin:10px 0; padding:8px; background:#f8f9fa; border-radius:4px; display:none; font-size:13px;">
        <div id="call-status">📞 Kein aktiver Call</div>
      </div>
    </div>
  `;
  document.body.insertBefore(controls, document.querySelector(".container"));

  // ================================================
  // STATE MANAGEMENT - Globale Variablen
  // ================================================

  const deviceId = document.getElementById("device-id").textContent;
  let inRoom = false; // Bin ich in einem Multi-Device Room?
  let hasCamera = false; // Habe ich die Kamera-Kontrolle?
  let roomDeviceCount = 1; // Anzahl Geräte im Room
  let callActiveWithExternal = false; // Läuft ein externer Call?
  let amCurrentCameraMaster = false; // Bin ich der Camera-Master?

  // ================================================
  // CALL DETECTION - Prüfe bestehende Calls
  // ================================================

  // Prüfe ob bereits ein Call aktiv ist (beim Room-Beitritt)
  function detectExistingCall() {
    console.log("🔍 Prüfe existierenden Call...");

    // PeerConnection Status prüfen
    if (window.peerConnection) {
      const state = window.peerConnection.connectionState;
      console.log("PeerConnection State:", state);

      if (state === "connected" || state === "connecting") {
        callActiveWithExternal = true;
        console.log(
          "✅ Externer Call detected - callActiveWithExternal:",
          true
        );
        updateCallStatus("📞 Laufender Call erkannt");

        // Prüfe ob lokale Kamera aktiv ist
        if (window.localStream) {
          const videoTracks = window.localStream.getVideoTracks();
          const hasActiveVideo = videoTracks.some((track) => track.enabled);

          if (hasActiveVideo) {
            hasCamera = true;
            amCurrentCameraMaster = true;
            console.log("✅ Aktive Kamera erkannt");
            document.getElementById("camera-status").textContent =
              "📹 KAMERA AKTIV";
            document.getElementById("camera-status").style.color = "green";
            if (window.localVideo)
              window.localVideo.style.border = "4px solid #4caf50";
          }
        }
      }
    }

    // Zusätzlich: Remote Video Stream prüfen
    if (window.remoteVideo && window.remoteVideo.srcObject) {
      console.log("✅ Remote Video Stream erkannt");
      callActiveWithExternal = true;
    }
  }

  // ================================================
  // EVENT HANDLERS - Button Click Events
  // ================================================

  // Multi-Device Room beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    // WebSocket-Verbindung prüfen
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("Server noch nicht verbunden!");
      return;
    }

    console.log("🚪 Multi-Device beitreten - Debug Start");
    console.log("Socket state:", socket.readyState);
    console.log("Original onmessage:", typeof socket.onmessage);

    // Bestehende Calls prüfen vor Room-Beitritt
    detectExistingCall();

    // Room-Beitritt Request senden
    socket.send(
      JSON.stringify({
        type: "join-room",
        roomId: roomId,
        deviceId: deviceId,
      })
    );

    // UI aktualisieren
    document.getElementById("join-room").disabled = true;
    document.getElementById("join-room").textContent = "✅ Multi-Device aktiv";
    document.getElementById("room-controls").style.display = "block";

    // State setzen
    inRoom = true;
    isLocalRoom = true;
    console.log("📞 Calling setupRoomHandlers...");
    setupRoomHandlers();
    console.log("✅ setupRoomHandlers completed");
  });

  // Video-Call starten
  document.getElementById("video-call-btn").addEventListener("click", () => {
    console.log(
      `🎯 Video-Call Start - inRoom: ${inRoom}, devices: ${roomDeviceCount}, hasCamera: ${hasCamera}`
    );

    if (inRoom && roomDeviceCount > 1) {
      // Multi-Device Modus: Nur Gerät mit Kamera darf anrufen
      if (hasCamera) {
        console.log("✅ Multi-Device Call mit Kamera");
        if (window.startCall) window.startCall();
      } else {
        console.log("❌ Multi-Device Call ohne Kamera - fordere Kamera an");
        alert(
          "Du brauchst die Kamera für einen Call! Klicke 'Kamera übernehmen'"
        );
      }
    } else {
      // Solo-Gerät oder kein Room: Normaler Call
      console.log("✅ Solo/Normal Call");
      if (window.startCall) window.startCall();
    }
  });

  // Kamera-Kontrolle übernehmen
  document.getElementById("take-camera").addEventListener("click", () => {
    if (!inRoom) return;
    console.log("🔄 Kamera-Übernahme angefordert");
    socket.send(
      JSON.stringify({
        type: "camera-request",
        roomId: roomId,
        deviceId: deviceId,
      })
    );
  });

  // ================================================
  // ROOM MESSAGE HANDLING - WebSocket Message Router
  // ================================================

  // Room Message Handler Setup
  function setupRoomHandlers() {
    console.log("🔧 setupRoomHandlers() gestartet");

    // Original WebSocket Handler speichern
    const originalOnMessage = socket.onmessage;
    console.log("Original onmessage gefunden:", typeof originalOnMessage);
    console.log(
      "Original onmessage function:",
      originalOnMessage.toString().slice(0, 100) + "..."
    );

    // Neuer Message Handler mit Room-Logic
    socket.onmessage = async (event) => {
      console.log("📨 Message empfangen in Room-Handler");

      // Blob zu Text konvertieren falls nötig
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);
        console.log("📨 Parsed message:", msg.type, msg.roomId || "no-room");

        // ================================================
        // ROOM MESSAGE PROCESSING
        // ================================================

        // Room-spezifische Messages verarbeiten
        if (msg.roomId === roomId && inRoom && isLocalRoom) {
          console.log("🏠 Room message verarbeiten:", msg.type);

          switch (msg.type) {
            case "camera-request":
              console.log("📹 Camera request verarbeiten");
              handleCameraSwitch(msg);
              return;

            case "call-status-sync":
              console.log("📞 Call status sync");
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              roomDeviceCount = msg.devices?.length || 1;
              return;
          }
        }

        // ================================================
        // WEBRTC MESSAGE PROCESSING - Multi-Device Logic
        // ================================================

        // WebRTC Messages mit Multi-Device Logic verarbeiten
        if (
          msg.type === "offer" ||
          msg.type === "answer" ||
          msg.type === "ice"
        ) {
          console.log("🔍 WebRTC Message:", msg.type);
          console.log("   - inRoom:", inRoom, "isLocalRoom:", isLocalRoom);
          console.log(
            "   - hasCamera:",
            hasCamera,
            "callActiveWithExternal:",
            callActiveWithExternal
          );
          console.log("   - roomDeviceCount:", roomDeviceCount);

          // REGEL 1: Nicht im Room → Normal verarbeiten
          if (!inRoom || !isLocalRoom) {
            console.log("✅ WebRTC (nicht im Room): Normal verarbeiten");
            if (originalOnMessage) originalOnMessage.call(socket, event);
            return;
          }

          // REGEL 2: Solo im Room → Normal verarbeiten
          if (roomDeviceCount <= 1) {
            console.log("✅ WebRTC (Solo im Room): Normal verarbeiten");
            if (originalOnMessage) originalOnMessage.call(socket, event);
            if (msg.type === "offer" || msg.type === "answer") {
              callActiveWithExternal = true;
              updateCallStatus("📞 Externer Call aktiv");
            }
            return;
          }

          // REGEL 3: Multi-Device Room Logic

          // SPECIAL CASE: Auto-Kamera-Zuweisung bei externem Call
          if (
            !hasCamera &&
            !callActiveWithExternal &&
            (msg.type === "offer" || msg.type === "answer")
          ) {
            console.log(
              "🎯 Externer Call ohne Kamera-Owner - Auto-assign Kamera"
            );
            hasCamera = true;

            // Lokale Video Tracks aktivieren
            if (window.localStream) {
              window.localStream
                .getVideoTracks()
                .forEach((t) => (t.enabled = true));
            }

            // UI aktualisieren
            document.getElementById("camera-status").textContent =
              "📹 KAMERA AUTO-AKTIV";
            document.getElementById("camera-status").style.color = "orange";
            if (window.localVideo)
              window.localVideo.style.border = "4px solid #ff9800";

            // Andere Geräte über Kamera-Übernahme informieren
            socket.send(
              JSON.stringify({
                type: "camera-request",
                roomId: roomId,
                deviceId: deviceId,
              })
            );
          }

          // WebRTC Message Routing: Verarbeite wenn Kamera ODER noch kein Call aktiv
          const shouldProcessWebRTC =
            hasCamera || !callActiveWithExternal || roomDeviceCount === 1;

          console.log("   - shouldProcessWebRTC:", shouldProcessWebRTC);
          console.log(
            "   - Grund: hasCamera(" +
              hasCamera +
              ") || !callActiveWithExternal(" +
              !callActiveWithExternal +
              ") || soloDevice(" +
              (roomDeviceCount === 1) +
              ")"
          );

          if (shouldProcessWebRTC) {
            console.log("✅ WebRTC Message wird verarbeitet:", msg.type);
            console.log("📞 Calling originalOnMessage...");
            if (originalOnMessage) originalOnMessage.call(socket, event);

            // Call Status aktualisieren
            if (msg.type === "offer" || msg.type === "answer") {
              callActiveWithExternal = true;
              amCurrentCameraMaster = hasCamera;
              updateCallStatus(
                hasCamera
                  ? "📞 Externer Call (Master)"
                  : "📞 Externer Call empfangen"
              );
            }
          } else {
            console.log(
              "❌ WebRTC Message ignoriert (Multi-Device ohne Kamera):",
              msg.type
            );
          }

          return;
        }

        // ================================================
        // MESSAGE FORWARDING - Andere Messages weiterleiten
        // ================================================

        // Alle anderen Messages an Original Handler weiterleiten
        console.log("📨 Andere Message weitergeleitet:", msg.type);
        if (originalOnMessage) originalOnMessage.call(socket, event);
      } catch (e) {
        // Parse-Fehler: Message direkt weiterleiten
        console.log("📨 Parse Error - direkt weiterleiten");
        if (originalOnMessage) originalOnMessage.call(socket, event);
      }
    };

    console.log("✅ Room handler installiert");

    // Initial Setup: Video Tracks deaktivieren (nur Audio bleibt aktiv)
    if (window.localStream) {
      window.localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    }
  }

  // ================================================
  // CAMERA SWITCHING - Kamera-Kontrolle zwischen Geräten
  // ================================================

  // Kamera-Wechsel zwischen Geräten verarbeiten
  function handleCameraSwitch(msg) {
    const wasMyCamera = hasCamera;

    if (msg.deviceId === deviceId) {
      // ICH bekomme die Kamera-Kontrolle
      hasCamera = true;
      amCurrentCameraMaster = callActiveWithExternal;

      // Video Tracks aktivieren
      if (window.localStream) {
        window.localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      }

      // UI aktualisieren: Aktive Kamera
      document.getElementById("camera-status").textContent = "📹 KAMERA AKTIV";
      document.getElementById("camera-status").style.color = "green";
      if (window.localVideo)
        window.localVideo.style.border = "4px solid #4caf50";

      console.log(
        "✅ Kamera übernommen - hasCamera:",
        hasCamera,
        "callActive:",
        callActiveWithExternal
      );

      // Re-Check für aktiven Call falls nicht erkannt
      if (!callActiveWithExternal) {
        console.log("🔍 Re-check für aktiven Call...");
        detectExistingCall();
      }

      // Wenn externer Call aktiv und ich hatte vorher keine Kamera → Call-Takeover
      if (callActiveWithExternal && !wasMyCamera) {
        console.log("🔄 Übernehme aktiven Call mit neuer Kamera");
        setTimeout(() => {
          initiateCallTakeover();
        }, 500);
      }
    } else {
      // ANDERES GERÄT bekommt die Kamera-Kontrolle
      hasCamera = false;

      // Video Tracks deaktivieren
      if (window.localStream) {
        window.localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      // UI aktualisieren: Inaktive Kamera
      document.getElementById("camera-status").textContent =
        `⏸️ ${msg.deviceId} hat Kamera`;
      document.getElementById("camera-status").style.color = "gray";
      if (window.localVideo) window.localVideo.style.border = "2px solid #ccc";

      console.log("⏸️ Kamera abgegeben an:", msg.deviceId);

      // Wenn ich hatte Call-Master Role → Übergebe an anderes Gerät
      if (callActiveWithExternal && wasMyCamera) {
        console.log("🔄 Übergebe aktiven Call an anderes Gerät");
        handoverCallToDevice(msg.deviceId);
      }
    }
  }

  // ================================================
  // CALL TAKEOVER - Kamera-Wechsel während aktivem Call
  // ================================================

  // Call-Takeover initiieren (experimentell - funktioniert teilweise)
  function initiateCallTakeover() {
    console.log("🔥 Call-Takeover gestartet");
    console.log(
      "- window.peerConnection:",
      window.peerConnection ? "EXISTS" : "NULL"
    );
    console.log("- callActiveWithExternal:", callActiveWithExternal);
    console.log("- hasCamera:", hasCamera);

    // Prüfe ob Call-Takeover möglich ist
    if (!callActiveWithExternal) {
      console.log(
        "❌ Kein aktiver Call für Takeover - Prüfe PeerConnection..."
      );

      // Fallback: PeerConnection direkt prüfen
      if (
        window.peerConnection &&
        window.peerConnection.connectionState === "connected"
      ) {
        console.log("✅ Connected PeerConnection gefunden - forciere Takeover");
        callActiveWithExternal = true;
      } else {
        console.log("❌ Keine aktive PeerConnection für Takeover");
        return;
      }
    }

    updateCallStatus("🔄 Übernehme Call...");

    // PeerConnection-Referenz finden (verschiedene mögliche Namen)
    let peerConn = window.peerConnection || window.pc || window.connection;

    // Fallback: Global nach RTCPeerConnection suchen
    if (!peerConn) {
      console.log("🔍 Suche nach PeerConnection in globalen Objekten...");
      for (let key in window) {
        if (
          window[key] &&
          typeof window[key] === "object" &&
          window[key].constructor &&
          window[key].constructor.name === "RTCPeerConnection"
        ) {
          console.log("✅ PeerConnection gefunden als:", key);
          peerConn = window[key];
          break;
        }
      }
    }

    // Wenn keine PeerConnection gefunden → Call-Restart versuchen
    if (!peerConn) {
      console.log("❌ Keine PeerConnection gefunden - erstelle neue");
      restartCallWithNewCamera();
      return;
    }

    console.log("✅ PeerConnection gefunden, starte Takeover...");
    console.log("- Connection State:", peerConn.connectionState);

    // Takeover-Offer erstellen
    setTimeout(() => {
      if (peerConn && hasCamera) {
        console.log("🔧 Erstelle Takeover-Offer...");

        // Lokaler Stream in PeerConnection aktualisieren
        if (window.localStream) {
          console.log(
            "📹 Aktuelle Video Tracks:",
            window.localStream.getVideoTracks().map((t) => ({
              id: t.id,
              enabled: t.enabled,
              readyState: t.readyState,
            }))
          );

          // Alte Tracks entfernen
          const senders = peerConn.getSenders();
          console.log("🗑️ Entferne", senders.length, "alte Senders");
          senders.forEach((sender) => {
            if (sender.track) {
              peerConn.removeTrack(sender);
            }
          });

          // Neue Tracks hinzufügen
          window.localStream.getTracks().forEach((track) => {
            console.log(
              "➕ Füge Track hinzu:",
              track.kind,
              track.enabled,
              track.id
            );
            peerConn.addTrack(track, window.localStream);
          });
        }

        // Neues Offer für Takeover erstellen
        peerConn
          .createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          })
          .then((offer) => {
            console.log("📤 Setze Local Description für Takeover");
            return peerConn.setLocalDescription(offer);
          })
          .then(() => {
            console.log(
              "📤 Sende Takeover-Offer:",
              peerConn.localDescription.type
            );
            socket.send(
              JSON.stringify({
                type: "offer",
                offer: peerConn.localDescription,
                takeover: true,
              })
            );
            updateCallStatus("📞 Call-Übernahme aktiv");
          })
          .catch((err) => {
            console.log("❌ Takeover-Offer Fehler:", err);
            updateCallStatus("❌ Call-Übernahme fehlgeschlagen");
          });
      } else {
        console.log("❌ Kein PeerConnection oder keine Kamera für Takeover");
        console.log("- peerConn:", !!peerConn);
        console.log("- hasCamera:", hasCamera);
      }
    }, 300);
  }

  // Fallback: Call mit neuer Kamera neu starten
  function restartCallWithNewCamera() {
    console.log("🔄 Restart Call mit neuer Kamera");
    updateCallStatus("🔄 Starte Call neu...");

    // Call-Restart versuchen
    if (window.startCall) {
      setTimeout(() => {
        window.startCall();
        updateCallStatus("📞 Call neu gestartet");
      }, 500);
    } else {
      updateCallStatus("❌ Call-Restart nicht möglich");
    }
  }

  // Call an anderes Gerät übergeben
  function handoverCallToDevice(newMasterDevice) {
    console.log("🔄 Übergebe Call an", newMasterDevice);
    updateCallStatus(`⏳ Call übertragen an ${newMasterDevice}`);
    amCurrentCameraMaster = false;
    // Note: PeerConnection nicht sofort schließen für saubere Übergabe
  }

  // ================================================
  // UI UPDATES - Status und Feedback
  // ================================================

  // Call Status UI aktualisieren
  function updateCallStatus(message) {
    const callInfo = document.getElementById("call-info");
    const callStatus = document.getElementById("call-status");

    if (callInfo && callStatus) {
      callInfo.style.display = "block";
      callStatus.textContent = message;

      // Color-Coding für verschiedene Status
      if (message.includes("aktiv") || message.includes("Master")) {
        callInfo.style.background = "#d4edda";
        callInfo.style.borderLeft = "4px solid #28a745";
      } else if (
        message.includes("übertragen") ||
        message.includes("Übernahme")
      ) {
        callInfo.style.background = "#fff3cd";
        callInfo.style.borderLeft = "4px solid #ffc107";
      } else {
        callInfo.style.background = "#f8f9fa";
        callInfo.style.borderLeft = "4px solid #6c757d";
      }
    }
  }

  // ================================================
  // FUNCTION INTERCEPTION - Original App.js Funktionen erweitern
  // ================================================

  // Original startCall Funktion erweitern
  const originalStartCall = window.startCall;
  if (originalStartCall) {
    window.startCall = function () {
      console.log(
        `🚀 startCall() - inRoom: ${inRoom}, devices: ${roomDeviceCount}, hasCamera: ${hasCamera}`
      );

      // Multi-Device: Nur mit Kamera-Kontrolle erlaubt
      if (inRoom && roomDeviceCount > 1 && !hasCamera) {
        console.log("⚠️ Call-Start ignoriert - keine Kamera in Multi-Device");
        alert("Du brauchst die Kamera für einen Call!");
        return;
      }

      // Call State setzen
      callActiveWithExternal = true;
      amCurrentCameraMaster = hasCamera;
      updateCallStatus("📞 Call wird gestartet...");

      // Original Funktion aufrufen
      const result = originalStartCall.apply(this, arguments);

      // Status Update nach Call-Start
      if (hasCamera) {
        updateCallStatus("📞 Externer Call aktiv (Master)");
      }

      return result;
    };
  }

  // Original endCall Funktion erweitern
  const originalEndCall = window.endCall;
  if (originalEndCall) {
    window.endCall = function () {
      // Call State zurücksetzen
      callActiveWithExternal = false;
      amCurrentCameraMaster = false;

      updateCallStatus("📞 Call beendet");

      // Original Funktion aufrufen
      return originalEndCall.apply(this, arguments);
    };
  }
});
