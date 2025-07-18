/**
 * 🚀 AUTOMATIC CAMERA SWITCHING SYSTEM
 * Intelligente Kamera-Umschaltung basierend auf Face Detection
 * Integriert nahtlos mit bestehender simple-room.js Infrastruktur
 */

(function () {
  "use strict";

  // ========================================
  // KONFIGURATION
  // ========================================
  const AUTO_SWITCH_CONFIG = {
    hysteresisDelay: 1000,
    faceDetectionThreshold: 0.7,
    stabilityPeriod: 800,
    confidenceBonus: 0.2,
    currentCameraBonus: 0.1,
    maxSwitchesPerMinute: 10,
    autoSwitchTimeout: 30000,
    manualOverrideTime: 10000,
    enableLogging: true,
    enableVisualFeedback: true,
  };

  // ========================================
  // STATE MANAGEMENT
  // ========================================
  let autoCameraSwitching = {
    enabled: true,
    isActive: false,
    currentControllingDevice: null,
    lastSwitchTime: 0,
    pendingSwitches: new Map(),
    switchHistory: [],
    manualOverrideUntil: 0,
    wasManuallyOverridden: false,
    faceStates: new Map(),
    originalCameraHandler: null,
    roomSystem: null,
    switchCount: 0,
    debugLogs: [],
  };

  // ========================================
  // FACE DETECTION DECISION ENGINE
  // ========================================
  function processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence) {
    if (!autoCameraSwitching.enabled) return;

    // 🔴 CRITICAL FIX: Initialize currentControllingDevice if not set
    if (
      !autoCameraSwitching.currentControllingDevice &&
      window.roomState?.hasCamera
    ) {
      autoCameraSwitching.currentControllingDevice = window.roomState.deviceId;
      logDebug(
        `🔧 Initialized currentControllingDevice to: ${window.roomState.deviceId}`
      );
    }

    if (isManualOverrideActive()) {
      logDebug(
        `🛑 Manual override aktiv - ignoriere Auto-Switch für ${deviceId}`
      );
      return;
    }

    updateEnhancedFaceState(deviceId, hasFace, confidence);

    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      evaluateSwitchToDevice(deviceId, confidence);
    } else if (
      !hasFace &&
      autoCameraSwitching.currentControllingDevice === deviceId
    ) {
      evaluateSwitchAway(deviceId);
    }

    cleanupPendingSwitches();
  }

  function updateEnhancedFaceState(deviceId, hasFace, confidence) {
    const currentTime = Date.now();
    let state = autoCameraSwitching.faceStates.get(deviceId);

    if (!state) {
      state = {
        hasFace: false,
        confidence: 0,
        lastUpdate: currentTime,
        stableDetectionStart: null,
        consecutiveDetections: 0,
        averageConfidence: 0,
        isStable: false,
      };
    }

    const previousHasFace = state.hasFace;
    state.hasFace = hasFace;
    state.confidence = confidence;
    state.lastUpdate = currentTime;

    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      if (!previousHasFace) {
        state.stableDetectionStart = currentTime;
        state.consecutiveDetections = 1;
        state.averageConfidence = confidence;
      } else {
        state.consecutiveDetections++;
        state.averageConfidence = (state.averageConfidence + confidence) / 2;
      }

      const detectionDuration =
        currentTime - (state.stableDetectionStart || currentTime);
      state.isStable = detectionDuration >= AUTO_SWITCH_CONFIG.stabilityPeriod;
    } else {
      state.stableDetectionStart = null;
      state.consecutiveDetections = 0;
      state.isStable = false;
    }

    autoCameraSwitching.faceStates.set(deviceId, state);

    logDebug(`📊 Face State Update - ${deviceId}:`, {
      hasFace,
      confidence: confidence.toFixed(2),
      isStable: state.isStable,
      consecutive: state.consecutiveDetections,
    });
  }

  function evaluateSwitchToDevice(deviceId, confidence) {
    const state = autoCameraSwitching.faceStates.get(deviceId);

    if (!state || !state.isStable) {
      logDebug(`⏳ Warte auf stabile Detection für ${deviceId}`);
      return;
    }

    if (autoCameraSwitching.currentControllingDevice === deviceId) {
      logDebug(`✅ ${deviceId} hat bereits Kamera-Kontrolle`);
      return;
    }

    if (isInHysteresisWindow()) {
      logDebug(`🚫 Hysterese aktiv - warte bis Switch möglich`);
      return;
    }

    if (isRateLimited()) {
      logDebug(`🚫 Rate limit erreicht - zu viele Switches`);
      return;
    }

    const switchScore = calculateSwitchScore(deviceId, confidence);
    const currentScore = getCurrentDeviceScore();

    logDebug(
      `🧮 Switch Score für ${deviceId}: ${switchScore.toFixed(2)} vs Current: ${currentScore.toFixed(2)}`
    );

    if (switchScore > currentScore + 0.1) {
      requestAutomaticCameraSwitch(deviceId, confidence, switchScore);
    }
  }

  function evaluateSwitchAway(deviceId) {
    logDebug(`👻 ${deviceId} verliert Gesicht - evaluiere Alternative`);

    const alternatives = findBestAlternativeDevice();
    if (alternatives.length > 0) {
      const best = alternatives[0];
      logDebug(
        `🔄 Switch von ${deviceId} zu ${best.deviceId} (Score: ${best.score.toFixed(2)})`
      );
      requestAutomaticCameraSwitch(best.deviceId, best.confidence, best.score);
    } else {
      logDebug(`🤷 Keine Alternative gefunden - behalte ${deviceId}`);
    }
  }

  function calculateSwitchScore(deviceId, confidence) {
    let score = confidence;

    if (confidence > 0.8) {
      score += AUTO_SWITCH_CONFIG.confidenceBonus;
    }

    if (autoCameraSwitching.currentControllingDevice === deviceId) {
      score += AUTO_SWITCH_CONFIG.currentCameraBonus;
    }

    const state = autoCameraSwitching.faceStates.get(deviceId);
    if (state && state.consecutiveDetections > 3) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  function getCurrentDeviceScore() {
    const currentDevice = autoCameraSwitching.currentControllingDevice;
    if (!currentDevice) return 0;

    const state = autoCameraSwitching.faceStates.get(currentDevice);
    if (!state || !state.hasFace) return 0;

    return calculateSwitchScore(currentDevice, state.confidence);
  }

  function findBestAlternativeDevice() {
    const alternatives = [];

    autoCameraSwitching.faceStates.forEach((state, deviceId) => {
      if (deviceId === autoCameraSwitching.currentControllingDevice) return;
      if (!state.hasFace || !state.isStable) return;

      const score = calculateSwitchScore(deviceId, state.confidence);
      alternatives.push({
        deviceId,
        confidence: state.confidence,
        score,
      });
    });

    return alternatives.sort((a, b) => b.score - a.score);
  }

  // ========================================
  // HYSTERESE & RATE LIMITING
  // ========================================
  function isInHysteresisWindow() {
    const timeSinceLastSwitch = Date.now() - autoCameraSwitching.lastSwitchTime;
    return timeSinceLastSwitch < AUTO_SWITCH_CONFIG.hysteresisDelay;
  }

  function isRateLimited() {
    const now = Date.now();
    const recentSwitches = autoCameraSwitching.switchHistory.filter(
      (time) => now - time < 60000
    );
    return recentSwitches.length >= AUTO_SWITCH_CONFIG.maxSwitchesPerMinute;
  }

  function isManualOverrideActive() {
    return Date.now() < autoCameraSwitching.manualOverrideUntil;
  }

  function cleanupPendingSwitches() {
    const now = Date.now();
    const timeout = AUTO_SWITCH_CONFIG.stabilityPeriod * 2;

    autoCameraSwitching.pendingSwitches.forEach((pendingSwitch, deviceId) => {
      if (now - pendingSwitch.timestamp > timeout) {
        autoCameraSwitching.pendingSwitches.delete(deviceId);
        logDebug(`🧹 Cleanup pending switch für ${deviceId}`);
      }
    });
  }

  // ========================================
  // CAMERA SWITCH EXECUTION
  // ========================================
  function requestAutomaticCameraSwitch(deviceId, confidence, score) {
    const currentTime = Date.now();

    logDebug(`🚀 Führe automatischen Switch aus:`, {
      from: autoCameraSwitching.currentControllingDevice || "none",
      to: deviceId,
      confidence: confidence.toFixed(2),
      score: score.toFixed(2),
    });

    autoCameraSwitching.lastSwitchTime = currentTime;
    autoCameraSwitching.currentControllingDevice = deviceId;
    autoCameraSwitching.switchCount++;
    autoCameraSwitching.switchHistory.push(currentTime);

    autoCameraSwitching.switchHistory =
      autoCameraSwitching.switchHistory.filter(
        (time) => currentTime - time < 60000
      );

    executeIntegratedCameraSwitch(deviceId, {
      reason: "face-detection",
      confidence,
      score,
      automatic: true,
    });

    if (AUTO_SWITCH_CONFIG.enableVisualFeedback) {
      showCameraSwitchFeedback(deviceId, confidence);
    }

    dispatchCameraSwitchEvent(deviceId, "automatic");
  }

  // 🔴 CRITICAL FIX: Proper camera switch execution
  function executeIntegratedCameraSwitch(deviceId, metadata = {}) {
    try {
      // Get room ID from global state
      const roomId = window.roomState?.roomId || window.multiDeviceRoom?.roomId;
      const myDeviceId =
        window.roomState?.deviceId || window.deviceId || "unknown";

      if (!roomId) {
        logDebug("❌ No roomId found - cannot switch camera");
        return;
      }

      // Method 1: frameLink API (PREFERRED)
      if (window.frameLink?.api?.sendMessage) {
        const message = {
          type: "camera-request",
          roomId: roomId,
          deviceId: deviceId,
          fromDeviceId: myDeviceId,
          metadata: {
            ...metadata,
            automatic: true,
            timestamp: Date.now(),
            reason: "face-detection-auto-switch",
          },
        };

        logDebug("📤 Auto-Switch Camera Request:", message);
        const success = window.frameLink.api.sendMessage(message);

        if (success) {
          autoCameraSwitching.currentControllingDevice = deviceId;
          logDebug(`✅ Camera switch message sent successfully to ${deviceId}`);
        } else {
          logDebug("❌ Failed to send camera switch message");
        }
        return;
      }

      // Method 2: Direct WebSocket fallback
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        const message = {
          type: "camera-request",
          roomId: roomId,
          deviceId: deviceId,
          fromDeviceId: myDeviceId,
          automatic: true,
        };
        window.socket.send(JSON.stringify(message));
        logDebug("📤 Fallback WebSocket camera request sent");
        return;
      }

      logDebug("❌ No available method to execute camera switch");
    } catch (error) {
      logDebug(`❌ Camera switch execution error:`, error);
    }
  }

  // ========================================
  // VISUAL FEEDBACK & EVENTS
  // ========================================
  function showCameraSwitchFeedback(deviceId, confidence) {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    feedback.innerHTML = `
      🎥 Auto-Switch zu ${deviceId}
      <br><small>Face detected (${(confidence * 100).toFixed(0)}%)</small>
    `;

    if (!document.querySelector("#autoSwitchStyles")) {
      const styles = document.createElement("style");
      styles.id = "autoSwitchStyles";
      styles.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.style.animation = "slideIn 0.3s ease-out reverse";
      setTimeout(() => feedback.remove(), 300);
    }, 3000);
  }

  function dispatchCameraSwitchEvent(deviceId, type) {
    const event = new CustomEvent("camera-auto-switch", {
      detail: {
        deviceId,
        type,
        timestamp: Date.now(),
        confidence:
          autoCameraSwitching.faceStates.get(deviceId)?.confidence || 0,
      },
    });

    window.dispatchEvent(event);
    logDebug(`📢 Camera Switch Event dispatched:`, event.detail);
  }

  // ========================================
  // MANUAL OVERRIDE & CONTROL
  // ========================================
  function setManualOverride(duration = AUTO_SWITCH_CONFIG.manualOverrideTime) {
    autoCameraSwitching.manualOverrideUntil = Date.now() + duration;
    autoCameraSwitching.wasManuallyOverridden = true;
    logDebug(`🛑 Manual Override aktiviert für ${duration}ms`);
  }

  // ========================================
  // PUBLIC API
  // ========================================
  window.autoCameraSwitching = {
    isEnabled: () => autoCameraSwitching.enabled,
    enable: () => {
      autoCameraSwitching.enabled = true;
      logDebug("✅ Automatic Camera Switching aktiviert");
    },
    disable: () => {
      autoCameraSwitching.enabled = false;
      logDebug("🔇 Automatic Camera Switching deaktiviert");
    },
    setManualOverride,
    clearManualOverride: () => {
      autoCameraSwitching.manualOverrideUntil = 0;
      logDebug("🔓 Manual Override aufgehoben");
    },
    getStatus: () => ({
      enabled: autoCameraSwitching.enabled,
      active: autoCameraSwitching.isActive,
      currentDevice: autoCameraSwitching.currentControllingDevice,
      manualOverride: isManualOverrideActive(),
      switchCount: autoCameraSwitching.switchCount,
      faceStates: Object.fromEntries(autoCameraSwitching.faceStates),
    }),
    updateConfig: (newConfig) => {
      Object.assign(AUTO_SWITCH_CONFIG, newConfig);
      logDebug("⚙️ Configuration updated:", newConfig);
    },
    debug: {
      showStates: () => {
        console.table(Object.fromEntries(autoCameraSwitching.faceStates));
      },
      getHistory: () => autoCameraSwitching.switchHistory,
      clearHistory: () => {
        autoCameraSwitching.switchHistory = [];
        autoCameraSwitching.switchCount = 0;
      },
      testAutoSwitch: (
        deviceId = "test-device",
        hasFace = true,
        confidence = 0.85
      ) => {
        console.log(`🧪 Manual Test: Auto-Switch für ${deviceId}`);
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
      },
      enableVerboseLogging: () => {
        AUTO_SWITCH_CONFIG.enableLogging = true;
        console.log("🔊 Verbose Auto-Switch Logging aktiviert");
      },
      disableVerboseLogging: () => {
        AUTO_SWITCH_CONFIG.enableLogging = false;
        console.log("🔇 Verbose Auto-Switch Logging deaktiviert");
      },
      showIntegrationStatus: () => {
        console.log("🔗 INTEGRATION STATUS:");
        console.log("  faceDetectionSystem:", !!window.faceDetectionSystem);
        console.log("  faceDetectionStates:", !!window.faceDetectionStates);
        console.log("  roomState:", !!window.roomState);
        console.log(
          "  processFaceDetectionResults:",
          typeof window.processFaceDetectionResults
        );
        console.log(
          "  notifyFaceDetectionChange:",
          typeof window.notifyFaceDetectionChange
        );
      },
      forceCameraSwitch: (deviceId) => {
        console.log(`🚀 Force Camera Switch zu: ${deviceId}`);
        requestAutomaticCameraSwitch(deviceId, 0.9, 1.0);
      },
    },
    _processFaceDetection: processFaceDetectionForAutoSwitch,
  };

  // ========================================
  // INTEGRATION WITH FACE DETECTION
  // ========================================
  function integrateWithFaceDetection() {
    logDebug("🔧 Starte Enhanced Face Detection Integration...");

    // Event listeners
    window.addEventListener("face-detection-update", (event) => {
      const { deviceId, hasFace, confidence } = event.detail;
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    });

    if (window.frameLink?.events) {
      window.frameLink.events.addEventListener(
        "face-detection-change",
        (event) => {
          const { deviceId, hasFace, confidence } = event.detail;
          processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        }
      );

      window.frameLink.events.addEventListener(
        "auto-switch-face-detection",
        (event) => {
          const { deviceId, hasFace, confidence } = event.detail;
          processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        }
      );
    }

    // Hook into existing functions
    const checkInterval = setInterval(() => {
      if (window.faceDetectionSystem || window.enhancedRoomSystem) {
        clearInterval(checkInterval);

        // Hook processFaceDetectionResults
        if (typeof window.processFaceDetectionResults === "function") {
          const originalFunction = window.processFaceDetectionResults;
          window.processFaceDetectionResults = function (deviceId, results) {
            const result = originalFunction.call(this, deviceId, results);

            let hasFace = false;
            let confidence = 0;

            if (results?.detections?.length > 0) {
              hasFace = true;
              const detection = results.detections[0];
              confidence =
                detection.score?.[0] ||
                detection.score ||
                detection.confidence ||
                0.8;
              if (Array.isArray(confidence)) confidence = confidence[0];
            }

            processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
            return result;
          };
          logDebug("✅ processFaceDetectionResults Hook installiert");
        }

        // Create or hook notifyFaceDetectionChange
        if (!window.notifyFaceDetectionChange) {
          window.notifyFaceDetectionChange = function (
            deviceId,
            hasFace,
            confidence
          ) {
            processFaceDetectionForAutoSwitch(
              deviceId,
              hasFace,
              confidence || 0.8
            );
          };
          logDebug("✅ notifyFaceDetectionChange created");
        }
      }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);

    // Polling fallback
    setInterval(() => {
      if (window.faceDetectionStates) {
        window.faceDetectionStates.forEach((state, deviceId) => {
          const lastUpdate = state.lastUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;

          if (timeSinceUpdate < 1000) {
            const lastProcessed =
              autoCameraSwitching.faceStates.get(deviceId)?.lastUpdate || 0;
            if (lastUpdate > lastProcessed) {
              processFaceDetectionForAutoSwitch(
                deviceId,
                state.hasFace,
                state.confidence
              );
            }
          }
        });
      }
    }, 200);

    logDebug("🔗 Face Detection Integration abgeschlossen");
  }

  function integrateWithManualControls() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      const selectors = [
        "[data-device-camera]",
        ".camera-switch-btn",
        ".device-camera-btn",
        "#take-camera",
        "[id*='camera']",
        "[onclick*='camera']",
      ];

      for (const selector of selectors) {
        if (target.matches(selector) || target.closest(selector)) {
          logDebug("🖱️ Manual camera switch detected - aktiviere Override");
          setManualOverride();
          break;
        }
      }
    });

    logDebug("🔗 Manual Controls Integration abgeschlossen");
  }

  // ========================================
  // UTILITIES & LOGGING
  // ========================================
  function logDebug(message, data = null) {
    if (!AUTO_SWITCH_CONFIG.enableLogging) return;

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, data };

    autoCameraSwitching.debugLogs.push(logEntry);
    if (autoCameraSwitching.debugLogs.length > 100) {
      autoCameraSwitching.debugLogs.shift();
    }

    if (data) {
      console.log(`[Auto-Switch ${timestamp}] ${message}`, data);
    } else {
      console.log(`[Auto-Switch ${timestamp}] ${message}`);
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  function delayedInitialization() {
    integrateWithFaceDetection();
    integrateWithManualControls();
    autoCameraSwitching.isActive = true;
    logDebug("✅ Automatic Camera Switching System bereit!");
    logDebug("📊 Configuration:", AUTO_SWITCH_CONFIG);

    console.log("🚀 AUTOMATIC CAMERA SWITCHING SYSTEM ACTIVATED! 🚀");
    console.log(
      "📱 Commands: window.autoCameraSwitching.debug.showIntegrationStatus()"
    );
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(delayedInitialization, 2000);
    });
  } else {
    setTimeout(delayedInitialization, 2000);
  }
})();
