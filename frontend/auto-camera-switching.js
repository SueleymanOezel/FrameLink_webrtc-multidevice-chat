/**
 * 🚀 AUTOMATIC CAMERA SWITCHING SYSTEM
 *
 * Intelligente Kamera-Umschaltung basierend auf Face Detection
 * Integriert nahtlos mit bestehender simple-room.js Infrastruktur
 */

(function () {
  "use strict";

  // ========================================
  // KONFIGURATION
  // ========================================

  const AUTO_SWITCH_CONFIG = {
    // Hysterese Settings (verhindert schnelles Hin- und Herschalten)
    hysteresisDelay: 2000, // ms - Mindestabstand zwischen Switches
    faceDetectionThreshold: 0.6, // Minimum confidence für Switch
    stabilityPeriod: 1500, // ms - Gesicht muss stabil erkannt werden

    // Priority System
    confidenceBonus: 0.2, // Bonus für höhere Confidence
    currentCameraBonus: 0.1, // Bonus für aktuell aktive Kamera (Anti-Flicker)

    // Safety & Fallback
    maxSwitchesPerMinute: 5, // Rate limiting
    autoSwitchTimeout: 30000, // ms - Auto-switch timeout
    manualOverrideTime: 10000, // ms - Manuelle Übersteuerung gilt für

    // Debug
    enableLogging: true,
    enableVisualFeedback: true,
  };

  // ========================================
  // STATE MANAGEMENT
  // ========================================

  let autoCameraSwitching = {
    // Core State
    enabled: true,
    isActive: false,
    currentControllingDevice: null,

    // Hysterese & Timing
    lastSwitchTime: 0,
    pendingSwitches: new Map(), // deviceId -> { timestamp, confidence, stable }
    switchHistory: [], // für rate limiting

    // Manual Override
    manualOverrideUntil: 0,
    wasManuallyOverridden: false,

    // Face Detection States (erweitert die bestehenden)
    faceStates: new Map(), // deviceId -> enhanced face state

    // Integration mit bestehendem System
    originalCameraHandler: null,
    roomSystem: null,

    // Debug & Analytics
    switchCount: 0,
    debugLogs: [],
  };

  // ========================================
  // FACE DETECTION DECISION ENGINE
  // ========================================

  /**
   * Haupt-Decision Engine für automatische Kamera-Umschaltung
   */
  function processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence) {
    if (!autoCameraSwitching.enabled) return;

    // Manual Override Check
    if (isManualOverrideActive()) {
      logDebug(
        `🛑 Manual override aktiv - ignoriere Auto-Switch für ${deviceId}`
      );
      return;
    }

    // Update Face State
    updateEnhancedFaceState(deviceId, hasFace, confidence);

    // Decision Logic
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      evaluateSwitchToDevice(deviceId, confidence);
    } else if (
      !hasFace &&
      autoCameraSwitching.currentControllingDevice === deviceId
    ) {
      evaluateSwitchAway(deviceId);
    }

    // Cleanup alte pending switches
    cleanupPendingSwitches();
  }

  /**
   * Enhanced Face State Management
   */
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
      autoCameraSwitching.faceStates.set(deviceId, state);
    }

    // Update State
    const previousHasFace = state.hasFace;
    state.hasFace = hasFace;
    state.confidence = confidence;
    state.lastUpdate = currentTime;

    // Stability Tracking
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      if (!previousHasFace) {
        // Neue Gesichtserkennung gestartet
        state.stableDetectionStart = currentTime;
        state.consecutiveDetections = 1;
        state.averageConfidence = confidence;
      } else {
        // Fortlaufende Erkennung
        state.consecutiveDetections++;
        state.averageConfidence = (state.averageConfidence + confidence) / 2;
      }

      // Stability Check
      const detectionDuration =
        currentTime - (state.stableDetectionStart || currentTime);
      state.isStable = detectionDuration >= AUTO_SWITCH_CONFIG.stabilityPeriod;
    } else {
      // Kein Gesicht oder zu niedrige Confidence
      state.stableDetectionStart = null;
      state.consecutiveDetections = 0;
      state.isStable = false;
    }

    logDebug(`📊 Face State Update - ${deviceId}:`, {
      hasFace,
      confidence: confidence.toFixed(2),
      isStable: state.isStable,
      consecutive: state.consecutiveDetections,
    });
  }

  /**
   * Evaluiert Switch TO einem Device
   */
  function evaluateSwitchToDevice(deviceId, confidence) {
    const currentTime = Date.now();
    const state = autoCameraSwitching.faceStates.get(deviceId);

    // Pre-checks
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

    // Calculate Switch Priority Score
    const switchScore = calculateSwitchScore(deviceId, confidence);
    const currentScore = getCurrentDeviceScore();

    logDebug(
      `🧮 Switch Score für ${deviceId}: ${switchScore.toFixed(2)} vs Current: ${currentScore.toFixed(2)}`
    );

    // Decision: Should we switch?
    if (switchScore > currentScore + 0.1) {
      // 0.1 = switch threshold
      requestAutomaticCameraSwitch(deviceId, confidence, switchScore);
    }
  }

  /**
   * Evaluiert Switch AWAY von einem Device
   */
  function evaluateSwitchAway(deviceId) {
    logDebug(`👻 ${deviceId} verliert Gesicht - evaluiere Alternative`);

    // Finde beste Alternative
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

  /**
   * Berechnet Switch Priority Score für Device
   */
  function calculateSwitchScore(deviceId, confidence) {
    let score = confidence;

    // Confidence Bonus
    if (confidence > 0.8) {
      score += AUTO_SWITCH_CONFIG.confidenceBonus;
    }

    // Current Camera Bonus (Anti-Flicker)
    if (autoCameraSwitching.currentControllingDevice === deviceId) {
      score += AUTO_SWITCH_CONFIG.currentCameraBonus;
    }

    // Stability Bonus
    const state = autoCameraSwitching.faceStates.get(deviceId);
    if (state && state.consecutiveDetections > 3) {
      score += 0.1;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Aktueller Device Score (für Vergleich)
   */
  function getCurrentDeviceScore() {
    const currentDevice = autoCameraSwitching.currentControllingDevice;
    if (!currentDevice) return 0;

    const state = autoCameraSwitching.faceStates.get(currentDevice);
    if (!state || !state.hasFace) return 0;

    return calculateSwitchScore(currentDevice, state.confidence);
  }

  /**
   * Findet beste Alternative zu aktuellem Device
   */
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
      (time) => now - time < 60000 // Letzte Minute
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

  /**
   * Führt automatischen Kamera-Switch aus
   */
  function requestAutomaticCameraSwitch(deviceId, confidence, score) {
    const currentTime = Date.now();

    logDebug(`🚀 Führe automatischen Switch aus:`, {
      from: autoCameraSwitching.currentControllingDevice || "none",
      to: deviceId,
      confidence: confidence.toFixed(2),
      score: score.toFixed(2),
    });

    // Update State
    autoCameraSwitching.lastSwitchTime = currentTime;
    autoCameraSwitching.currentControllingDevice = deviceId;
    autoCameraSwitching.switchCount++;
    autoCameraSwitching.switchHistory.push(currentTime);

    // Keep only recent switch history
    autoCameraSwitching.switchHistory =
      autoCameraSwitching.switchHistory.filter(
        (time) => currentTime - time < 60000
      );

    // Integration mit bestehendem Camera System
    executeIntegratedCameraSwitch(deviceId, {
      reason: "face-detection",
      confidence,
      score,
      automatic: true,
    });

    // Visual Feedback
    if (AUTO_SWITCH_CONFIG.enableVisualFeedback) {
      showCameraSwitchFeedback(deviceId, confidence);
    }

    // Event für andere Systeme
    dispatchCameraSwitchEvent(deviceId, "automatic");
  }

  /**
   * Integration mit bestehendem simple-room.js Camera System
   */
  function executeIntegratedCameraSwitch(deviceId, metadata = {}) {
    try {
      // Suche bestehende Camera-Control Funktion
      if (window.roomSystem && window.roomSystem.switchCameraTo) {
        logDebug(`🔗 Nutze roomSystem.switchCameraTo für ${deviceId}`);
        window.roomSystem.switchCameraTo(deviceId, metadata);
      } else if (window.switchCamera) {
        logDebug(`🔗 Nutze globale switchCamera für ${deviceId}`);
        window.switchCamera(deviceId);
      } else {
        // Fallback: WebSocket Message senden
        logDebug(`📡 Fallback: Sende WebSocket Camera Switch für ${deviceId}`);
        sendCameraSwitchMessage(deviceId, metadata);
      }
    } catch (error) {
      console.error("❌ Camera Switch Integration Error:", error);
    }
  }

  /**
   * WebSocket Camera Switch Message (Fallback)
   */
  function sendCameraSwitchMessage(deviceId, metadata = {}) {
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      const message = {
        type: "camera-switch-request",
        targetDevice: deviceId,
        requestingDevice: window.roomSystem?.localDeviceId || "unknown",
        metadata: {
          ...metadata,
          timestamp: Date.now(),
          automatic: true,
        },
      };

      window.socket.send(JSON.stringify(message));
      logDebug(`📤 Camera Switch Message gesendet:`, message);
    }
  }

  // ========================================
  // VISUAL FEEDBACK & EVENTS
  // ========================================

  function showCameraSwitchFeedback(deviceId, confidence) {
    // UI Feedback (toast-style notification)
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

    // CSS Animation
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

    // Auto-remove after 3 seconds
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

  /**
   * Setzt Manual Override (z.B. wenn User manuell switcht)
   */
  function setManualOverride(duration = AUTO_SWITCH_CONFIG.manualOverrideTime) {
    autoCameraSwitching.manualOverrideUntil = Date.now() + duration;
    autoCameraSwitching.wasManuallyOverridden = true;

    logDebug(`🛑 Manual Override aktiviert für ${duration}ms`);
  }

  /**
   * Public API für externe Kontrolle
   */
  window.autoCameraSwitching = {
    // Status & Control
    isEnabled: () => autoCameraSwitching.enabled,
    enable: () => {
      autoCameraSwitching.enabled = true;
      logDebug("✅ Automatic Camera Switching aktiviert");
    },
    disable: () => {
      autoCameraSwitching.enabled = false;
      logDebug("🔇 Automatic Camera Switching deaktiviert");
    },

    // Manual Override
    setManualOverride,
    clearManualOverride: () => {
      autoCameraSwitching.manualOverrideUntil = 0;
      logDebug("🔓 Manual Override aufgehoben");
    },

    // Status Information
    getStatus: () => ({
      enabled: autoCameraSwitching.enabled,
      active: autoCameraSwitching.isActive,
      currentDevice: autoCameraSwitching.currentControllingDevice,
      manualOverride: isManualOverrideActive(),
      switchCount: autoCameraSwitching.switchCount,
      faceStates: Object.fromEntries(autoCameraSwitching.faceStates),
    }),

    // Configuration
    updateConfig: (newConfig) => {
      Object.assign(AUTO_SWITCH_CONFIG, newConfig);
      logDebug("⚙️ Configuration updated:", newConfig);
    },

    // Debug
    debug: {
      showStates: () => {
        console.table(Object.fromEntries(autoCameraSwitching.faceStates));
      },
      getHistory: () => autoCameraSwitching.switchHistory,
      clearHistory: () => {
        autoCameraSwitching.switchHistory = [];
        autoCameraSwitching.switchCount = 0;
      },
    },

    // Internal (für Integration)
    _processFaceDetection: processFaceDetectionForAutoSwitch,
  };

  // ========================================
  // INTEGRATION & INITIALIZATION
  // ========================================

  /**
   * Integriert mit bestehendem Face Detection System
   */
  function integrateWithFaceDetection() {
    // Hook in Face Detection Events
    window.addEventListener("face-detection-update", (event) => {
      const { deviceId, hasFace, confidence } = event.detail;
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    });

    // Hook in bestehende Face Detection, falls verfügbar
    if (
      window.faceDetectionSystem &&
      window.faceDetectionSystem._processFaceDetection
    ) {
      const originalProcessor =
        window.faceDetectionSystem._processFaceDetection;
      window.faceDetectionSystem._processFaceDetection = function (
        deviceId,
        hasFace,
        confidence
      ) {
        // Original Face Detection
        originalProcessor.call(this, deviceId, hasFace, confidence);

        // Automatic Camera Switching
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
      };
    }

    logDebug("🔗 Face Detection Integration abgeschlossen");
  }

  /**
   * Integriert mit Manual Camera Controls (für Override Detection)
   */
  function integrateWithManualControls() {
    // Hook bestehende Camera Control Buttons
    document.addEventListener("click", (event) => {
      const target = event.target;

      // Erkenne manuelle Camera Switch Buttons
      if (
        target.matches(
          "[data-device-camera], .camera-switch-btn, .device-camera-btn"
        ) ||
        target.closest(
          "[data-device-camera], .camera-switch-btn, .device-camera-btn"
        )
      ) {
        logDebug("🖱️ Manueller Camera Switch erkannt - aktiviere Override");
        setManualOverride();
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

    // Keep only last 100 entries
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

  function initializeAutoCameraSwitching() {
    logDebug("🚀 Initialisiere Automatic Camera Switching System...");

    // Warte bis DOM und andere Systeme bereit sind
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(delayedInitialization, 1000);
      });
    } else {
      setTimeout(delayedInitialization, 1000);
    }
  }

  function delayedInitialization() {
    // Integration mit bestehenden Systemen
    integrateWithFaceDetection();
    integrateWithManualControls();

    // System als aktiv markieren
    autoCameraSwitching.isActive = true;

    logDebug("✅ Automatic Camera Switching System bereit!");
    logDebug("📊 Configuration:", AUTO_SWITCH_CONFIG);

    // Welcome Message
    console.log("🚀 AUTOMATIC CAMERA SWITCHING SYSTEM ACTIVATED! 🚀");
    console.log("📱 Nutze window.autoCameraSwitching für Kontrolle");
    console.log(
      "🎛️ Verfügbare Commands: enable(), disable(), getStatus(), debug.showStates()"
    );
  }

  // Start das System
  initializeAutoCameraSwitching();
})();
