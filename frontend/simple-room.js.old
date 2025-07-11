// simple-room.js - Multi-Device Room System (LOGIC ONLY)
// ================================================
// Funktionen: Multi-Device Setup, Kamera-Switching, Externe Calls
// Status: FIXED - originalOnMessage Error behoben
// ================================================

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
    window.roomId = roomId;
    isLocalRoom = true;

    // Room URL in existing HTML input setzen (falls vorhanden)
    const roomUrlInput = document.getElementById("room-url");
    if (roomUrlInput) {
      roomUrlInput.value = window.location.href;
    }

    // Room info section anzeigen (falls vorhanden)
    const roomInfoSection = document.getElementById("room-info-section");
    if (roomInfoSection) {
      roomInfoSection.style.display = "block";
    }
  }

  // ================================================
  // STATE MANAGEMENT - Globale Variablen
  // ================================================

  // Device ID in HTML setzen (falls Element existiert)
  const deviceIdElement = document.getElementById("device-id");
  const deviceId = window.deviceId || Math.random().toString(36).substr(2, 6);
  window.deviceId = deviceId;
  console.log("🆔 deviceId:", deviceId);
  if (deviceIdElement) {
    deviceIdElement.textContent = deviceId;
  }

  let inRoom = false; // Bin ich in einem Multi-Device Room?
  let hasCamera = false; // Habe ich die Kamera-Kontrolle?
  let roomDeviceCount = 1; // Anzahl Geräte im Room
  let callActiveWithExternal = false; // Läuft ein externer Call?
  let amCurrentCameraMaster = false; // Bin ich der Camera-Master?

  // ================================================
  // MESSAGE DEDUPLICATION - Anti-Spam
  // ================================================

  const messageCache = new Map();
  const CACHE_LIFETIME = 2000; // 2 Sekunden

  function isDuplicateMessage(msg) {
    const key = `${msg.type}_${msg.deviceId || msg.targetDevice}_${Date.now().toString().slice(-3)}`;
    const now = Date.now();

    // Cleanup old entries
    for (let [cacheKey, timestamp] of messageCache.entries()) {
      if (now - timestamp > CACHE_LIFETIME) {
        messageCache.delete(cacheKey);
      }
    }

    // Check if duplicate
    if (messageCache.has(key)) {
      return true;
    }

    messageCache.set(key, now);
    return false;
  }

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
            updateCameraStatus("📹 KAMERA AKTIV", "green");
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
  // EVENT HANDLERS - Button Click Events (nur wenn Elemente existieren)
  // ================================================

  // Multi-Device Room beitreten
  const joinRoomBtn = document.getElementById("join-room");
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener("click", () => {
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

      // UI aktualisieren (nur wenn Elemente existieren)
      joinRoomBtn.disabled = true;
      joinRoomBtn.textContent = "✅ Multi-Device Active";

      const roomControls = document.getElementById("room-controls");
      if (roomControls) {
        roomControls.style.display = "block";
      }

      // State setzen
      inRoom = true;
      isLocalRoom = true;
      console.log("📞 Calling setupRoomHandlers...");
      setupRoomHandlers();
      console.log("✅ setupRoomHandlers completed");
    });
  }

  // Video-Call starten (sowohl original startCall als auch video-call-btn)
  const videoCallBtn = document.getElementById("video-call-btn");
  if (videoCallBtn) {
    videoCallBtn.addEventListener("click", () => {
      startVideoCallLogic();
    });
  }

  // Kamera-Kontrolle übernehmen
  const takeCameraBtn = document.getElementById("take-camera");
  if (takeCameraBtn) {
    takeCameraBtn.addEventListener("click", () => {
      if (!inRoom) return;
      console.log("🔄 Kamera-Übernahme angefordert");
      socket.send(
        JSON.stringify({
          type: "camera-request",
          roomId: roomId,
          deviceId: deviceId,
          fromDeviceId: deviceId, // FIXED: Add fromDeviceId
        })
      );
    });
  }

  // ================================================
  // VIDEO CALL LOGIC - Zentrale Call-Logik
  // ================================================

  function startVideoCallLogic() {
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
          "Du brauchst die Kamera für einen Call! Klicke 'Take Camera Control'"
        );
      }
    } else {
      // Solo-Gerät oder kein Room: Normaler Call
      console.log("✅ Solo/Normal Call");
      if (window.startCall) window.startCall();
    }
  }

  // ================================================
  // ROOM MESSAGE HANDLING - WebSocket Message Router
  // ================================================

  // Room Message Handler Setup
  function setupRoomHandlers() {
    console.log("🔧 setupRoomHandlers() gestartet");

    // Original WebSocket Handler speichern
    const originalOnMessage = socket.onmessage;
    console.log("Original onmessage gefunden:", typeof originalOnMessage);

    // Neuer Message Handler mit Room-Logic
    socket.onmessage = async (event) => {
      // Blob zu Text konvertieren falls nötig
      let data = event.data;
      if (data instanceof Blob) data = await data.text();

      try {
        const msg = JSON.parse(data);

        // NEW: Skip duplicate messages
        if (msg.type === "camera-request" && isDuplicateMessage(msg)) {
          return; // Silent skip
        }

        // Nur wichtige Messages loggen
        if (msg.type === "camera-request") {
          console.log(
            `📨 camera-request: target=${msg.deviceId}, from=${msg.fromDeviceId}`
          );
        }

        // ================================================
        // ROOM MESSAGE PROCESSING
        // ================================================

        // Room-spezifische Messages verarbeiten
        if (msg.roomId === roomId && inRoom && isLocalRoom) {
          switch (msg.type) {
            case "camera-request":
              handleCameraSwitch(msg);
              return;

            case "call-status-sync":
              console.log("📞 Call status sync");
              return;

            case "room-update":
              console.log(`Room: ${msg.devices?.length || 0} Geräte verbunden`);
              roomDeviceCount = msg.devices?.length || 1;
              return;

            case "room-call-start":
              console.log(
                "📞 Room Call Start empfangen von:",
                msg.fromDeviceId
              );
              handleRoomCallStart(msg);
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

          // 🚫 FIX 1: Blockiere nur Anrufe zwischen Room-Geräten, nicht externe Anrufe
          // Externe Anrufe (von außerhalb des Rooms) sollen weiterhin funktionieren
          // Nur Gerät mit Kamera darf externe Anrufe führen
          if (
            roomDeviceCount > 1 &&
            (msg.roomId === "no-room" || !msg.roomId)
          ) {
            if (!hasCamera) {
              console.log(
                "🚫 Blockiere externen Anruf - kein Kamera-Master in Multi-Device Room"
              );
              return;
            } else {
              console.log("✅ Externer Anruf erlaubt - hat Kamera-Kontrolle");
            }
          }

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
            updateCameraStatus("📹 KAMERA AUTO-AKTIV", "orange");
            if (window.localVideo)
              window.localVideo.style.border = "4px solid #ff9800";

            // Andere Geräte über Kamera-Übernahme informieren
            socket.send(
              JSON.stringify({
                type: "camera-request",
                roomId: roomId,
                deviceId: deviceId,
                fromDeviceId: deviceId,
              })
            );
          }

          // WebRTC Message Routing: Verarbeite wenn Kamera ODER noch kein Call aktiv
          const shouldProcessWebRTC =
            hasCamera || !callActiveWithExternal || roomDeviceCount === 1;

          if (shouldProcessWebRTC) {
            console.log("✅ WebRTC Message wird verarbeitet:", msg.type);
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
        if (originalOnMessage) originalOnMessage.call(socket, event);
      } catch (e) {
        // Parse-Fehler: Message direkt weiterleiten
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
  // ROOM CALL COORDINATION - Synchronisiere Calls zwischen Geräten
  // ================================================

  // Handle room call start from master device
  function handleRoomCallStart(msg) {
    if (!hasCamera && msg.fromDeviceId !== deviceId) {
      console.log("📞 Starte Call automatisch (von Kamera-Master)");
      callActiveWithExternal = true;
      updateCallStatus("📞 Call gestartet von Master-Gerät");

      // UI buttons aktivieren
      const toggleCameraBtn = document.getElementById("toggleCameraBtn");
      const toggleMicBtn = document.getElementById("toggleMicBtn");
      const endCallBtn = document.getElementById("endCallBtn");

      if (toggleCameraBtn) toggleCameraBtn.disabled = false;
      if (toggleMicBtn) toggleMicBtn.disabled = false;
      if (endCallBtn) endCallBtn.disabled = false;
    }
  }

  // Send room call notification to other devices
  function notifyRoomCallStart() {
    if (inRoom && hasCamera && roomDeviceCount > 1) {
      console.log("📢 Benachrichtige andere Room-Geräte über Call-Start");
      socket.send(
        JSON.stringify({
          type: "room-call-start",
          roomId: roomId,
          fromDeviceId: deviceId,
        })
      );
    }
  }

  // Kamera-Wechsel zwischen Geräten verarbeiten - IMPROVED
  function handleCameraSwitch(msg) {
    const wasMyCamera = hasCamera;
    const targetDeviceId = msg.deviceId;
    const myDeviceId = deviceId; // My local device ID

    console.log(
      `📹 Camera switch request: target=${targetDeviceId}, my=${myDeviceId}`
    );

    if (targetDeviceId === myDeviceId) {
      // ICH bekomme die Kamera-Kontrolle
      hasCamera = true;
      amCurrentCameraMaster = callActiveWithExternal;

      // Video Tracks aktivieren
      if (window.localStream) {
        window.localStream.getVideoTracks().forEach((t) => (t.enabled = true));
      }

      updateCameraStatus("📹 KAMERA AKTIV", "green");
      if (window.localVideo)
        window.localVideo.style.border = "4px solid #4caf50";

      // Button Status aktualisieren
      const takeCameraBtn = document.getElementById("take-camera");
      if (takeCameraBtn) {
        takeCameraBtn.textContent = "📹 KAMERA AKTIV";
        takeCameraBtn.style.backgroundColor = "#4CAF50";
        takeCameraBtn.disabled = true;
      }

      console.log(
        "✅ Kamera übernommen - hasCamera:",
        hasCamera,
        "callActive:",
        callActiveWithExternal
      );

      // Update Auto-Switch current device
      if (window.autoCameraSwitching) {
        window.autoCameraSwitching.currentControllingDevice = myDeviceId;
      }

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

      updateCameraStatus(`⏸️ ${targetDeviceId} has camera`, "gray");
      if (window.localVideo) window.localVideo.style.border = "2px solid #ccc";

      // Button Status aktualisieren
      const takeCameraBtn = document.getElementById("take-camera");
      if (takeCameraBtn) {
        takeCameraBtn.textContent = "📹 Take Camera Control";
        takeCameraBtn.style.backgroundColor = "#2196F3";
        takeCameraBtn.disabled = false;
      }

      console.log("⏸️ Kamera abgegeben an:", targetDeviceId);

      // Update Auto-Switch current device
      if (window.autoCameraSwitching) {
        window.autoCameraSwitching.currentControllingDevice = targetDeviceId;
      }

      // Wenn ich hatte Call-Master Role → Übergebe an anderes Gerät
      if (callActiveWithExternal && wasMyCamera) {
        console.log("🔄 Übergebe aktiven Call an anderes Gerät");
        handoverCallToDevice(targetDeviceId);
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
  // UI UPDATES - Status und Feedback (nur wenn Elemente existieren)
  // ================================================

  // Camera Status UI aktualisieren
  function updateCameraStatus(text, color) {
    const statusEl = document.getElementById("camera-status");
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color;
    }
  }

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

  // ================================================
  // GLOBAL EXPORTS - Für externe Nutzung
  // ================================================

  // Stelle wichtige Funktionen global zur Verfügung
  window.multiDeviceRoom = {
    startVideoCall: startVideoCallLogic,
    deviceId: deviceId,
    roomId: roomId,
    isInRoom: () => inRoom,
    hasCamera: () => hasCamera,
    callActive: () => callActiveWithExternal,
  };
});
