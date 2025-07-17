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

    const oldState = autoCameraSwitching.faceStates.get(deviceId) || {
      hasFace: false,
      confidence: 0,
      consecutiveDetections: 0,
    };

    const sameFace = oldState.hasFace === hasFace;
    const consecutive = sameFace ? oldState.consecutiveDetections + 1 : 1;

    const newState = {
      hasFace,
      previousConfidence: oldState.confidence,
      confidence,
      consecutiveDetections: consecutive,
      isStable: consecutive >= AUTO_SWITCH_CONFIG.stabilityPeriod,
      lastUpdate: Date.now(),
    };

    autoCameraSwitching.faceStates.set(deviceId, newState);

    const stateChanged =
      oldState.hasFace !== newState.hasFace ||
      oldState.isStable !== newState.isStable ||
      Math.abs(oldState.confidence - newState.confidence) >=
        AUTO_SWITCH_CONFIG.faceDetectionThreshold;

    if (stateChanged) {
      logDebug(`🔄 [FaceState] ${deviceId}:`, {
        hasFace: newState.hasFace,
        confidence: newState.confidence.toFixed(2),
        previousConfidence: newState.previousConfidence.toFixed(2),
        consecutiveDetections: newState.consecutiveDetections,
        isStable: newState.isStable,
      });
    }

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

  /**
   * Update cached face state and log only on real changes.
   * @param {string} deviceId
   * @param {boolean} hasFace
   * @param {number} confidence
   */
  function updateEnhancedFaceState(deviceId, hasFace, confidence) {
    const currentTime = Date.now();
    // Hole oder initialisiere State
    let state = autoCameraSwitching.faceStates.get(deviceId);
    if (!state) {
      state = {
        hasFace: false,
        previousConfidence: 0,
        lastUpdate: currentTime,
        stableDetectionStart: null,
        consecutiveDetections: 0,
        averageConfidence: 0,
        isStable: false,
      };
    }

    // Speichere alten Wert für Vergleiche
    const previousHasFace = state.hasFace;
    const previousConfidence = state.previousConfidence;

    // Update Basisdaten
    state.hasFace = hasFace;
    state.lastUpdate = currentTime;

    // Face-Detection-Logik
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      if (!previousHasFace) {
        state.stableDetectionStart = currentTime;
        state.consecutiveDetections = 1;
        state.averageConfidence = confidence;
      } else {
        state.consecutiveDetections++;
        state.averageConfidence = (state.averageConfidence + confidence) / 2;
      }
      const detectionDuration = currentTime - state.stableDetectionStart;
      state.isStable = detectionDuration >= AUTO_SWITCH_CONFIG.stabilityPeriod;
    } else {
      state.stableDetectionStart = null;
      state.consecutiveDetections = 0;
      state.isStable = false;
    }

    // Log nur bei echtem Wechsel
    if (
      state.hasFace !== previousHasFace ||
      Math.abs(confidence - previousConfidence) > 0.2
    ) {
      logDebug(
        `📊 Face State CHANGE - ${deviceId}: ${hasFace ? "DETECTED" : "LOST"}` +
          ` (Δconf=${(confidence - previousConfidence).toFixed(2)})`
      );
    }

    // Update confidence für nächstes Mal
    state.previousConfidence = confidence;
    autoCameraSwitching.faceStates.set(deviceId, state);
  }

  function evaluateSwitchToDevice(deviceId, confidence) {
    const currentTime = Date.now();
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

  function hookIntoFaceDetectionFunction() {
    logDebug("🔗 Trying Face Detection Function Hook...");
    const checkInterval = setInterval(() => {
      if (window.faceDetectionSystem || window.enhancedRoomSystem) {
        clearInterval(checkInterval);
        if (typeof window.processFaceDetectionResults === "function") {
          const originalFunction = window.processFaceDetectionResults;
          window.processFaceDetectionResults = function (deviceId, results) {
            const result = originalFunction.call(this, deviceId, results);
            let hasFace = false;
            let confidence = 0;
            if (
              results &&
              results.detections &&
              results.detections.length > 0
            ) {
              hasFace = true;
              confidence = 0.8;
              const detection = results.detections[0];
              if (
                detection.score &&
                Array.isArray(detection.score) &&
                detection.score.length > 0
              ) {
                confidence = detection.score[0];
              } else if (
                detection.score &&
                typeof detection.score === "number"
              ) {
                confidence = detection.score;
              }
            }
            logDebug(`🔗 REAL Face Detection Hook - ${deviceId}:`, {
              hasFace,
              confidence,
              faces: results?.detections?.length || 0,
            });
            processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
            return result;
          };
          logDebug(
            "✅ processFaceDetectionResults Hook installiert (MAIN INTEGRATION)"
          );
        }
        if (typeof window.notifyFaceDetectionChange === "function") {
          const originalNotify = window.notifyFaceDetectionChange;
          window.notifyFaceDetectionChange = function (
            deviceId,
            hasFace,
            confidence
          ) {
            logDebug(`🔔 REAL notifyFaceDetectionChange - ${deviceId}:`, {
              hasFace,
              confidence,
            });
            processFaceDetectionForAutoSwitch(
              deviceId,
              hasFace,
              confidence || (hasFace ? 0.8 : 0)
            );
            return originalNotify.call(this, deviceId, hasFace, confidence);
          };
          logDebug("✅ notifyFaceDetectionChange Hook installiert (SECONDARY)");
        } else {
          window.notifyFaceDetectionChange = function (
            deviceId,
            hasFace,
            confidence
          ) {
            logDebug(`🔔 NEW notifyFaceDetectionChange - ${deviceId}:`, {
              hasFace,
              confidence,
            });
            processFaceDetectionForAutoSwitch(
              deviceId,
              hasFace,
              confidence || (hasFace ? 0.8 : 0)
            );
          };
          logDebug("✅ notifyFaceDetectionChange erstellt (NEW)");
        }
        if (window.faceDetectionSystem?._processFaceDetection) {
          const originalProcessor =
            window.faceDetectionSystem._processFaceDetection;
          window.faceDetectionSystem._processFaceDetection = function (
            deviceId,
            hasFace,
            confidence
          ) {
            const result = originalProcessor.call(
              this,
              deviceId,
              hasFace,
              confidence
            );
            logDebug(`🎭 faceDetectionSystem Hook - ${deviceId}:`, {
              hasFace,
              confidence,
            });
            processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
            return result;
          };
          logDebug("✅ faceDetectionSystem Hook installiert (TERTIARY)");
        }
      }
    }, 500);
    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  function hookIntoNotifyFaceDetectionChange() {
    if (typeof window.notifyFaceDetectionChange === "function") {
      const originalNotify = window.notifyFaceDetectionChange;
      window.notifyFaceDetectionChange = function (
        deviceId,
        hasFace,
        confidence
      ) {
        const result = originalNotify.call(this, deviceId, hasFace, confidence);
        logDebug(`🔔 notifyFaceDetectionChange Hook - ${deviceId}:`, {
          hasFace,
          confidence,
        });
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
        return result;
      };
      logDebug("✅ notifyFaceDetectionChange Hook installiert");
    }
  }

  function setupPollingIntegration() {
    setInterval(() => {
      if (window.faceDetectionStates) {
        window.faceDetectionStates.forEach((state, deviceId) => {
          const lastUpdate = state.lastUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;
          if (timeSinceUpdate < 1000) {
            const lastProcessed =
              autoCameraSwitching.faceStates.get(deviceId)?.lastUpdate || 0;
            if (lastUpdate > lastProcessed) {
              logDebug(`🔄 Polling Face Detection State - ${deviceId}:`, {
                hasFace: state.hasFace,
                confidence: state.confidence,
              });
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
    logDebug("✅ Polling Integration aktiviert (Fallback)");
  }

  function setupDirectBridgeIntegration() {
    logDebug("🔗 Setting up Direct Bridge Integration...");
    window.processFaceDetectionForAutoSwitch = function (
      deviceId,
      hasFace,
      confidence
    ) {
      logDebug(
        `🌉 Direct Bridge Call: ${deviceId} = ${hasFace} (${confidence})`
      );
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    };
    window.notifyAutoSwitchFaceDetection = function (
      deviceId,
      hasFace,
      confidence,
      metadata = {}
    ) {
      logDebug(`🌉 Enhanced Bridge Call: ${deviceId} = ${hasFace}`, {
        confidence,
        metadata,
      });
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    };
    logDebug("✅ Direct Bridge Integration completed");
  }

  function integrateWithManualControls() {
    logDebug("🖱️ Setting up Enhanced Manual Controls Integration...");
    document.addEventListener("click", (event) => {
      const target = event.target;
      const buttonSelectors = [
        "[data-device-camera]",
        ".camera-switch-btn",
        ".device-camera-btn",
        "#take-camera",
        "[id*='camera']",
        "[onclick*='camera']",
        "[data-device]",
      ];
      let isManualCameraControl = false;
      for (const selector of buttonSelectors) {
        if (target.matches(selector) || target.closest(selector)) {
          isManualCameraControl = true;
          break;
        }
      }
      if (isManualCameraControl) {
        logDebug(
          "🖱️ Enhanced manual camera switch detected - aktiviere Override"
        );
        setManualOverride();
        const deviceId =
          target.dataset?.device ||
          target.dataset?.deviceId ||
          target.closest("[data-device]")?.dataset?.device;
        if (deviceId) {
          logDebug(`🎯 Manual switch target detected: ${deviceId}`);
          if (autoCameraSwitching) {
            autoCameraSwitching.currentControllingDevice = deviceId;
          }
        }
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key >= "1" && event.key <= "9") {
        logDebug(`⌨️ Keyboard camera switch detected: Ctrl+${event.key}`);
        setManualOverride();
      }
    });
    logDebug("🔗 Enhanced Manual Controls Integration abgeschlossen");
  }

  function debugIntegrationStatus() {
    logDebug("🔍 =================================");
    logDebug("🔍 AUTO-SWITCH INTEGRATION STATUS");
    logDebug("🔍 =================================");
    logDebug("🎭 Face Detection Systems:");
    logDebug("  window.faceDetectionSystem:", !!window.faceDetectionSystem);
    logDebug("  window.faceDetectionStates:", !!window.faceDetectionStates);
    logDebug("  window.enhancedRoomSystem:", !!window.enhancedRoomSystem);
    logDebug(
      "  window.enhancedRoomSystem.faceDetectionManager:",
      !!window.enhancedRoomSystem?.faceDetectionManager
    );
    logDebug("🔗 Integration Functions:");
    logDebug(
      "  window.processFaceDetectionResults:",
      typeof window.processFaceDetectionResults
    );
    logDebug(
      "  window.notifyFaceDetectionChange:",
      typeof window.notifyFaceDetectionChange
    );
    logDebug(
      "  window.processFaceDetectionForAutoSwitch:",
      typeof window.processFaceDetectionForAutoSwitch
    );
    logDebug(
      "  window.notifyAutoSwitchFaceDetection:",
      typeof window.notifyAutoSwitchFaceDetection
    );
    logDebug("🏠 Room System:");
    logDebug("  window.roomState:", !!window.roomState);
    logDebug("  window.frameLink:", !!window.frameLink);
    logDebug("  window.frameLink.api:", !!window.frameLink?.api);
    logDebug("  window.frameLink.events:", !!window.frameLink?.events);
    logDebug("📡 Communication:");
    logDebug("  window.socket:", !!window.socket);
    logDebug("  socket.readyState:", window.socket?.readyState);
    logDebug(
      "  frameLink.api.sendMessage:",
      typeof window.frameLink?.api?.sendMessage
    );
    logDebug("🤖 Auto-Switch State:");
    logDebug("  autoCameraSwitching.enabled:", autoCameraSwitching?.enabled);
    logDebug("  autoCameraSwitching.isActive:", autoCameraSwitching?.isActive);
    logDebug(
      "  autoCameraSwitching.currentControllingDevice:",
      autoCameraSwitching?.currentControllingDevice
    );
    logDebug("🔍 =================================");
  }

  function testAutoSwitchIntegration() {
    logDebug("🧪 =================================");
    logDebug("🧪 TESTING AUTO-SWITCH INTEGRATION");
    logDebug("🧪 =================================");
    try {
      logDebug("🧪 Test 1: Basic processFaceDetectionForAutoSwitch call");
      processFaceDetectionForAutoSwitch("test-device-1", true, 0.85);
      logDebug("✅ Test 1 passed");
    } catch (error) {
      logDebug("❌ Test 1 failed:", error.message);
    }
    try {
      logDebug("🧪 Test 2: Global bridge functions");
      if (window.notifyAutoSwitchFaceDetection) {
        window.notifyAutoSwitchFaceDetection("test-device-2", true, 0.9);
        logDebug("✅ Test 2 passed");
      } else {
        logDebug(
          "❌ Test 2 failed: notifyAutoSwitchFaceDetection not available"
        );
      }
    } catch (error) {
      logDebug("❌ Test 2 failed:", error.message);
    }
    try {
      logDebug("🧪 Test 3: FrameLink events");
      if (window.frameLink?.events) {
        window.frameLink.events.dispatchEvent(
          new CustomEvent("face-detection-change", {
            detail: {
              deviceId: "test-device-3",
              hasFace: true,
              confidence: 0.75,
            },
          })
        );
        logDebug("✅ Test 3 passed");
      } else {
        logDebug("❌ Test 3 failed: frameLink.events not available");
      }
    } catch (error) {
      logDebug("❌ Test 3 failed:", error.message);
    }
    try {
      logDebug("🧪 Test 4: Camera switch execution");
      executeIntegratedCameraSwitch("test-device-4", { test: true });
      logDebug("✅ Test 4 passed");
    } catch (error) {
      logDebug("❌ Test 4 failed:", error.message);
    }
    logDebug("🧪 =================================");
  }

  // ========================================
  // UTILITIES & LOGGING
  // ========================================

  function logDebug(message, data = null) {
    if (!AUTO_SWITCH_CONFIG.enableLogging) return;

    // 🔴 ENHANCED ANTI-SPAM: Rate limiting for repeated messages
    const now = Date.now();
    const RATE_LIMIT_MS = 3000; // 3 Sekunden zwischen gleichen Nachrichten

    // Create message hash (remove dynamic parts)
    const msgHash = message
      .replace(/\d{2}:\d{2}:\d{2}/g, "")
      .replace(/conf=\d+\.\d+/g, "conf=X.XX")
      .replace(/\d+ms/g, "Xms")
      .replace(/\d+\.\d+/g, "X.X");

    // Check rate limit
    if (!logDebug._lastLogged) logDebug._lastLogged = new Map();

    if (logDebug._lastLogged.has(msgHash)) {
      const lastTime = logDebug._lastLogged.get(msgHash);
      if (now - lastTime < RATE_LIMIT_MS) {
        return; // Skip - too soon
      }
    }

    // Update last logged time
    logDebug._lastLogged.set(msgHash, now);

    // Clean old entries periodically
    if (logDebug._lastLogged.size > 100) {
      const oldEntries = Array.from(logDebug._lastLogged.entries()).filter(
        ([_, time]) => now - time > RATE_LIMIT_MS * 5
      );
      oldEntries.forEach(([key]) => logDebug._lastLogged.delete(key));
    }

    // 🔴 ANTI-SPAM: Skip frequent messages
    const spamPatterns = [
      /Face State Update/i,
      /Warte auf stabile/i,
      /Switch Score/i,
      /evaluiere Alternative/i,
      /Hysterese aktiv/i,
      /Hook.*wechsle Kontrolle/i,
    ];

    if (spamPatterns.some((pattern) => pattern.test(message))) {
      return; // Skip these messages
    }
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
