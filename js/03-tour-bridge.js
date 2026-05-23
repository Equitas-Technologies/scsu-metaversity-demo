/* === SCSU app — Part 3: Treedis SDK bridge (sec 6.5) === */
/* -----------------------------------------------------------
   6.5 TREEDIS SDK BRIDGE
   -----------------------------------------------------------
   Wraps postMessage communication with the Treedis iframe.
   Mirrors the original wrapperscript.js, adapted for the new
   map/metadata-panel UI and using the Treedis config keys
   under window.CAMPUS_CONFIG.treedis.

   Protocol (subset):
     Outbound (us → Treedis):
       { type: "Ping" }
       { type: "Navigate", sweepId, transitionTime?, rotation? }
       { type: "RequestSweeps" }
     Inbound  (Treedis → us):
       { type: "TourReady" }
       { type: "PoseChanged", ... }
       { type: "SweepsChanged", sweeps: [...] }
       { type: "TagClicked" | "TagFocused" | "TagDocked" | "TagHovered" }
   ----------------------------------------------------------- */
const TourBridge = {
  _iframe: null,
  _pingInterval: null,
  _ready: false,
  _currentSweepId: null,

  initialize(iframeEl) {
    this._iframe = iframeEl;
    window.addEventListener("message", this._onMessage.bind(this));

    // Keep pinging until we get a TourReady, then stop.
    this._pingInterval = setInterval(() => {
      if (this._ready) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
      } else {
        this.ping();
      }
    }, 2000);
  },

  get isReady() { return this._ready; },

  _onMessage(event) {
    // Validate origin when we have one configured. Treedis posts
    // from the same origin the iframe was loaded from, so this
    // check protects against cross-origin injection.
    const expected = (config.treedis && config.treedis.origin) || null;
    if (expected && event.origin && event.origin !== expected) return;

    const data = event.data;
    if (!data || typeof data !== "object" || !data.type) return;

    switch (data.type) {
      case "TourReady":
        this._ready = true;
        console.info("[treedis] TourReady");
        // Defer the flush — TourReady fires when the bridge is up,
        // but the showcase SDK takes another moment to be ready to
        // act on Navigate. Without this delay the command lands in
        // a dead zone and Treedis stays on its default sweep.
        setTimeout(() => {
          try { _flushPendingSweep(); } catch (_) {}
        }, 600);
        break;
      case "SweepsChanged":
        console.info("[treedis] sweeps:", (data.sweeps || []).length);
        break;
      case "TagClicked":
      case "TagFocused":
      case "TagDocked":
        // Hook points for future custom tag handling
        break;
        case "PoseChanged":
          // Track the sweep Treedis says we're actually on. Used by
          // _flushPendingSweep() to verify a queued Navigate landed.
          if (data.sweep || data.sweepId) {
            const newSweepId = data.sweep || data.sweepId;
            const changed = newSweepId !== this._currentSweepId;
            this._currentSweepId = newSweepId;

            // When the user walks around inside Treedis, sync the
            // wrapper UI (tour bar + counter) to wherever they are.
            // Only fire on actual changes to avoid redundant work
            // on every pose tick.
            if (changed && streetViewActive) {
              try { syncWrapperToSweep(newSweepId); } catch (_) {}
            }
          }
          break;
      /* End of switch — unhandled types are silently ignored. */
    }
  },

  navigateToSweep(sweepId, options = {}) {
    if (!sweepId) {
      console.warn("[treedis] navigateToSweep called without sweepId");
      return;
    }
    const cmd = {
      type: "Navigate",
      sweepId,
      transitionTime: options.transitionTime
        ?? (config.treedis && config.treedis.defaultTransitionTime)
        ?? 1500
    };
    if (options.rotation) cmd.rotation = options.rotation;
    this._post(cmd);
  },

  requestSweeps() { this._post({ type: "RequestSweeps" }); },
  ping()          { this._post({ type: "Ping" }); },

  /* Silent pre-warm: Navigate with transitionTime: 0 so the
     hidden iframe jumps instantly instead of animating. */
  warmSweep(sweepId) {
    if (!sweepId) return;
    this._post({ type: "Navigate", sweepId, transitionTime: 0 });
  },

  _post(cmd) {
    if (!this._iframe || !this._iframe.contentWindow) return;
    // We use "*" for targetOrigin because the iframe src is set
    // programmatically to the configured origin and the bridge
    // already validates origin on inbound messages.
    this._iframe.contentWindow.postMessage(cmd, "*");
  }
};

