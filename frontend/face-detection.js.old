// face-detection.js - Step 2.2: Face Detection Implementation
// ================================================================
// Funktionen: MediaPipe Face Detection für alle Room Video Streams
// Integration: Erweitert bestehende Architektur OHNE Änderungen
// Status: PERFORMANCE OPTIMIERT - Reduzierte CPU & Logs
// ================================================================

window.addEventListener("load", () => {
  console.log("🎭 Face Detection Module wird geladen...");

  // ================================================================
  // MEDIAPIPE FACE DETECTION SETUP
  // ================================================================

  let faceDetection = null;
  let isInitialized = false;
  let isProcessing = false;

  // Face Detection Konfiguration
  const FACE_DETECTION_CONFIG = {
    model: "short", // short-range model für bessere Performance
    minDetectionConfidence: 0.5,
    minSuppressionThreshold: 0.3,
  };

  // Performance Settings - OPTIMIERT
  const PERFORMANCE_SETTINGS = {
    detectionInterval: 400, // war 200ms - 50% weniger CPU Load
    maxConcurrentDetections: 2, // war 3 - weniger Memory Usage
    canvasWidth: 240, // war 320 - 25% weniger Processing
    canvasHeight: 180, // war 240 - 25% weniger Processing
  };

  // Logging Settings - MASSIV REDUZIERT
  const LOGGING_CONFIG = {
    debugMode: false,
    logOnlyChanges: true,
    maxLogFrequency: 5000, // war 2000ms - 60% weniger Logs
    verboseProcessing: false,
  };

  // ================================================================
  // STATE MANAGEMENT - Face Detection
  // ================================================================

  let faceDetectionStates = new Map();
  let detectionCanvases = new Map();
  let detectionContexts = new Map();
  let canvasToDeviceMap = new Map();
  let activeDetections = 0;
  let processingQueue = new Map();
  let lastLoggedStates = new Map(); // Anti-Spam Cache

  // ================================================================
  // MEDIAPIPE INITIALIZATION
  // ================================================================

  // MediaPipe Face Detection initialisieren
  async function initializeFaceDetection() {
    try {
      console.log("🔧 Initialisiere MediaPipe Face Detection...");

      // MediaPipe laden (CDN)
      if (!window.FaceDetection) {
        await loadMediaPipeScript();
      }

      // Face Detection Instanz erstellen
      faceDetection = new FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        },
      });

      // Konfiguration setzen
      faceDetection.setOptions(FACE_DETECTION_CONFIG);

      // Results Handler
      faceDetection.onResults(onFaceDetectionResults);

      console.log("✅ MediaPipe Face Detection initialisiert");
      isInitialized = true;

      // Integration mit bestehendem System starten
      setTimeout(integrateWithRoomSystem, 1000);
    } catch (error) {
      console.error("❌ Face Detection Initialisierung fehlgeschlagen:", error);
      isInitialized = false;
    }
  }

  // MediaPipe Script dynamisch laden
  async function loadMediaPipeScript() {
    return new Promise((resolve, reject) => {
      console.log("📥 Lade MediaPipe Face Detection Script...");

      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js";
      script.onload = () => {
        console.log("✅ MediaPipe Script geladen");
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ================================================================
  // INTEGRATION MIT BESTEHENDEM ROOM SYSTEM
  // ================================================================

  // Integration mit bestehendem roomVideoManager
  function integrateWithRoomSystem() {
    console.log("🔗 Integriere Face Detection mit Room System...");

    // Warte auf roomVideoManager
    if (!window.roomVideoManager) {
      console.log("⏳ Warte auf roomVideoManager...");
      setTimeout(integrateWithRoomSystem, 1000);
      return;
    }

    // Überwache neue Room Videos
    startRoomVideoMonitoring();

    // Erweitere roomVideoManager um Face Detection
    enhanceRoomVideoManager();

    console.log("✅ Face Detection Integration abgeschlossen");
  }

  // Überwache Room Video Grid für neue Videos
  function startRoomVideoMonitoring() {
    const roomVideoGrid = document.getElementById("room-video-grid");
    if (!roomVideoGrid) {
      console.log("❌ Room Video Grid nicht gefunden");
      return;
    }

    console.log("👀 Starte Room Video Monitoring...");

    // MutationObserver für neue Video-Elemente
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Prüfe auf neue room-video-item
            if (node.classList?.contains("room-video-item")) {
              const videoElement = node.querySelector(".room-video");
              if (videoElement) {
                console.log("🎥 Neues Room Video erkannt:", videoElement.id);
                setTimeout(
                  () => setupFaceDetectionForVideo(videoElement),
                  1000
                );
              }
            }
          }
        });
      });
    });

    observer.observe(roomVideoGrid, { childList: true, subtree: true });

    // Bereits vorhandene Videos verarbeiten
    const existingVideos = roomVideoGrid.querySelectorAll(".room-video");
    existingVideos.forEach((video) => {
      if (video.srcObject) {
        console.log("🎥 Bestehendes Room Video gefunden:", video.id);
        setTimeout(() => setupFaceDetectionForVideo(video), 500);
      }
    });
  }

  // ================================================================
  // FACE DETECTION FÜR EINZELNE VIDEOS
  // ================================================================

  // Face Detection für ein Video-Element einrichten
  async function setupFaceDetectionForVideo(videoElement) {
    if (!isInitialized || !videoElement || !videoElement.srcObject) {
      return;
    }

    const deviceId = extractDeviceIdFromVideo(videoElement);
    if (!deviceId) {
      return;
    }

    console.log("🎭 Setup Face Detection für:", deviceId);

    // Canvas für Face Detection erstellen
    const canvas = createDetectionCanvas(deviceId);
    if (!canvas) return;

    // Initial state setzen
    faceDetectionStates.set(deviceId, {
      hasFace: false,
      confidence: 0,
      lastUpdate: Date.now(),
      videoElement: videoElement,
    });

    // Face Detection Loop starten
    startFaceDetectionLoop(deviceId);
  }

  // Device ID aus Video Element extrahieren
  function extractDeviceIdFromVideo(videoElement) {
    // Priority 1: Explicit dataset deviceId
    if (videoElement.dataset.deviceId) {
      return videoElement.dataset.deviceId;
    }

    // Priority 2: room-video-stream-{deviceId}
    const match = videoElement.id.match(/room-video-stream-(.+)/);
    if (match) {
      return match[1];
    }

    // Priority 3: localRoomVideo - but get REAL device ID, not "local"
    if (videoElement.id === "localRoomVideo") {
      // Get actual device ID from multiDeviceRoom
      const actualDeviceId = window.multiDeviceRoom?.deviceId;
      if (actualDeviceId) {
        // Set it on the element for future use
        videoElement.dataset.deviceId = actualDeviceId;
        return actualDeviceId;
      }
      return "local"; // fallback
    }

    return null;
  }

  // Canvas für Face Detection erstellen
  function createDetectionCanvas(deviceId) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = PERFORMANCE_SETTINGS.canvasWidth;
      canvas.height = PERFORMANCE_SETTINGS.canvasHeight;
      canvas.style.display = "none";
      canvas.id = `face-detection-canvas-${deviceId}`;

      // WICHTIG: Device-ID für MediaPipe-Mapping speichern
      canvas.dataset.deviceId = deviceId;
      canvas._faceDetectionDeviceId = deviceId;

      // An body anhängen für Debugging
      document.body.appendChild(canvas);

      const context = canvas.getContext("2d");

      detectionCanvases.set(deviceId, canvas);
      detectionContexts.set(deviceId, context);
      canvasToDeviceMap.set(canvas.id, deviceId);

      console.log("🖼️ Detection Canvas erstellt für:", deviceId);
      return canvas;
    } catch (error) {
      console.error("❌ Canvas Creation Fehler:", error);
      return null;
    }
  }

  // ================================================================
  // FACE DETECTION PROCESSING LOOP - PERFORMANCE OPTIMIERT
  // ================================================================

  // Face Detection Loop für ein Device starten - OPTIMIERT
  function startFaceDetectionLoop(deviceId) {
    const processFrame = async () => {
      try {
        // Performance Check: Nicht zu viele gleichzeitige Detections + Browser Tab Check
        if (
          activeDetections >= PERFORMANCE_SETTINGS.maxConcurrentDetections ||
          document.hidden
        ) {
          // Browser tab nicht aktiv
          setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval * 3);
          return;
        }

        // Weniger häufige State Checks - nur jeder 5. Frame
        if (processFrame._checkCount % 5 === 0) {
          const state = faceDetectionStates.get(deviceId);
          const canvas = detectionCanvases.get(deviceId);
          const context = detectionContexts.get(deviceId);

          if (!state || !canvas || !context || !state.videoElement) {
            return; // Stop ohne Log
          }

          // Video bereit prüfen
          const video = state.videoElement;
          if (
            video.readyState !== video.HAVE_ENOUGH_DATA ||
            video.videoWidth === 0
          ) {
            setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval);
            return;
          }
        }
        processFrame._checkCount = (processFrame._checkCount || 0) + 1;

        // Hole State für aktuellen Frame
        const state = faceDetectionStates.get(deviceId);
        const canvas = detectionCanvases.get(deviceId);
        const context = detectionContexts.get(deviceId);
        const video = state.videoElement;

        // Frame auf Canvas zeichnen
        context.drawImage(
          video,
          0,
          0,
          PERFORMANCE_SETTINGS.canvasWidth,
          PERFORMANCE_SETTINGS.canvasHeight
        );

        // Face Detection ausführen mit Device-ID Tracking
        activeDetections++;
        processingQueue.set(deviceId, Date.now());

        await faceDetection.send({
          image: canvas,
          _deviceId: deviceId,
          timestamp: Date.now(),
        });

        // Nächsten Frame planen
        setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval);
      } catch (error) {
        activeDetections = Math.max(0, activeDetections - 1);
        setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval * 4);
      }
    };

    // Längerer initial delay für bessere Verteilung
    setTimeout(processFrame, Math.random() * 2000);
  }

  // ================================================================
  // FACE DETECTION RESULTS HANDLING - OPTIMIERT
  // ================================================================

  // MediaPipe Results Handler
  function onFaceDetectionResults(results) {
    activeDetections = Math.max(0, activeDetections - 1);

    try {
      // Device ID aus Canvas finden
      const canvas = results.image;
      const deviceId = findDeviceIdFromCanvas(canvas);

      if (!deviceId) {
        return; // Silent fail
      }

      // Face Detection Results verarbeiten
      processFaceDetectionResults(deviceId, results);
    } catch (error) {
      // Silent error handling
    }
  }

  // Device ID aus Canvas finden - OPTIMIERT
  function findDeviceIdFromCanvas(canvas) {
    // Methode 1: Direkte Canvas-Eigenschaften prüfen
    if (canvas?._faceDetectionDeviceId) {
      return canvas._faceDetectionDeviceId;
    }

    // Methode 2: Dataset prüfen
    if (canvas?.dataset?.deviceId) {
      return canvas.dataset.deviceId;
    }

    // Methode 3: Canvas-ID Mapping
    if (canvas?.id) {
      const deviceId = canvasToDeviceMap.get(canvas.id);
      if (deviceId) return deviceId;
    }

    // Methode 4: Processing Queue basiert (für aktuelle Verarbeitung)
    const recentProcessing = Array.from(processingQueue.entries())
      .filter(([_, timestamp]) => Date.now() - timestamp < 1000)
      .sort((a, b) => b[1] - a[1]);

    if (recentProcessing.length > 0) {
      const deviceId = recentProcessing[0][0];
      // Nur bei erstem Fallback loggen, nicht bei jedem
      const lastFallbackLog = lastLoggedStates.get(`fallback-${deviceId}`);
      if (!lastFallbackLog || Date.now() - lastFallbackLog > 10000) {
        console.log("🔄 Fallback: Device ID via Processing Queue:", deviceId);
        lastLoggedStates.set(`fallback-${deviceId}`, Date.now());
      }
      return deviceId;
    }

    return null;
  }

  // Face Detection Results für Device verarbeiten - PERFORMANCE OPTIMIERT
  function processFaceDetectionResults(deviceId, results) {
    const state = faceDetectionStates.get(deviceId);
    if (!state) return; // Early exit ohne Log

    // Processing Queue aufräumen
    processingQueue.delete(deviceId);

    const currentTime = Date.now();
    let hasFace = false;
    let maxConfidence = 0;

    // Optimierte Face Detection ohne verbose Logging
    if (results?.detections?.length > 0) {
      hasFace = true;
      const detection = results.detections[0];

      // Vereinfachte Confidence Extraktion - schneller
      maxConfidence =
        detection.score?.[0] || detection.score || detection.confidence || 0.8;

      // Falls Array, nehme ersten Wert
      if (Array.isArray(maxConfidence)) {
        maxConfidence = maxConfidence[0] || 0.8;
      }
    }

    // State Update nur bei signifikanten Änderungen
    const previousHasFace = state.hasFace;
    const significantChange =
      hasFace !== previousHasFace ||
      Math.abs(maxConfidence - state.confidence) > 0.15; // Größerer Threshold

    if (significantChange) {
      state.hasFace = hasFace;
      state.confidence = maxConfidence;
      state.lastUpdate = currentTime;

      // Massiv reduziertes Logging - nur alle 3 Sekunden pro Device
      const lastLog = lastLoggedStates.get(`update-${deviceId}`) || 0;
      if (currentTime - lastLog > 3000) {
        console.log(
          `🎭 ${deviceId}: ${hasFace ? "FACE" : "NO FACE"} (${(maxConfidence * 100).toFixed(0)}%)`
        );
        lastLoggedStates.set(`update-${deviceId}`, currentTime);
      }

      // UI Update
      updateFaceDetectionUI(deviceId, hasFace, maxConfidence);

      // Event System benachrichtigen
      notifyFaceDetectionChange(deviceId, hasFace, maxConfidence);
    }
  }

  // ================================================================
  // UI INTEGRATION - Erweitert bestehendes System
  // ================================================================

  // Face Detection UI Updates
  function updateFaceDetectionUI(deviceId, hasFace, confidence) {
    // Bestehenden roomVideoManager erweitern
    if (window.roomVideoManager) {
      const status = hasFace ? "face-detected" : "connected";
      const statusText = hasFace
        ? `Face Detected (${(confidence * 100).toFixed(0)}%)`
        : "Connected";

      window.roomVideoManager.updateDeviceStatus(deviceId, status, statusText);
    }

    // Room Status Panel aktualisieren
    updateRoomStatusPanel();
  }

  // Room Status Panel für Face Detection aktualisieren
  function updateRoomStatusPanel() {
    const faceDetectionStatusEl = document.getElementById(
      "face-detection-status"
    );
    if (faceDetectionStatusEl) {
      const devicesWithFaces = Array.from(faceDetectionStates.values()).filter(
        (state) => state.hasFace
      ).length;

      const totalDevices = faceDetectionStates.size;

      faceDetectionStatusEl.textContent = `${devicesWithFaces}/${totalDevices} faces detected`;
    }
  }

  // ================================================================
  // EVENT SYSTEM - Integration mit WebSocket - OPTIMIERT
  // ================================================================

  // Face Detection Änderungen an andere Devices senden - THROTTLED
  function notifyFaceDetectionChange(deviceId, hasFace, confidence) {
    // Throttle WebSocket Messages - nur alle 1 Sekunde pro Device
    const now = Date.now();
    const lastNotify = notifyFaceDetectionChange._lastNotify || {};
    if (lastNotify[deviceId] && now - lastNotify[deviceId] < 1000) {
      return; // Skip this notification
    }
    notifyFaceDetectionChange._lastNotify = lastNotify;
    lastNotify[deviceId] = now;

    if (window.roomVideoSocket?.readyState === WebSocket.OPEN) {
      const message = {
        type: "face-detection-update",
        roomId: window.multiDeviceRoom?.roomId,
        fromDeviceId: window.multiDeviceRoom?.deviceId,
        targetDeviceId: deviceId,
        hasFace: hasFace,
        confidence: confidence,
        timestamp: now,
      };

      window.roomVideoSocket.send(JSON.stringify(message));

      // Reduziertes Logging
      const lastEventLog = lastLoggedStates.get(`event-${deviceId}`) || 0;
      if (now - lastEventLog > 5000) {
        console.log("📤 Face Detection Event gesendet:", message.type);
        lastLoggedStates.set(`event-${deviceId}`, now);
      }
    }
  }

  // ================================================================
  // ROOMVIDEOMANAGER ERWEITERUNG
  // ================================================================

  // Erweitere roomVideoManager um Face Detection Funktionen
  function enhanceRoomVideoManager() {
    if (!window.roomVideoManager) return;

    // Original addRoomDevice erweitern
    const originalAddRoomDevice = window.roomVideoManager.addRoomDevice;
    window.roomVideoManager.addRoomDevice = function (
      deviceId,
      videoStream,
      deviceName
    ) {
      // Original Funktion aufrufen
      const result = originalAddRoomDevice.call(
        this,
        deviceId,
        videoStream,
        deviceName
      );

      // Face Detection für neues Device einrichten
      setTimeout(() => {
        const videoElement = document.getElementById(
          `room-video-stream-${deviceId}`
        );
        if (videoElement) {
          setupFaceDetectionForVideo(videoElement);
        }
      }, 1000);

      return result;
    };

    // Face Detection spezifische Funktionen hinzufügen
    window.roomVideoManager.getFaceDetectionStates = function () {
      return Array.from(faceDetectionStates.entries()).map(
        ([deviceId, state]) => ({
          deviceId,
          hasFace: state.hasFace,
          confidence: state.confidence,
          lastUpdate: state.lastUpdate,
        })
      );
    };

    window.roomVideoManager.getDevicesWithFaces = function () {
      return Array.from(faceDetectionStates.entries())
        .filter(([deviceId, state]) => state.hasFace)
        .map(([deviceId, state]) => ({
          deviceId,
          confidence: state.confidence,
        }));
    };

    console.log("✅ roomVideoManager um Face Detection erweitert");
  }

  // ================================================================
  // GLOBAL API - Face Detection Control
  // ================================================================

  // Global verfügbare Face Detection API
  window.faceDetectionSystem = {
    // Status
    isInitialized: () => isInitialized,
    isProcessing: () => isProcessing,

    // States
    getDetectionStates: () => Array.from(faceDetectionStates.entries()),
    getDevicesWithFaces: () => {
      return Array.from(faceDetectionStates.entries())
        .filter(([_, state]) => state.hasFace)
        .map(([deviceId, state]) => ({
          deviceId,
          confidence: state.confidence,
        }));
    },

    // Control
    startDetection: () => {
      if (!isInitialized) {
        initializeFaceDetection();
      }
    },

    stopDetection: (deviceId = null) => {
      if (deviceId) {
        faceDetectionStates.delete(deviceId);
        detectionCanvases.get(deviceId)?.remove();
        detectionCanvases.delete(deviceId);
        detectionContexts.delete(deviceId);
      } else {
        // Alle stoppen
        faceDetectionStates.clear();
        detectionCanvases.forEach((canvas) => canvas.remove());
        detectionCanvases.clear();
        detectionContexts.clear();
      }
    },

    // Configuration
    updateConfig: (newConfig) => {
      Object.assign(FACE_DETECTION_CONFIG, newConfig);
      if (faceDetection) {
        faceDetection.setOptions(FACE_DETECTION_CONFIG);
      }
    },

    // Debug
    debug: {
      showCanvases: () => {
        detectionCanvases.forEach((canvas) => {
          canvas.style.display = "block";
          canvas.style.position = "fixed";
          canvas.style.top = "10px";
          canvas.style.zIndex = "9999";
          canvas.style.border = "2px solid red";
        });
      },
      hideCanvases: () => {
        detectionCanvases.forEach((canvas) => {
          canvas.style.display = "none";
        });
      },
      logStates: () => {
        console.log("🎭 Face Detection States:");
        faceDetectionStates.forEach((state, deviceId) => {
          console.log(`  ${deviceId}:`, state);
        });
      },
      // Performance Debug
      getPerformanceStats: () => {
        return {
          activeDetections,
          totalDevices: faceDetectionStates.size,
          canvasSize: `${PERFORMANCE_SETTINGS.canvasWidth}x${PERFORMANCE_SETTINGS.canvasHeight}`,
          detectionInterval: `${PERFORMANCE_SETTINGS.detectionInterval}ms`,
          logCacheSize: lastLoggedStates.size,
        };
      },
      clearLogCache: () => {
        lastLoggedStates.clear();
        console.log("🧹 Log Cache geleert");
      },
    },
  };

  // ================================================================
  // INITIALIZATION
  // ================================================================

  // Face Detection System starten
  console.log("🚀 Starte Face Detection System...");
  setTimeout(initializeFaceDetection, 2000);

  console.log("✅ Face Detection Module geladen (Performance Optimiert)");
});
