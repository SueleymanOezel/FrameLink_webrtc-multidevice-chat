// ================================================================
// PERMANENT INTEGRATION FIX - Auto-Switch Integration
// ================================================================
// Version: 1.0 - Stable
// Löst: Face Detection → Auto-Switch → Camera Switch Integration
// ================================================================

// Wait for all systems to be ready
window.addEventListener("load", () => {
  console.log("🔧 Permanent Integration Fix wird geladen...");

  // Delay to ensure all other scripts are loaded
  setTimeout(initializePermanentIntegration, 2000);
});

function initializePermanentIntegration() {
  console.log("🚀 PERMANENT AUTO-SWITCH INTEGRATION wird installiert...");

  // ================================================================
  // 1. WEBSOCKET FACE DETECTION HOOK (HAUPTINTEGRATION)
  // ================================================================

  function installWebSocketHook() {
    if (!window.socket || !window.autoCameraSwitching) {
      console.log("⏳ Warte auf Socket und Auto-Switch System...");
      setTimeout(installWebSocketHook, 1000);
      return;
    }

    console.log("🔗 Installiere WebSocket Face Detection Hook...");

    // Store original handler
    if (!window._originalSocketHandler) {
      window._originalSocketHandler = window.socket.onmessage;
    }

    // Enhanced WebSocket handler
    window.socket.onmessage = async function (event) {
      // Call original handler first
      if (window._originalSocketHandler) {
        try {
          window._originalSocketHandler.call(this, event);
        } catch (error) {
          // Ignore errors from original
        }
      }

      // Face Detection Event Processing
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();

        const message = JSON.parse(data);

        // Hook face-detection-update events
        if (message.type === "face-detection-update") {
          const deviceId = message.targetDeviceId || message.fromDeviceId;
          const hasFace = message.hasFace;
          const confidence = parseFloat(message.confidence) || 0;

          // Rate limiting
          const now = Date.now();
          const key = `${deviceId}_${hasFace}`;
          window._lastFaceEvent = window._lastFaceEvent || {};

          if (
            !window._lastFaceEvent[key] ||
            now - window._lastFaceEvent[key] > 500
          ) {
            console.log(
              `🔗 WebSocket Hook: Face Detection → Auto-Switch (${deviceId})`,
              {
                hasFace,
                confidence,
              }
            );

            // Trigger Auto-Switch
            if (window.autoCameraSwitching?._processFaceDetection) {
              window.autoCameraSwitching._processFaceDetection(
                deviceId,
                hasFace,
                confidence
              );
              window._lastFaceEvent[key] = now;
            }
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    };

    console.log("✅ WebSocket Face Detection Hook installiert");
  }

  // ================================================================
  // 2. BACKUP HOOKS FÜR DIREKTE FACE DETECTION CALLS
  // ================================================================

  function installBackupHooks() {
    console.log("🔧 Installiere Backup Face Detection Hooks...");

    // Hook 1: processFaceDetectionResults
    if (typeof window.processFaceDetectionResults === "function") {
      const original = window.processFaceDetectionResults;
      window.processFaceDetectionResults = function (deviceId, results) {
        const result = original.call(this, deviceId, results);

        // Extract face data
        let hasFace = false;
        let confidence = 0;
        if (results?.detections?.length > 0) {
          hasFace = true;
          const detection = results.detections[0];
          confidence = detection.score?.[0] || detection.score || 0.8;

          console.log(
            `🔗 Direct Hook: processFaceDetectionResults (${deviceId})`,
            { hasFace, confidence }
          );

          if (window.autoCameraSwitching?._processFaceDetection) {
            window.autoCameraSwitching._processFaceDetection(
              deviceId,
              hasFace,
              confidence
            );
          }
        }

        return result;
      };
      console.log("✅ processFaceDetectionResults Hook installiert");
    }

    // Hook 2: Safe notifyFaceDetectionChange (ohne Rekursion)
    window.notifyFaceDetectionChange = function (
      deviceId,
      hasFace,
      confidence
    ) {
      console.log(`🔔 Notify Hook: Face Detection (${deviceId})`, {
        hasFace,
        confidence,
      });

      if (window.autoCameraSwitching?._processFaceDetection) {
        window.autoCameraSwitching._processFaceDetection(
          deviceId,
          hasFace,
          confidence || 0.8
        );
      }
    };
    console.log("✅ notifyFaceDetectionChange Hook installiert (safe)");
  }

  // ================================================================
  // 3. CAMERA SWITCH EXECUTION SYSTEM
  // ================================================================

  function installCameraSwitchExecution() {
    console.log("📹 Installiere Camera Switch Execution...");

    window.executeIntegratedCameraSwitch = function (deviceId, metadata = {}) {
      console.log(`🚀 Camera Switch Execution: ${deviceId}`, metadata);

      let success = false;
      let method = "none";

      // Prevent concurrent switches
      if (window._switchInProgress) {
        console.log("⏭️ Switch already in progress");
        return false;
      }
      window._switchInProgress = true;

      try {
        // Method 1: WebSocket camera-request
        if (
          window.socket?.readyState === WebSocket.OPEN &&
          window.multiDeviceRoom?.roomId
        ) {
          const message = {
            type: "camera-request",
            roomId: window.multiDeviceRoom.roomId,
            deviceId: deviceId,
            automatic: metadata.automatic || false,
            timestamp: Date.now(),
          };
          window.socket.send(JSON.stringify(message));
          success = true;
          method = "websocket";
          console.log(`✅ Camera Switch via WebSocket: ${deviceId}`);
        }

        // Method 2: DOM Button fallback
        if (!success) {
          const btn = document.getElementById("take-camera");
          if (btn && !btn.disabled) {
            btn.click();
            success = true;
            method = "dom-click";
            console.log(`✅ Camera Switch via DOM: ${deviceId}`);
          }
        }

        // Visual feedback
        if (success && metadata.automatic) {
          showPermanentToast(deviceId, metadata, method);
        }
      } catch (error) {
        console.error("❌ Camera switch error:", error);
      } finally {
        setTimeout(() => {
          window._switchInProgress = false;
        }, 1000);
      }

      console.log(
        `🎯 Camera Switch: ${success ? "SUCCESS" : "FAILED"} via ${method}`
      );
      return success;
    };

    console.log("✅ Camera Switch Execution installiert");
  }

  // ================================================================
  // 4. VISUAL FEEDBACK SYSTEM
  // ================================================================

  function showPermanentToast(deviceId, metadata, method) {
    if (window._toastActive) return;
    window._toastActive = true;

    const toast = document.createElement("div");
    toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 24px;">🎥</div>
                <div>
                    <strong style="font-size: 16px;">Auto-Switch zu ${deviceId}</strong><br>
                    <small style="opacity: 0.8;">
                        Face detected (${((metadata.confidence || 0.8) * 100).toFixed(0)}%) • 
                        ${method} • ${new Date().toLocaleTimeString()}
                    </small>
                </div>
            </div>
        `;
    toast.style.cssText = `
            position: fixed; 
            top: 120px; 
            right: 20px; 
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); 
            color: white; 
            padding: 16px 20px; 
            border-radius: 12px; 
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            border: 2px solid rgba(255,255,255,0.3);
            min-width: 280px;
            animation: permanentSlideIn 0.5s ease-out;
        `;

    // Add CSS animation
    if (!document.querySelector("#permanentToastStyles")) {
      const style = document.createElement("style");
      style.id = "permanentToastStyles";
      style.textContent = `
                @keyframes permanentSlideIn {
                    0% { transform: translateX(100%) scale(0.8); opacity: 0; }
                    70% { transform: translateX(-10px) scale(1.05); opacity: 1; }
                    100% { transform: translateX(0) scale(1); opacity: 1; }
                }
            `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "all 0.3s ease-out";
      toast.style.transform = "translateX(100%)";
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.remove();
        window._toastActive = false;
      }, 300);
    }, 4000);
  }

  // ================================================================
  // 5. AUTO-SWITCH SYSTEM CONFIGURATION
  // ================================================================

  function configureAutoSwitch() {
    if (!window.autoCameraSwitching) {
      console.log("⏳ Warte auf Auto-Switch System...");
      setTimeout(configureAutoSwitch, 1000);
      return;
    }

    console.log("⚙️ Konfiguriere Auto-Switch System...");

    // Enable system
    if (!window.autoCameraSwitching.isEnabled()) {
      window.autoCameraSwitching.enable();
      console.log("✅ Auto-Switch aktiviert");
    }

    // Clear manual override
    if (window.autoCameraSwitching.clearManualOverride) {
      window.autoCameraSwitching.clearManualOverride();
      console.log("✅ Manual Override gecleart");
    }

    // Optimize configuration
    if (window.autoCameraSwitching.updateConfig) {
      window.autoCameraSwitching.updateConfig({
        hysteresisDelay: 2000, // 2 seconds between switches
        faceDetectionThreshold: 0.6, // 60% confidence minimum
        stabilityPeriod: 1500, // 1.5 seconds stable detection
        maxSwitchesPerMinute: 8, // Max 8 switches per minute
        enableLogging: true,
        enableVisualFeedback: true,
      });
      console.log("✅ Auto-Switch Konfiguration optimiert");
    }

    console.log(
      "📊 Auto-Switch Status:",
      window.autoCameraSwitching.getStatus()
    );
  }

  // ================================================================
  // 6. INITIALIZATION SEQUENCE
  // ================================================================

  // Install all components in sequence
  installWebSocketHook();

  setTimeout(() => {
    installBackupHooks();
  }, 500);

  setTimeout(() => {
    installCameraSwitchExecution();
  }, 1000);

  setTimeout(() => {
    configureAutoSwitch();
  }, 1500);

  // Final confirmation
  setTimeout(() => {
    console.log("🏁 PERMANENT INTEGRATION FIX INSTALLIERT!");
    console.log("✅ Auto-Switch sollte jetzt automatisch funktionieren");
    console.log("🧪 Test: window.testPermanentAutoSwitch()");

    // Install test function
    window.testPermanentAutoSwitch = function (deviceId = "permanent-test") {
      console.log(`🧪 Permanent Auto-Switch Test: ${deviceId}`);

      if (window.autoCameraSwitching?._processFaceDetection) {
        window.autoCameraSwitching._processFaceDetection(deviceId, true, 0.85);
        console.log("✅ Permanent Test ausgeführt");
      } else {
        console.error("❌ Auto-Switch nicht verfügbar");
      }
    };

    // Status monitoring
    window.monitorAutoSwitch = function () {
      console.log("📊 AUTO-SWITCH MONITORING:");
      console.log("  System enabled:", window.autoCameraSwitching?.isEnabled());
      console.log("  Face Detection active:", !!window.faceDetectionSystem);
      console.log(
        "  Socket connected:",
        window.socket?.readyState === WebSocket.OPEN
      );
      console.log(
        "  Camera switch ready:",
        !!window.executeIntegratedCameraSwitch
      );

      if (window.faceDetectionStates) {
        const devicesWithFaces = [];
        window.faceDetectionStates.forEach((state, deviceId) => {
          if (state.hasFace) {
            devicesWithFaces.push({ deviceId, confidence: state.confidence });
          }
        });
        console.log("  Devices with faces:", devicesWithFaces);
      }
    };

    // Auto-monitor every 10 seconds
    setInterval(() => {
      if (window.autoCameraSwitching?.debug?.enableVerboseLogging) {
        // Only monitor if verbose logging is enabled
        window.monitorAutoSwitch();
      }
    }, 10000);
  }, 2000);
}

// ================================================================
// 7. EXPORT FOR GLOBAL ACCESS
// ================================================================

window.permanentIntegrationFix = {
  isInstalled: () =>
    !!window.executeIntegratedCameraSwitch &&
    !!window.notifyFaceDetectionChange,
  reinstall: initializePermanentIntegration,
  test: () => window.testPermanentAutoSwitch?.(),
  monitor: () => window.monitorAutoSwitch?.(),
};

console.log(
  "🔧 Permanent Integration Fix geladen - wird automatisch installiert"
);
