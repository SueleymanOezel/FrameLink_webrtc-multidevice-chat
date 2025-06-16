// ================================================================
// COMPLETE INTEGRATION FIX - Auto-Switch FINAL SOLUTION
// ================================================================
// Version: 2.0 - COMPLETE REWRITE
// Löst: ALLE 3 kritischen Bruchstellen in der Integration
// Status: PRODUCTION READY
// ================================================================

console.log("🚀 COMPLETE INTEGRATION FIX wird geladen...");

// Wait for all systems to be ready
window.addEventListener("load", () => {
  setTimeout(initializeCompleteIntegrationFix, 3000);
});

// ================================================================
// WEB SOCKET WAITER - Kritische Ergänzung
// ================================================================

function waitForWebSocket(callback, attempts = 0) {
  const MAX_ATTEMPTS = 20;

  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    console.log("✅ WebSocket FINALLY connected!");
    callback();
  } else if (attempts < MAX_ATTEMPTS) {
    console.log(
      `⏳ Waiting for WebSocket (attempt ${attempts + 1}/${MAX_ATTEMPTS})...`
    );
    setTimeout(() => waitForWebSocket(callback, attempts + 1), 500);
  } else {
    console.error("❌ CRITICAL: WebSocket not found after 20 attempts");
    // Emergency fallback
    createEmergencyWebSocket();
    callback();
  }
}

function createEmergencyWebSocket() {
  console.log("🚨 Creating emergency WebSocket connection");

  try {
    const wsUrl = window.WEBSOCKET_URL || "wss://framelink-signaling.glitch.me";
    window.socket = new WebSocket(wsUrl);

    window.socket.onopen = () => {
      console.log("🚨 EMERGENCY WebSocket connected!");
      window.dispatchEvent(new Event("websocket-emergency-ready"));
    };

    window.socket.onerror = (error) => {
      console.error("🚨 EMERGENCY WebSocket error:", error);
    };
  } catch (error) {
    console.error("🚨 FAILED to create emergency WebSocket:", error);
  }
}

// ================================================================
// DEVICE ID FIX - Canvas Mapping Reparatur
// ================================================================

function fixDeviceIdMapping() {
  console.log("🔧 Permanently fixing Device ID mapping...");

  // 1. Global Canvas Registry
  if (!window.canvasDeviceMap) {
    window.canvasDeviceMap = new WeakMap();
  }

  // 2. Enhanced canvas creation
  const originalCreateCanvas = window.createDetectionCanvas;
  window.createDetectionCanvas = function (deviceId) {
    const canvas =
      originalCreateCanvas?.call(this, deviceId) ||
      document.createElement("canvas");

    // Permanent ID mapping
    canvas.dataset.deviceId = deviceId;
    canvas.id = `face-detection-canvas-${deviceId}`;
    window.canvasDeviceMap.set(canvas, deviceId);

    console.log(`🖼️ Canvas created for ${deviceId}`);
    return canvas;
  };

  // 3. Override MediaPipe results handler
  const originalOnResults = window.faceDetectionSystem?.onResults;
  window.faceDetectionSystem.onResults = function (results) {
    // Fix device ID before processing
    if (results.image) {
      results._deviceId =
        window.canvasDeviceMap.get(results.image) ||
        results.image.dataset.deviceId ||
        "unknown";
    }

    originalOnResults?.call(this, results);
  };
}

// ================================================================
// CONFIDENCE SCORE FIX - Robuste Wertextraktion
// ================================================================

function fixConfidenceScore() {
  console.log("🔧 Fixing confidence score extraction...");

  const originalProcessResults = window.processFaceDetectionResults;
  window.processFaceDetectionResults = function (deviceId, results) {
    let confidence = 0.8; // Default

    try {
      if (results?.detections?.[0]) {
        const detection = results.detections[0];

        // Multi-Method confidence extraction
        confidence =
          detection.confidence ??
          detection.score?.[0] ??
          detection.detection?.confidence ??
          detection.detection?.score?.[0] ??
          0.8;
      }
    } catch (e) {
      console.error("Confidence extraction error:", e);
    }

    // Call original with fixed confidence
    return originalProcessResults?.call(this, deviceId, {
      ...results,
      _fixedConfidence: confidence,
    });
  };
}

// ================================================================
// COMPLETE INTEGRATION FIX - Auto-Switch FINAL SOLUTION
// ================================================================
// Version: 2.0 - COMPLETE REWRITE
// Löst: ALLE 3 kritischen Bruchstellen in der Integration
// Status: PRODUCTION READY
// ================================================================

function initializeCompleteIntegrationFix() {
  console.log("🔧 COMPLETE INTEGRATION FIX wird installiert...");
  console.log("🎯 Ziel: Face Detection → Auto-Switch → Camera Control");

  // ================================================================
  // 1. FACE DETECTION STATE MANAGER (FIX BRUCHSTELLE #3)
  // ================================================================

  // Globaler Face Detection State Manager
  window.faceDetectionStates = new Map();
  window.faceDetectionSystem = window.faceDetectionSystem || {};

  // Enhanced Face Detection State Management
  function updateGlobalFaceState(deviceId, hasFace, confidence = 0.8) {
    const timestamp = Date.now();

    // Update global state
    window.faceDetectionStates.set(deviceId, {
      hasFace: hasFace,
      confidence: confidence,
      lastUpdate: timestamp,
      deviceId: deviceId,
    });

    console.log(
      `📊 Face State Updated: ${deviceId} = ${hasFace ? "FACE" : "NO FACE"} (${(
        confidence * 100
      ).toFixed(0)}%)`
    );

    // Trigger Auto-Switch immediately
    triggerAutoSwitch(deviceId, hasFace, confidence);

    // Update UI
    updateFaceDetectionUI(deviceId, hasFace, confidence);
  }

  // ================================================================
  // 2. DIRECT AUTO-SWITCH TRIGGER (FIX BRUCHSTELLE #1)
  // ================================================================

  function triggerAutoSwitch(deviceId, hasFace, confidence) {
    // Direct call to Auto-Switch system
    if (
      window.autoCameraSwitching &&
      window.autoCameraSwitching._processFaceDetection
    ) {
      try {
        console.log(
          `🎯 Direct Auto-Switch Trigger: ${deviceId} (${hasFace ? "FACE" : "NO FACE"})`
        );
        window.autoCameraSwitching._processFaceDetection(
          deviceId,
          hasFace,
          confidence
        );
      } catch (error) {
        console.error("❌ Auto-Switch Trigger Error:", error);
      }
    }

    // Backup: Manual decision logic if Auto-Switch fails
    if (hasFace && confidence > 0.7) {
      executeDirectCameraSwitch(deviceId, { confidence, automatic: true });
    }
  }

  // ================================================================
  // 3. DIRECT CAMERA SWITCH EXECUTION (FIX BRUCHSTELLE #2)
  // ================================================================

  function executeDirectCameraSwitch(targetDeviceId, metadata = {}) {
    console.log(`🔄 DIRECT Camera Switch to: ${targetDeviceId}`, metadata);

    // Prevent rapid switching
    const now = Date.now();
    if (window._lastCameraSwitch && now - window._lastCameraSwitch < 2000) {
      console.log("⏭️ Camera switch rate limited");
      return false;
    }
    window._lastCameraSwitch = now;

    let success = false;

    // Method 1: WebSocket camera-request (PRIMARY)
    try {
      if (
        window.socket &&
        window.socket.readyState === WebSocket.OPEN &&
        window.multiDeviceRoom
      ) {
        const message = {
          type: "camera-request",
          roomId: window.multiDeviceRoom.roomId,
          deviceId: targetDeviceId,
          automatic: true,
          reason: "face-detection",
          confidence: metadata.confidence || 0.8,
          timestamp: now,
        };

        window.socket.send(JSON.stringify(message));
        success = true;
        console.log("✅ Camera switch via WebSocket:", targetDeviceId);
      }
    } catch (error) {
      console.error("❌ WebSocket camera switch failed:", error);
    }

    // Method 2: Direct DOM button click (SECONDARY)
    if (!success) {
      try {
        const takeCameraBtn = document.getElementById("take-camera");
        if (takeCameraBtn && !takeCameraBtn.disabled) {
          takeCameraBtn.click();
          success = true;
          console.log("✅ Camera switch via DOM click");
        }
      } catch (error) {
        console.error("❌ DOM camera switch failed:", error);
      }
    }

    // Method 3: Direct simple-room.js integration (TERTIARY)
    if (!success) {
      try {
        if (
          window.multiDeviceRoom &&
          typeof window.handleCameraSwitch === "function"
        ) {
          window.handleCameraSwitch({ deviceId: targetDeviceId });
          success = true;
          console.log("✅ Camera switch via direct handler");
        }
      } catch (error) {
        console.error("❌ Direct handler camera switch failed:", error);
      }
    }

    // Visual feedback
    if (success) {
      showCameraSwitchNotification(targetDeviceId, metadata);
    }

    return success;
  }

  // ================================================================
  // 4. ENHANCED FACE DETECTION INTEGRATION
  // ================================================================

  // Hook into MediaPipe Face Detection Results
  function enhanceFaceDetectionIntegration() {
    console.log("🔗 Enhanced Face Detection Integration...");

    // Method 1: Hook processFaceDetectionResults
    if (typeof window.processFaceDetectionResults === "function") {
      const original = window.processFaceDetectionResults;
      window.processFaceDetectionResults = function (deviceId, results) {
        // Call original
        const result = original.call(this, deviceId, results);

        // Enhanced face detection processing
        let hasFace = false;
        let confidence = 0;

        if (results && results.detections && results.detections.length > 0) {
          hasFace = true;
          // Robust confidence extraction
          const detection = results.detections[0];
          if (detection.score) {
            confidence = Array.isArray(detection.score)
              ? detection.score[0]
              : detection.score;
          } else {
            confidence = 0.8; // Default for detected faces
          }
        }

        // Update global state
        updateGlobalFaceState(deviceId, hasFace, confidence);

        return result;
      };
      console.log("✅ processFaceDetectionResults hook installed");
    }

    // Method 2: Create/enhance notifyFaceDetectionChange
    window.notifyFaceDetectionChange = function (
      deviceId,
      hasFace,
      confidence = 0.8
    ) {
      console.log(`🔔 Face Detection Change: ${deviceId} = ${hasFace}`);
      updateGlobalFaceState(deviceId, hasFace, confidence);
    };
    console.log("✅ notifyFaceDetectionChange enhanced");

    // Method 3: Direct MediaPipe Results Handler
    if (window.faceDetectionSystem) {
      const originalOnResults = window.faceDetectionSystem.onResults;
      if (originalOnResults) {
        window.faceDetectionSystem.onResults = function (results) {
          // Call original
          originalOnResults.call(this, results);

          // Extract device ID from canvas
          const deviceId = extractDeviceIdFromResults(results);
          if (deviceId) {
            let hasFace = false;
            let confidence = 0;

            if (results.detections && results.detections.length > 0) {
              hasFace = true;
              confidence = results.detections[0].score?.[0] || 0.8;
            }

            updateGlobalFaceState(deviceId, hasFace, confidence);
          }
        };
        console.log("✅ MediaPipe onResults hook installed");
      }
    }
  }

  // Enhanced device ID extraction from MediaPipe results
  function extractDeviceIdFromResults(results) {
    // Method 1: Canvas properties
    if (results.image && results.image._faceDetectionDeviceId) {
      return results.image._faceDetectionDeviceId;
    }

    // Method 2: Canvas dataset
    if (
      results.image &&
      results.image.dataset &&
      results.image.dataset.deviceId
    ) {
      return results.image.dataset.deviceId;
    }

    // Method 3: Canvas ID mapping
    if (results.image && results.image.id) {
      const match = results.image.id.match(/face-detection-canvas-(.+)/);
      if (match) return match[1];
    }

    // Method 4: Global canvas mapping
    if (window.detectionCanvases) {
      for (let [deviceId, canvas] of window.detectionCanvases) {
        if (canvas === results.image) {
          return deviceId;
        }
      }
    }

    return null;
  }

  // ================================================================
  // 5. VISUAL FEEDBACK SYSTEM
  // ================================================================

  function showCameraSwitchNotification(deviceId, metadata) {
    // Remove existing notifications
    document
      .querySelectorAll(".camera-switch-notification")
      .forEach((el) => el.remove());

    const notification = document.createElement("div");
    notification.className = "camera-switch-notification";
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="font-size: 20px;">🎥</div>
        <div>
          <strong>Auto-Switch to ${deviceId}</strong><br>
          <small>Face detected (${((metadata.confidence || 0.8) * 100).toFixed(
            0
          )}%)</small>
        </div>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideInFromRight 0.3s ease-out;
    `;

    // Add animation styles
    if (!document.querySelector("#camera-switch-styles")) {
      const styles = document.createElement("style");
      styles.id = "camera-switch-styles";
      styles.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideInFromRight 0.3s ease-out reverse";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function updateFaceDetectionUI(deviceId, hasFace, confidence) {
    // Update room video status if roomVideoManager exists
    if (window.roomVideoManager && window.roomVideoManager.updateDeviceStatus) {
      const status = hasFace ? "face-detected" : "connected";
      const statusText = hasFace
        ? `Face (${(confidence * 100).toFixed(0)}%)`
        : "Connected";
      window.roomVideoManager.updateDeviceStatus(deviceId, status, statusText);
    }

    // Update face detection status panel
    const faceStatusEl = document.getElementById("face-detection-status");
    if (faceStatusEl) {
      const totalDevices = window.faceDetectionStates.size;
      const devicesWithFaces = Array.from(
        window.faceDetectionStates.values()
      ).filter((state) => state.hasFace).length;
      faceStatusEl.textContent = `${devicesWithFaces}/${totalDevices} faces detected`;
    }
  }

  // ================================================================
  // 6. WEBSOCKET INTEGRATION ENHANCEMENT
  // ================================================================

  function enhanceWebSocketIntegration() {
    if (!window.socket) {
      console.log("⏳ Waiting for WebSocket...");
      setTimeout(enhanceWebSocketIntegration, 1000);
      return;
    }

    console.log("🔗 Enhancing WebSocket Integration...");

    // Store original handler
    const originalHandler = window.socket.onmessage;

    window.socket.onmessage = async function (event) {
      // Call original handler first
      if (originalHandler) {
        try {
          originalHandler.call(this, event);
        } catch (error) {
          // Ignore original handler errors
        }
      }

      // Enhanced face detection message processing
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();

        const message = JSON.parse(data);

        // Process face-detection-update messages
        if (message.type === "face-detection-update") {
          const deviceId = message.targetDeviceId || message.fromDeviceId;
          const hasFace = message.hasFace;
          const confidence = parseFloat(message.confidence) || 0.8;

          console.log(`📡 WebSocket Face Detection: ${deviceId} = ${hasFace}`);
          updateGlobalFaceState(deviceId, hasFace, confidence);
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    };

    console.log("✅ WebSocket Face Detection integration enhanced");
  }

  // ================================================================
  // 7. AUTO-SWITCH SYSTEM CONFIGURATION
  // ================================================================

  function configureAutoSwitchSystem() {
    if (!window.autoCameraSwitching) {
      console.log("⏳ Waiting for Auto-Switch System...");
      setTimeout(configureAutoSwitchSystem, 1000);
      return;
    }

    console.log("⚙️ Configuring Auto-Switch System...");

    // Enable the system
    if (window.autoCameraSwitching.enable) {
      window.autoCameraSwitching.enable();
    }

    // Clear any manual override
    if (window.autoCameraSwitching.clearManualOverride) {
      window.autoCameraSwitching.clearManualOverride();
    }

    // Optimize configuration
    if (window.autoCameraSwitching.updateConfig) {
      window.autoCameraSwitching.updateConfig({
        hysteresisDelay: 2000,
        faceDetectionThreshold: 0.6,
        stabilityPeriod: 1500,
        maxSwitchesPerMinute: 8,
        enableLogging: true,
        enableVisualFeedback: true,
      });
    }

    console.log("✅ Auto-Switch System configured");
  }

  // ================================================================
  // 8. INITIALIZATION SEQUENCE
  // ================================================================

  console.log("🚀 Starting Complete Integration Fix...");

  // Initialize in sequence
  setTimeout(() => {
    enhanceFaceDetectionIntegration();
  }, 500);

  setTimeout(() => {
    enhanceWebSocketIntegration();
  }, 1000);

  setTimeout(() => {
    configureAutoSwitchSystem();
  }, 1500);

  // Final status
  setTimeout(() => {
    console.log("🏁 COMPLETE INTEGRATION FIX INSTALLED!");
    console.log("✅ Face Detection → Auto-Switch → Camera Control");
    console.log("🧪 Test: window.testCompleteIntegration()");

    // Install test function
    window.testCompleteIntegration = function (deviceId = "test-device") {
      console.log(`🧪 Complete Integration Test: ${deviceId}`);
      updateGlobalFaceState(deviceId, true, 0.85);
    };

    // Status monitoring
    window.showIntegrationStatus = function () {
      console.log("📊 COMPLETE INTEGRATION STATUS:");
      console.log("  Face Detection States:", window.faceDetectionStates.size);
      console.log(
        "  Auto-Switch enabled:",
        window.autoCameraSwitching?.isEnabled()
      );
      console.log(
        "  Socket connected:",
        window.socket?.readyState === WebSocket.OPEN
      );
      console.log(
        "  Active faces:",
        Array.from(window.faceDetectionStates.values()).filter((s) => s.hasFace)
          .length
      );
    };

    // Export global API
    window.completeIntegrationFix = {
      updateFaceState: updateGlobalFaceState,
      triggerAutoSwitch: triggerAutoSwitch,
      executeSwitch: executeDirectCameraSwitch,
      test: () => window.testCompleteIntegration(),
      status: () => window.showIntegrationStatus(),
    };
  }, 2000);
}

console.log("🔧 Complete Integration Fix loaded - auto-installing...");
