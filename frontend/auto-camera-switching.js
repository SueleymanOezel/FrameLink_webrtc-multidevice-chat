/**
 * 🚀 AUTOMATIC CAMERA SWITCHING SYSTEM
 * Intelligente Kamera‑Umschaltung basierend auf Face Detection
 * Integriert nahtlos mit bestehender simple‑room.js Infrastruktur
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
    currentControllingDevice: null,
    lastSwitchTime: 0,
    switchHistory: [],
    manualOverrideUntil: 0,
    faceStates: new Map(),
    switchCount: 0,
  };

  // ========================================
  // FACE DETECTION DECISION ENGINE
  // ========================================
  const detectionTimers = new Map();

  function processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence) {
    if (!autoCameraSwitching.enabled) return;

    // Manual override check
    if (Date.now() < autoCameraSwitching.manualOverrideUntil) return;

    // Load or init state
    let state = autoCameraSwitching.faceStates.get(deviceId) || {
      hasFace: false,
      confidence: 0,
      previousConfidence: 0,
      isStable: false,
      stableStart: null,
      consecutive: 0,
    };
    const now = Date.now();

    // Stability window
    if (hasFace && confidence >= AUTO_SWITCH_CONFIG.faceDetectionThreshold) {
      state.consecutive++;
      if (!state.stableStart) state.stableStart = now;
      state.isStable =
        state.consecutive >= 3 &&
        now - state.stableStart >= AUTO_SWITCH_CONFIG.stabilityPeriod;
    } else {
      state.consecutive = 0;
      state.stableStart = null;
      state.isStable = false;
    }

    // Update
    state.hasFace = hasFace;
    state.previousConfidence = state.confidence;
    state.confidence = confidence;
    autoCameraSwitching.faceStates.set(deviceId, state);

    // When stable, decide switch
    if (state.isStable) {
      // compute score
      const delta = state.confidence - state.previousConfidence;
      const bonus =
        state.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0;
      const score = delta + bonus;
      // find best
      let bestId = deviceId,
        bestScore = score;
      autoCameraSwitching.faceStates.forEach((o, id) => {
        if (id === deviceId || !o.isStable) return;
        const d = o.confidence - o.previousConfidence;
        const b = o.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0;
        const s = d + b;
        if (s > bestScore) {
          bestId = id;
          bestScore = s;
        }
      });
      // perform switch if needed
      if (
        bestId !== autoCameraSwitching.currentControllingDevice &&
        bestScore > 0.1
      ) {
        autoCameraSwitching.currentControllingDevice = bestId;
        requestAutomaticCameraSwitch(bestId, state.confidence, bestScore);
      }
    } else if (
      !hasFace &&
      autoCameraSwitching.currentControllingDevice === deviceId
    ) {
      // face lost: try switch away
      const alts = findBestAlternativeDevice();
      if (alts.length) {
        autoCameraSwitching.currentControllingDevice = alts[0].deviceId;
        requestAutomaticCameraSwitch(
          alts[0].deviceId,
          alts[0].confidence,
          alts[0].score
        );
      }
    }
  }

  function findBestAlternativeDevice() {
    const arr = [];
    autoCameraSwitching.faceStates.forEach((st, id) => {
      if (id === autoCameraSwitching.currentControllingDevice) return;
      if (!st.isStable) return;
      const delta = st.confidence - st.previousConfidence;
      const bonus =
        st.confidence > 0.8 ? AUTO_SWITCH_CONFIG.confidenceBonus : 0;
      const score = delta + bonus;
      arr.push({ deviceId: id, confidence: st.confidence, score });
    });
    return arr.sort((a, b) => b.score - a.score);
  }

  // ========================================
  // CAMERA SWITCH REQUEST
  // ========================================
  function requestAutomaticCameraSwitch(deviceId, confidence, score) {
    logDebug(
      `[Auto-Switch] Switching to ${deviceId} (score=${score.toFixed(2)})`
    );
    autoCameraSwitching.lastSwitchTime = Date.now();
    autoCameraSwitching.switchHistory.push(Date.now());
    autoCameraSwitching.switchCount++;
    // use integrated switch
    executeIntegratedCameraSwitch(deviceId, {
      reason: "face-detection-auto-switch",
      confidence,
      score,
    });
    if (AUTO_SWITCH_CONFIG.enableVisualFeedback) {
      showCameraSwitchFeedback(deviceId, confidence);
    }
    dispatchCameraSwitchEvent(deviceId, "automatic");
  }

  // ========================================
  // INTEGRATION: frameLink & WebSocket
  // ========================================
  function executeIntegratedCameraSwitch(deviceId, metadata = {}) {
    try {
      const roomId =
        window.roomState?.roomId || window.multiDeviceRoom?.roomId || null;
      const fromDeviceId =
        window.roomState?.deviceId || window.multiDeviceRoom?.deviceId || null;
      if (!roomId || !fromDeviceId) return;

      const msg = {
        type: "camera-request",
        roomId,
        deviceId,
        fromDeviceId,
        metadata: {
          ...metadata,
          automatic: true,
          timestamp: Date.now(),
        },
      };

      if (window.frameLink?.api?.sendMessage) {
        window.frameLink.api.sendMessage("camera-request", msg);
        logDebug("📤 frameLink camera-request:", msg);
      } else if (window.socket?.readyState === WebSocket.OPEN) {
        window.socket.send(JSON.stringify(msg));
        logDebug("📤 WS camera-request fallback:", msg);
      } else {
        logDebug("❌ No sendMessage or socket available");
      }
    } catch (err) {
      logDebug("❌ executeIntegratedCameraSwitch error:", err);
    }
  }

  function enhanceWebSocketIntegration() {
    if (!window.socket) {
      return setTimeout(enhanceWebSocketIntegration, 500);
    }
    const orig = window.socket.onmessage;
    window.socket.onmessage = async (e) => {
      orig?.call(window.socket, e);
      try {
        let d = e.data;
        if (d instanceof Blob) d = await d.text();
        const m = JSON.parse(d);
        if (m.type === "face-detection-update") {
          const id = m.targetDeviceId || m.fromDeviceId;
          processFaceDetectionForAutoSwitch(
            id,
            !!m.hasFace,
            parseFloat(m.confidence) || 0.8
          );
        }
      } catch {}
    };
  }

  // ========================================
  // VISUAL FEEDBACK & EVENTS
  // ========================================
  function showCameraSwitchFeedback(deviceId, confidence) {
    const fb = document.createElement("div");
    fb.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: rgba(0,0,0,0.7); color: #fff;
      padding: 8px 12px; border-radius: 6px;
      font-size: 14px; z-index: 10000;
    `;
    fb.textContent = `🎥 Auto‑Switch → ${deviceId} (${(confidence * 100).toFixed(0)}%)`;
    document.body.appendChild(fb);
    setTimeout(() => fb.remove(), 3000);
  }

  function dispatchCameraSwitchEvent(deviceId, type) {
    const ev = new CustomEvent("camera-auto-switch", {
      detail: {
        deviceId,
        type,
        timestamp: Date.now(),
        confidence:
          autoCameraSwitching.faceStates.get(deviceId)?.confidence || 0,
      },
    });
    window.dispatchEvent(ev);
    logDebug("📢 Dispatched camera-auto-switch:", ev.detail);
  }

  // ========================================
  // INITIALIZATION SEQUENCE
  // ========================================
  function initializeCompleteIntegrationFix() {
    window.faceDetectionStates = new Map();
    enhanceWebSocketIntegration();
    logDebug("✅ COMPLETE INTEGRATION FIX initialized");
  }

  function waitForWebSocket(cb, tries = 0) {
    if (window.socket?.readyState === WebSocket.OPEN) {
      cb();
    } else if (tries < 10) {
      setTimeout(() => waitForWebSocket(cb, tries + 1), 500);
    } else {
      cb();
    }
  }

  window.addEventListener("load", () => {
    // Hook into face detection events
    window.addEventListener("face-detection-update", (e) => {
      const { deviceId, hasFace, confidence } = e.detail;
      processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
    });
    if (window.frameLink?.events) {
      window.frameLink.events.addEventListener("face-detection-change", (e) => {
        const { deviceId, hasFace, confidence } = e.detail;
        processFaceDetectionForAutoSwitch(deviceId, hasFace, confidence);
      });
    }

    // Start integration fix after WS is ready
    waitForWebSocket(initializeCompleteIntegrationFix);

    // Configure visual/manual settings
    setTimeout(() => {
      autoCameraSwitching.enabled = true;
      logDebug("⚙️ Auto‑Switch enabled with config:", AUTO_SWITCH_CONFIG);
    }, 1000);
  });
})();

// ─── FALLBACK DEBUG & HELPERS ─────────────────────────────────
function logDebug(...args) {
  if (window.frameLink?.log) frameLink.log("[AutoSwitch]", ...args);
  else console.log("[AutoSwitch]", ...args);
}

// ─── DEVICE ID & CONFIDENCE FIXES ────────────────────────────
function fixDeviceIdMapping() {
  if (!window.canvasDeviceMap) window.canvasDeviceMap = new WeakMap();
  const orig = window.createDetectionCanvas;
  window.createDetectionCanvas = function (id) {
    const c = (orig && orig.call(this, id)) || document.createElement("canvas");
    c.dataset.deviceId = id;
    window.canvasDeviceMap.set(c, id);
    return c;
  };
  const onRes = window.faceDetectionSystem?.onResults;
  if (onRes) {
    window.faceDetectionSystem.onResults = function (res) {
      if (res.image) {
        res._deviceId =
          window.canvasDeviceMap.get(res.image) || res.image.dataset.deviceId;
      }
      return onRes.call(this, res);
    };
  }
}

function fixConfidenceScore() {
  const proc = window.processFaceDetectionResults;
  if (typeof proc === "function") {
    window.processFaceDetectionResults = function (deviceId, results) {
      let conf = 0.8;
      try {
        const d = results.detections?.[0];
        if (d) conf = d.confidence ?? d.score?.[0] ?? conf;
      } catch {}
      return proc.call(this, deviceId, { ...results, _fixedConfidence: conf });
    };
  }
}

// fixes aktivieren
window.addEventListener("load", () => {
  fixDeviceIdMapping();
  fixConfidenceScore();
});
