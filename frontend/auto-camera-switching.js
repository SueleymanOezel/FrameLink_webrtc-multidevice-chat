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

  // GLOBAL: Track detection timers per device for stability
  const detectionTimers = new Map();

  /**
   * Main entry: Called on every face detection update.
   * Implements a sliding window/timer for stability.
   */
  function processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence) {
    if (!autoCameraSwitching.enabled) return;

    // 🔴 NEU: Initialize currentControllingDevice if not set
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

    // --- Sliding window stability logic ---
    let state = autoCameraSwitching.faceStates.get(deviceId) || {
      hasFace: false,
      confidence: 0,
      previousConfidence: 0,
      isStable: false,
      stableDetectionStart: null,
      lastUpdate: 0,
      consecutiveDetections: 0,
    };

    const now = Date.now();

    // If face detected with sufficient confidence, start or continue timer
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      if (!state.stableDetectionStart) {
        state.stableDetectionStart = now;
        state.consecutiveDetections = 1; // Start counting detections
      } else {
        state.consecutiveDetections += 1; // Increment detection count
      }

      // Check if stability period is met
      if (
        now - state.stableDetectionStart >=
          AUTO_SWITCH_CONFIG.stabilityPeriod &&
        state.consecutiveDetections >= 3 // Require at least 3 detections
      ) {
        if (!state.isStable) {
          state.isStable = true;
          logDebug(
            `[FaceState] ${deviceId} isStable=true (after ${AUTO_SWITCH_CONFIG.stabilityPeriod}ms)`
          );
        }
      } else {
        state.isStable = false;
      }
    } else {
      // Reset stability and detection count if face is lost
      state.stableDetectionStart = null;
      state.isStable = false;
      state.consecutiveDetections = 0;
    }

    // Update state
    state.hasFace = hasFace;
    state.previousConfidence = state.confidence;
    state.confidence = confidence;
    state.lastUpdate = now;
    autoCameraSwitching.faceStates.set(deviceId, state);

    // Log state changes
    const oldState = detectionTimers.get(deviceId) || {};
    const stateChanged =
      oldState.hasFace !== state.hasFace ||
      oldState.isStable !== state.isStable ||
      Math.abs((oldState.confidence || 0) - state.confidence) >=
        AUTO_SWITCH_CONFIG.faceDetectionThreshold;

    if (stateChanged) {
      logDebug(`🔄 [FaceState] ${deviceId}:`, {
        hasFace: state.hasFace,
        confidence: state.confidence.toFixed(2),
        previousConfidence: state.previousConfidence.toFixed(2),
        consecutiveDetections: state.consecutiveDetections,
        isStable: state.isStable,
      });
    }
    detectionTimers.set(deviceId, { ...state }); // Save for next diff

    // --- Camera control logic ---
    if (state.isStable) {
      // Compute switch score
      const prevConf =
        typeof state.previousConfidence === "number"
          ? state.previousConfidence
          : 0;
      const score =
        state.confidence -
        prevConf +
        (state.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0);

      logDebug(
        `[Auto-Switch] Switch Score for ${deviceId}: ${score.toFixed(3)}`
      );

      // Find the best stable device
      let bestId = deviceId;
      let bestScore = score;
      autoCameraSwitching.faceStates.forEach((other, id) => {
        if (
          id !== deviceId &&
          other.isStable &&
          other.hasFace &&
          typeof other.previousConfidence === "number"
        ) {
          const otherScore =
            other.confidence -
            (other.previousConfidence || 0) +
            (other.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0);
          logDebug(
            `[Auto-Switch] Switch Score for ${id}: ${otherScore.toFixed(3)}`
          );
          if (otherScore > bestScore) {
            bestId = id;
            bestScore = otherScore;
          }
        }
      });

      // Assign controller if this device is best
      if (bestId === deviceId && bestScore > 0.1) {
        if (autoCameraSwitching.currentControllingDevice === deviceId) {
          console.log(
            `[Auto-Switch] Device ${deviceId} already has camera control`
          );
          logDebug(
            `[Auto-Switch] Device ${deviceId} already has camera control`
          );
        } else {
          autoCameraSwitching.currentControllingDevice = deviceId;
          console.log(
            `[Auto-Switch] Device ${deviceId} has taken camera control`
          );
          logDebug(
            `[Auto-Switch] Device ${deviceId} has taken camera control (score=${score.toFixed(3)})`
          );
          requestAutomaticCameraSwitch(deviceId, state.confidence, score);
        }
      }
    } else if (
      !hasFace &&
      autoCameraSwitching.currentControllingDevice === deviceId
    ) {
      // Lost face: try to switch away
      evaluateSwitchAway(deviceId);
    }

    cleanupPendingSwitches();
  }

  /**
   * Update cached face state and log only on real changes.
   * @param {string} deviceId
   * @param {boolean} hasFace
   * @param {number} confidence
   */
  function updateEnhancedFaceState(deviceId, hasFace, confidence) {
    const now = Date.now();
    let state = autoCameraSwitching.faceStates.get(deviceId);
    if (!state) {
      state = {
        hasFace: false,
        previousConfidence: 0,
        stableDetectionStart: null,
        isStable: false,
        lastUpdate: now,
      };
    }
    const wasStable = state.isStable;

    // LOGIC: Only set stableDetectionStart when Detection Starts!
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      if (!state.hasFace || !state.stableDetectionStart) {
        // Face appears for first time (or after a lost)
        state.stableDetectionStart = now;
      }
      // Check if now stable
      if (
        now - state.stableDetectionStart >=
        AUTO_SWITCH_CONFIG.stabilityPeriod
      ) {
        state.isStable = true;
      } else {
        state.isStable = false;
      }
    } else {
      // Detection lost: reset window
      state.stableDetectionStart = null;
      state.isStable = false;
    }

    state.hasFace = hasFace;
    state.previousConfidence = confidence;
    state.lastUpdate = now;
    autoCameraSwitching.faceStates.set(deviceId, state);

    if (wasStable !== state.isStable || (!wasStable && state.isStable)) {
      logDebug(
        `[FaceState] ${deviceId} isStable=${state.isStable} (after ${AUTO_SWITCH_CONFIG.stabilityPeriod}ms)`
      );
    }
  }

  function evaluateSwitchToDevice(deviceId, confidence) {
    const state = autoCameraSwitching.faceStates.get(deviceId);
    if (!state || !state.isStable) {
      logDebug(
        `[Auto-Switch] ${deviceId} isStable=${state ? state.isStable : "undefined"}, skipping switch.`
      );
      return;
    }

    // Compute switch score: confidence delta, bonus, etc.
    const prevConf =
      typeof state.previousConfidence === "number"
        ? state.previousConfidence
        : 0;
    const score =
      confidence -
      prevConf +
      (confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0);

    logDebug(`[Auto-Switch] Switch Score for ${deviceId}: ${score.toFixed(3)}`);

    // If this device is already in control, log and skip
    if (autoCameraSwitching.currentControllingDevice === deviceId) {
      console.log(
        `[Auto-Switch] Device ${deviceId} already has camera control`
      );
      logDebug(`[Auto-Switch] Device ${deviceId} already has camera control`);
      return;
    }

    // If no device is controlling or this device's score is highest, take over
    const current = autoCameraSwitching.currentControllingDevice;
    let shouldSwitch = false;

    if (!current) {
      shouldSwitch = true;
    } else {
      // Compare scores among all stable devices
      let bestId = deviceId;
      let bestScore = score;
      autoCameraSwitching.faceStates.forEach((other, id) => {
        if (
          id !== deviceId &&
          other.isStable &&
          other.hasFace &&
          typeof other.previousConfidence === "number"
        ) {
          const otherScore =
            other.confidence -
            (other.previousConfidence || 0) +
            (other.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0);
          logDebug(
            `[Auto-Switch] Switch Score for ${id}: ${otherScore.toFixed(3)}`
          );
          if (otherScore > bestScore) {
            bestId = id;
            bestScore = otherScore;
          }
        }
      });
      if (bestId === deviceId && bestScore > 0.1) shouldSwitch = true;
    }

    if (shouldSwitch) {
      autoCameraSwitching.currentControllingDevice = deviceId;
      console.log(`[Auto-Switch] Device ${deviceId} has taken camera control`);
      logDebug(
        `[Auto-Switch] Device ${deviceId} has taken camera control (score=${score.toFixed(3)})`
      );
      requestAutomaticCameraSwitch(deviceId, confidence, score);
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
    const current = autoCameraSwitching.currentControllingDevice;
    if (current === deviceId) {
      console.log(
        `[Auto-Switch] Device ${deviceId} already has camera control`
      );
    } else {
      console.log(`[Auto-Switch] Device ${deviceId} has taken camera control`);
    }
    logDebug(`[Auto-Switch] Switch Score for ${deviceId}: ${score.toFixed(3)}`);
    // ...existing code follows, unchanged...
    autoCameraSwitching.currentControllingDevice = deviceId;
    autoCameraSwitching.lastSwitchTime = Date.now();
    autoCameraSwitching.switchCount++;
    autoCameraSwitching.switchHistory.push(Date.now());
    // Send camera-request to backend
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

  // ================================================================
  // 🤖 ENHANCED AUTO-CAMERA-SWITCHING.JS INTEGRATION
  // ================================================================

  function executeIntegratedCameraSwitch(deviceId, metadata = {}) {
    try {
      // 🔴 FIX: Hole roomId aus dem globalen State
      const roomId =
        window.roomState?.roomId ||
        window.enhancedRoomSystem?.roomManager?.roomId ||
        window.multiDeviceRoom?.roomId;

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
          roomId: roomId, // 🔴 FIX: Verwende die korrekte roomId
          deviceId: deviceId,
          fromDeviceId: myDeviceId, // 🔴 FIX: Verwende korrekte fromDeviceId
          metadata: {
            ...metadata,
            automatic: true,
            timestamp: Date.now(),
            reason: "face-detection-auto-switch",
          },
        };

        logDebug("📤 FIXED Auto-Switch Camera Request:", message);
        const success = window.frameLink.api.sendMessage(message);

        if (success) {
          // Update local state immediately
          autoCameraSwitching.currentControllingDevice = deviceId;
          logDebug(`✅ Camera switch message sent successfully to ${deviceId}`);
        } else {
          logDebug("❌ Failed to send camera switch message");
        }
        return;
      }

      // Fallback: Direct WebSocket
      logDebug("⚠️ frameLink.api.sendMessage not available - trying fallback");

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

  // === MINIMAL INTERVAL FOR CAMERA SWITCHES ===
  const MIN_SWITCH_INTERVAL = 1500; // ms
  let lastSwitchTs = 0;

  /**
   * Direct camera switch execution with minimal interval and duplicate prevention.
   * @param {string} roomId
   * @param {string} toDeviceId
   * @param {string} fromDeviceId
   * @param {object} details
   */
  function executeDirectCameraSwitch(
    roomId,
    toDeviceId,
    fromDeviceId,
    details = {}
  ) {
    if (!roomId || !toDeviceId || !fromDeviceId) {
      logDebug("❌ executeDirectCameraSwitch: Missing required parameters");
      return;
    }
    if (toDeviceId === fromDeviceId) {
      logDebug(
        "[AutoSwitch] Kein Wechsel nötig, Zielgerät ist bereits aktiv:",
        toDeviceId
      );
      return;
    }
    const now = Date.now();
    if (now - lastSwitchTs < MIN_SWITCH_INTERVAL) {
      logDebug(
        `[AutoSwitch] Wechsel zu schnell hintereinander verhindert (${now - lastSwitchTs}ms)`
      );
      return;
    }
    lastSwitchTs = now;

    const payload = {
      type: "camera-request",
      roomId,
      deviceId: toDeviceId,
      fromDeviceId,
      automatic: true,
      reason: "face-detection-auto-switch",
      confidence: details.confidence ?? 0,
      timestamp: now,
      ...(details.metadata || {}),
    };

    if (window.frameLink?.api?.sendMessage) {
      logDebug("📤 Direct Camera Switch Payload:", payload);
      window.frameLink.api.sendMessage("camera-request", payload);
    } else {
      logDebug("❌ frameLink.api.sendMessage nicht verfügbar");
    }
  }

  // === Direct Face Detection Handler for Auto Camera Switch ===
  window.autoCameraSwitching._processFaceDetection = function (
    deviceId,
    hasFace,
    confidence
  ) {
    const roomId =
      window.roomState?.roomId ||
      window.enhancedRoomSystem?.roomManager?.roomId ||
      window.multiDeviceRoom?.roomId;
    const localDeviceId =
      window.roomState?.deviceId || window.deviceId || "unknown";

    if (!roomId || !localDeviceId) {
      logDebug("❌ _processFaceDetection: roomId oder localDeviceId fehlt");
      return;
    }
    if (hasFace === true) {
      executeDirectCameraSwitch(roomId, deviceId, localDeviceId, {
        confidence,
      });
    }
  };

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
        console.log("  roomSystem:", !!window.roomSystem);
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
      // ENHANCED DEBUG TOOLS
      showIntegrationStatus: debugIntegrationStatus,
      testIntegration: testAutoSwitchIntegration,
      testFaceDetection: (
        deviceId = "manual-test",
        hasFace = true,
        confidence = 0.85
      ) => {
        logDebug(`🧪 Manual Face Detection Test: ${deviceId}`);
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
      },
      forceIntegrationSetup: () => {
        logDebug("🔧 Force re-running integration setup");
        integrateWithFaceDetection();
        integrateWithManualControls();
      },
      showFaceStates: () => {
        if (window.faceDetectionStates) {
          console.table(Object.fromEntries(window.faceDetectionStates));
        } else if (autoCameraSwitching.faceStates) {
          console.table(Object.fromEntries(autoCameraSwitching.faceStates));
        } else {
          logDebug("❌ No face detection states found");
        }
      },
    },
    _processFaceDetection: processFaceDetectionForAutoSwitch,
  };

  // ========================================
  // ENHANCED INTEGRATION
  // ========================================

  function integrateWithFaceDetection() {
    logDebug("🔧 Starte Enhanced Face Detection Integration...");

    window.addEventListener("face-detection-update", (event) => {
      logDebug("📥 Face Detection Window Event empfangen:", event.detail);
      const { deviceId, hasFace, confidence } = event.detail;
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    });

    if (window.frameLink && window.frameLink.events) {
      window.frameLink.events.addEventListener(
        "face-detection-change",
        (event) => {
          logDebug("📥 FrameLink Face Detection Event:", event.detail);
          const { deviceId, hasFace, confidence } = event.detail;
          processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        }
      );
      window.frameLink.events.addEventListener(
        "auto-switch-face-detection",
        (event) => {
          logDebug("📥 Auto-Switch Specific Event:", event.detail);
          const { deviceId, hasFace, confidence } = event.detail;
          processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        }
      );
    }

    window.addEventListener("face-detection-for-auto-switch", (event) => {
      logDebug("📥 Auto-Switch Bridge Event:", event.detail);
      const { deviceId, hasFace, confidence } = event.detail;
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    });

    const attempts = [
      () => hookIntoEnhancedFaceDetection(),
      () => hookIntoFaceDetectionFunction(),
      () => hookIntoNotifyFaceDetectionChange(),
      () => setupPollingIntegration(),
      () => setupDirectBridgeIntegration(),
    ];

    attempts.forEach((attempt, index) => {
      try {
        attempt();
        logDebug(`✅ Enhanced Integration Method ${index + 1} erfolgreich`);
      } catch (error) {
        logDebug(
          `⚠️ Enhanced Integration Method ${index + 1} fehlgeschlagen:`,
          error.message
        );
      }
    });

    logDebug("🔗 Enhanced Face Detection Integration abgeschlossen");
  }

  function hookIntoEnhancedFaceDetection() {
    logDebug("🔗 Trying Enhanced Face Detection Hook...");
    const checkForEnhancedSystem = () => {
      if (window.enhancedRoomSystem?.faceDetectionManager) {
        const manager = window.enhancedRoomSystem.faceDetectionManager;
        if (manager.processFaceDetectionResults) {
          const original = manager.processFaceDetectionResults.bind(manager);
          manager.processFaceDetectionResults = function (deviceId, results) {
            const result = original(deviceId, results);

            let hasFace = false;
            let confidence = 0;
            if (results?.detections?.length > 0) {
              hasFace = true;
              let score = results.detections[0].score;
              confidence = Array.isArray(score) ? score[0] : score || 0.8;
            }

            const wasController =
              autoCameraSwitching.currentControllingDevice === deviceId;
            const willController =
              hasFace &&
              confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold;

            // Only log actual controller changes, not repeated detections
            if (!wasController && willController) {
              logDebug(
                `➡️ Hook: wechsle Kontrolle auf ${deviceId} (conf=${confidence.toFixed(2)})`
              );
            } else if (wasController && !willController) {
              logDebug(`⬅️ Hook: gebe Kontrolle von ${deviceId} ab`);
            }

            // Check if controller actually changed before processing
            if (wasController === willController) {
              return ret; // No change, skip processing
            }

            // und dann weiter zur AutoSwitch-Logik
            processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
            return ret;
          };
          logDebug("✅ Enhanced Face Detection Manager hooked");
          return true;
        }
      }
      return false;
    };
    if (!checkForEnhancedSystem()) {
      let attempts = 0;
      const retryInterval = setInterval(() => {
        attempts++;
        if (checkForEnhancedSystem() || attempts >= 20) {
          clearInterval(retryInterval);
          if (checkForEnhancedSystem()) {
            logDebug("✅ Enhanced system hook successful after retry");
          }
        }
      }, 500);
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  function enhancedDelayedInitialization() {
    logDebug("🚀 Enhanced Auto-Switch Initialization starting...");
    integrateWithFaceDetection();
    integrateWithManualControls();
    autoCameraSwitching.isActive = true;
    logDebug("✅ Enhanced Automatic Camera Switching System bereit!");
    logDebug("📊 Enhanced Configuration:", AUTO_SWITCH_CONFIG);
    setTimeout(() => {
      debugIntegrationStatus();
      testAutoSwitchIntegration();
    }, 2000);
    console.log("🚀 ENHANCED AUTOMATIC CAMERA SWITCHING SYSTEM ACTIVATED! 🚀");
    console.log(
      "📱 Commands: window.autoCameraSwitching.debug.showIntegrationStatus()"
    );
    console.log("🧪 Test: window.autoCameraSwitching.debug.testIntegration()");
    console.log("🎭 States: window.autoCameraSwitching.debug.showFaceStates()");
  }

  // Add simple face detection event listener
  window.addEventListener("face-detection-update", (event) => {
    const { deviceId, hasFace, confidence } = event.detail;
    console.log(
      `🎭 Face Detection Event: ${deviceId} = ${hasFace} (${confidence})`
    );
    processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
  });

  // Add simplified MediaPipe integration
  if (window.frameLink?.events) {
    window.frameLink.events.addEventListener(
      "face-detection-change",
      (event) => {
        const { deviceId, hasFace, confidence } = event.detail;
        console.log(
          `🎭 FrameLink Face Event: ${deviceId} = ${hasFace} (${confidence})`
        );
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
      }
    );
  }

  // Hook into existing face detection functions if available
  setTimeout(() => {
    if (typeof window.processFaceDetectionResults === "function") {
      const original = window.processFaceDetectionResults;
      window.processFaceDetectionResults = function (deviceId, results) {
        const ret = original.apply(this, arguments);

        // Extract face detection data
        let hasFace = false;
        let confidence = 0;

        if (results?.detections?.length > 0) {
          hasFace = true;
          const detection = results.detections[0];
          confidence = detection.score?.[0] || detection.score || 0.8;
          if (Array.isArray(confidence)) confidence = confidence[0];
        }

        // Send to auto-switch
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        return ret;
      };
      console.log("✅ Auto-Switch: Hooked into processFaceDetectionResults");
    }
  }, 2000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(enhancedDelayedInitialization, 1000);
    });
  } else {
    setTimeout(enhancedDelayedInitialization, 1000);
  }
})();

// Fallback-Logger für Debug-Ausgaben
function logDebug(...args) {
  if (window.frameLink && typeof frameLink.log === "function") {
    frameLink.log("[AutoSwitch]", ...args);
  } else {
    console.log("[AutoSwitch]", ...args);
  }
}

// Debounce-Handler für Face-Detection-Events
let debounceTimer = null;
let lastSwitchDeviceId = null;

async function autoSwitchToDevice(deviceId, confidence) {
  // Nur wechseln, wenn sich das Zielgerät ändert
  if (lastSwitchDeviceId === deviceId) {
    logDebug(
      "[Auto-Switch] Kein Wechsel nötig, Gerät bereits aktiv:",
      deviceId
    );
    return;
  }
  lastSwitchDeviceId = deviceId;
  logDebug(
    "➡️ Hook: wechsle Kontrolle auf",
    deviceId,
    `(conf=${confidence.toFixed(2)})`
  );
  try {
    await switchToDevice(deviceId);
  } catch (err) {
    logDebug("❌ Fehler beim switchToDevice:", err);
  }
}

function handleFaceDetectionSwitchEvent(deviceId, hasFace, confidence) {
  if (!hasFace || confidence < 0.7) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    autoSwitchToDevice(deviceId, confidence);
  }, 500);
}

// Beispiel-Event-Handler (anpassen je nach Event-Namen)
window.addEventListener("face-detection-for-auto-switch", (event) => {
  const { deviceId, hasFace, confidence } = event.detail;
  handleFaceDetectionSwitchEvent(deviceId, hasFace, confidence);
});
