// face-detection.js - Step 2.2: Face Detection Implementation
// ================================================================
// Funktionen: MediaPipe Face Detection für alle Room Video Streams
// Integration: Erweitert bestehende Architektur OHNE Änderungen
// Status: NEU - Phase 2.2 Implementation

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

  // Performance Settings
  const PERFORMANCE_SETTINGS = {
    detectionInterval: 200, // ms zwischen face detection runs
    maxConcurrentDetections: 3, // max gleichzeitige detections
    canvasWidth: 320, // reduzierte Auflösung für performance
    canvasHeight: 240,
  };

  // ================================================================
  // STATE MANAGEMENT - Face Detection
  // ================================================================

  let faceDetectionStates = new Map(); // deviceId -> { hasface, confidence, lastUpdate }
  let detectionCanvases = new Map(); // deviceId -> canvas element
  let detectionContexts = new Map(); // deviceId -> canvas context
  let activeDetections = 0; // counter für concurrent detections

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
      // Fallback: Deaktiviere face detection
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
      console.log("⏸️ Face Detection Setup übersprungen:", {
        initialized: isInitialized,
        hasElement: !!videoElement,
        hasStream: !!videoElement?.srcObject,
      });
      return;
    }

    const deviceId = extractDeviceIdFromVideo(videoElement);
    if (!deviceId) {
      console.log("❌ Device ID nicht extrahierbar von:", videoElement.id);
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
    // room-video-stream-{deviceId} oder localRoomVideo
    if (videoElement.id === "localRoomVideo") {
      return "local";
    }

    const match = videoElement.id.match(/room-video-stream-(.+)/);
    return match ? match[1] : null;
  }

  // Canvas für Face Detection erstellen
  function createDetectionCanvas(deviceId) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = PERFORMANCE_SETTINGS.canvasWidth;
      canvas.height = PERFORMANCE_SETTINGS.canvasHeight;
      canvas.style.display = "none"; // unsichtbar
      canvas.id = `face-detection-canvas-${deviceId}`;

      // An body anhängen für Debugging
      document.body.appendChild(canvas);

      const context = canvas.getContext("2d");

      detectionCanvases.set(deviceId, canvas);
      detectionContexts.set(deviceId, context);

      console.log("🖼️ Detection Canvas erstellt für:", deviceId);
      return canvas;
    } catch (error) {
      console.error("❌ Canvas Creation Fehler:", error);
      return null;
    }
  }

  // ================================================================
  // FACE DETECTION PROCESSING LOOP
  // ================================================================

  // Face Detection Loop für ein Device starten
  function startFaceDetectionLoop(deviceId) {
    const processFrame = async () => {
      try {
        // Performance Check: Nicht zu viele gleichzeitige Detections
        if (activeDetections >= PERFORMANCE_SETTINGS.maxConcurrentDetections) {
          setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval * 2);
          return;
        }

        // State und Elemente prüfen
        const state = faceDetectionStates.get(deviceId);
        const canvas = detectionCanvases.get(deviceId);
        const context = detectionContexts.get(deviceId);

        if (!state || !canvas || !context || !state.videoElement) {
          console.log("⏸️ Face Detection gestoppt für:", deviceId);
          return;
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

        // Frame auf Canvas zeichnen
        context.drawImage(
          video,
          0,
          0,
          PERFORMANCE_SETTINGS.canvasWidth,
          PERFORMANCE_SETTINGS.canvasHeight
        );

        // Face Detection ausführen
        activeDetections++;
        await faceDetection.send({ image: canvas });

        // Nächsten Frame planen
        setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval);
      } catch (error) {
        console.error("❌ Face Detection Frame Error:", deviceId, error);
        activeDetections = Math.max(0, activeDetections - 1);
        setTimeout(processFrame, PERFORMANCE_SETTINGS.detectionInterval * 2);
      }
    };

    // Initial delay
    setTimeout(processFrame, Math.random() * 1000);
  }

  // ================================================================
  // FACE DETECTION RESULTS HANDLING
  // ================================================================

  // MediaPipe Results Handler
  function onFaceDetectionResults(results) {
    activeDetections = Math.max(0, activeDetections - 1);

    try {
      // Device ID aus Canvas finden
      const canvas = results.image;
      const deviceId = findDeviceIdFromCanvas(canvas);

      if (!deviceId) {
        console.log("⚠️ Device ID nicht gefunden für Results");
        return;
      }

      // Face Detection Results verarbeiten
      processFaceDetectionResults(deviceId, results);
    } catch (error) {
      console.error("❌ Results Processing Error:", error);
    }
  }

  // Device ID aus Canvas finden
  function findDeviceIdFromCanvas(canvas) {
    for (let [deviceId, detectionCanvas] of detectionCanvases) {
      if (detectionCanvas === canvas) {
        return deviceId;
      }
    }
    return null;
  }

  // Face Detection Results für Device verarbeiten
  function processFaceDetectionResults(deviceId, results) {
    const state = faceDetectionStates.get(deviceId);
    if (!state) return;

    const currentTime = Date.now();
    let hasFace = false;
    let maxConfidence = 0;

    // Faces analysieren
    if (results.detections && results.detections.length > 0) {
      hasFace = true;

      // Höchste Confidence finden
      results.detections.forEach((detection) => {
        const confidence = detection.score[0];
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
        }
      });
    }

    // State Update nur bei Änderung
    const previousHasFace = state.hasFace;
    const significantChange =
      hasFace !== previousHasFace ||
      Math.abs(maxConfidence - state.confidence) > 0.1;

    if (significantChange) {
      // State aktualisieren
      state.hasFace = hasFace;
      state.confidence = maxConfidence;
      state.lastUpdate = currentTime;

      console.log(`🎭 Face Detection Update - ${deviceId}:`, {
        hasFace,
        confidence: maxConfidence.toFixed(2),
        faces: results.detections?.length || 0,
      });

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
  // EVENT SYSTEM - Integration mit WebSocket
  // ================================================================

  // Face Detection Änderungen an andere Devices senden
  function notifyFaceDetectionChange(deviceId, hasFace, confidence) {
    if (window.roomVideoSocket?.readyState === WebSocket.OPEN) {
      const message = {
        type: "face-detection-update",
        roomId: window.multiDeviceRoom?.roomId,
        fromDeviceId: window.multiDeviceRoom?.deviceId,
        targetDeviceId: deviceId,
        hasFace: hasFace,
        confidence: confidence,
        timestamp: Date.now(),
      };

      window.roomVideoSocket.send(JSON.stringify(message));
      console.log("📤 Face Detection Event gesendet:", message.type);
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
    },
  };

  // ================================================================
  // INITIALIZATION
  // ================================================================

  // Face Detection System starten
  console.log("🚀 Starte Face Detection System...");
  setTimeout(initializeFaceDetection, 2000);

  console.log("✅ Face Detection Module geladen");
});
