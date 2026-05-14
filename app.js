/* ===========================================================
   SCSU METAVERSITY — App
   -----------------------------------------------------------
   Data loading strategy:
     1. Try fetching the .geojson files (works over http://
        and https:// — i.e., once deployed on a website).
     2. If fetch fails (e.g., someone opens index.html
        directly from disk), fall back to window.SCSU_DATA
        which is populated by the data/*.js shim scripts.
   Either way the app ends up with the same data.
   =========================================================== */

const config = window.CAMPUS_CONFIG;

/* -----------------------------------------------------------
   1.bis  XR / VR DETECTION + TREEDIS PROFILE SELECTION
   -----------------------------------------------------------
   The campus has two Treedis models — a desktop/tablet/mobile
   one and an XR-headset one — with different sweep IDs. We pick
   the right one as early as possible so the iframe preload, the
   sweep lookups, and the layout-mode class on <body> all use a
   single source of truth.

   Strategy (defense in depth):
     1. UA-token check (sync, runs at module load). Catches Meta
        Quest Browser even when it's switched to "Desktop" mode,
        because the OculusBrowser / VR / Quest tokens stay in the
        UA regardless of that toggle. Also catches Pico headsets.
     2. WebXR API confirmation (async, runs from boot()). If the
        UA looks ambiguous we still call
        navigator.xr.isSessionSupported("immersive-vr") and
        upgrade to the VR profile when it resolves true. This
        runs only when the UA didn't already commit to VR, so a
        confirmed VR UA never gets downgraded by a transient
        async failure.

   Either signal alone is enough to flip the app into VR mode.
   ----------------------------------------------------------- */

/* Synchronous, user-agent-only check. Set once at module load
   so the very first call to resolveTreedisProfile() picks the
   right map before the iframe src is set. Re-evaluated as part
   of detectXRAsync() too — never trusted as the sole signal. */
function isXRUserAgent() {
  try {
    const ua = (navigator.userAgent || "").toString();
    // OculusBrowser appears in every Meta Quest Browser UA,
    // mobile-mode or desktop-mode. " VR " (with surrounding
    // spaces) catches the `VR Safari` / `Mobile VR Safari`
    // token. `Pico` catches Pico headsets.
    if (/OculusBrowser|Quest\s|Quest\)| VR |Mobile VR|Pico/i.test(ua)) {
      return true;
    }
  } catch (_) {}
  return false;
}

/* Async, runs once at boot. Resolves true if the browser
   exposes a WebXR-immersive-VR-capable device. Never rejects —
   on any error or unsupported environment, resolves false.
   Wrapped in a per-page-load cache so repeated calls are free. */
let _xrAsyncPromise = null;
function detectXRAsync() {
  if (_xrAsyncPromise) return _xrAsyncPromise;
  _xrAsyncPromise = (async () => {
    try {
      if (!navigator.xr || typeof navigator.xr.isSessionSupported !== "function") {
        return false;
      }
      const ok = await navigator.xr.isSessionSupported("immersive-vr");
      return !!ok;
    } catch (_) {
      return false;
    }
  })();
  return _xrAsyncPromise;
}

/* Currently-active profile name: "desktop" or "vr". Set by
   resolveTreedisProfile() at module-load time and refined by
   maybeUpgradeToVRProfile() once detectXRAsync() resolves.
   Treat as read-only outside those two functions. */
let activeTreedisProfile = "desktop";

/* Pick the initial profile from the sync UA check and copy its
   model/tourUrl/homeSweepId values up to the legacy top-level
   keys so any older code path reading config.treedis.modelId
   keeps working. Also repoints config.treedisMap to the chosen
   per-location sweep map. Called once at module load — runs
   before preloadTreedisIframe() so the iframe src is correct
   from the very first load. */
function resolveTreedisProfile() {
  const wantVR = isXRUserAgent();
  applyTreedisProfile(wantVR ? "vr" : "desktop");
}

function applyTreedisProfile(profileName) {
  if (profileName !== "desktop" && profileName !== "vr") {
    console.warn("[treedis] unknown profile, falling back to desktop:",
      profileName);
    profileName = "desktop";
  }
  activeTreedisProfile = profileName;

  // Mirror the profile onto <body> so CSS can react (the
  // VR-mode streetview rules in mapstyles.css key off this).
  try {
    document.body.classList.toggle("xr-mode", profileName === "vr");
  } catch (_) {
    // <body> not parsed yet on module load — that's fine, the
    // class gets re-applied below when this runs again from boot.
  }

  const cfg = config.treedis || {};
  const profile = (cfg.profiles && cfg.profiles[profileName]) || null;
  if (!profile) {
    console.warn("[treedis] no profile config for:", profileName);
    return;
  }
  cfg.modelId     = profile.modelId;
  cfg.tourUrl     = profile.tourUrl;
  cfg.homeSweepId = profile.homeSweepId;

  // Swap the per-location sweep map alias.
  const maps = config.treedisMaps || {};
  config.treedisMap = maps[profileName] || maps.desktop || {};

  console.info("[treedis] active profile:", profileName,
               "model:", cfg.modelId);
}

/* Plausibility gate for the async WebXR upgrade. The reason we
   can't trust navigator.xr.isSessionSupported("immersive-vr")
   on its own is that desktop Chrome on Windows exposes WebXR
   whenever an OpenXR runtime is installed — SteamVR, Windows
   Mixed Reality, the Oculus desktop app, etc. — even with no
   headset plugged in. So the user agent reports "yes, immersive
   VR is supported" on plenty of regular desktop PCs, and using
   that signal alone would put every such machine on the VR
   profile.

   To rule that case out, we only let the async signal upgrade
   the profile when the UA *also* looks like a plausible
   standalone-headset platform: Android-on-handheld, or one of
   the headset tokens (Quest / Pico / VR / OculusBrowser, which
   the sync check would already have caught — listed here as a
   belt-and-braces fallback in case the regex got too strict).
   Anything that looks like a desktop OS (Windows / macOS / X11
   without Android) stays on the desktop profile no matter what
   WebXR reports. */
function isPlausibleHeadsetUA() {
  try {
    const ua = (navigator.userAgent || "").toString();
    // Desktop OS markers — if any of these are present, we are
    // not on a standalone headset. Note: Quest 3's UA contains
    // "X11; Linux x86_64; Quest 3" so we have to combine the
    // Linux test with an explicit absence of headset markers.
    const looksDesktop =
      /Windows NT|Macintosh|Mac OS X(?!.*Mobile)/i.test(ua) ||
      (/X11/.test(ua) && !/Quest|OculusBrowser|Pico/i.test(ua));
    if (looksDesktop) return false;
    // Headset-platform markers
    return /OculusBrowser|Quest|Pico|Android|Mobile VR| VR /i.test(ua);
  } catch (_) {
    return false;
  }
}

/* Called from boot(). If the sync UA check missed but the
   WebXR API later confirms an XR device AND the UA looks like
   a plausible headset platform, switch profiles. No-op when
   already on the VR profile, or when the iframe has already
   been loaded with desktop content (we don't try to reload
   mid-session — that would clobber a tour the user may already
   be inside). */
async function maybeUpgradeToVRProfile() {
  if (activeTreedisProfile === "vr") return;
  const isXR = await detectXRAsync();
  if (!isXR) return;
  if (!isPlausibleHeadsetUA()) {
    console.info(
      "[treedis] WebXR reports immersive-vr supported, but UA looks " +
      "like a desktop — staying on desktop profile. " +
      "(This is normal on a PC with SteamVR / WMR / Oculus desktop " +
      "installed.)");
    return;
  }
  if (TourBridge && TourBridge._iframe && TourBridge._iframe.src &&
      TourBridge._iframe.src !== "about:blank") {
    console.info(
      "[treedis] WebXR detected after iframe load — leaving desktop " +
      "profile active to avoid disrupting an in-flight tour");
    return;
  }
  console.info("[treedis] WebXR detected — upgrading to VR profile");
  applyTreedisProfile("vr");
}

/* Read-only accessor for the rest of the app. */
function isVRMode() {
  return activeTreedisProfile === "vr";
}

// Run the sync check immediately. This happens before any
// other code touches config.treedisMap / config.treedis.tourUrl,
// so the rest of app.js sees a consistent profile.
resolveTreedisProfile();

// Kick off the async WebXR detection in parallel — boot() will
// await this promise, but pre-warming here means it's likely
// already resolved by then and adds zero latency to boot.
detectXRAsync();

/* -----------------------------------------------------------
   1. Reprojection (EPSG:3857 meters → EPSG:4326 lat/lng)
   ----------------------------------------------------------- */
const EARTH_HALF_CIRC = 20037508.34;

function mercatorToLatLng(x, y) {
  const lng = (x / EARTH_HALF_CIRC) * 180;
  let lat = (y / EARTH_HALF_CIRC) * 180;
  lat = (180 / Math.PI) *
        (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lng, lat];
}

function reprojectCoords(coords, crs) {
  if (crs !== "EPSG:3857") return coords;
  if (typeof coords[0] === "number") {
    return mercatorToLatLng(coords[0], coords[1]);
  }
  return coords.map((c) => reprojectCoords(c, crs));
}

function reprojectFC(fc, crs) {
  if (!fc || !Array.isArray(fc.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry
        ? { ...f.geometry,
            coordinates: reprojectCoords(f.geometry.coordinates, crs) }
        : null
    }))
  };
}

/* -----------------------------------------------------------
   2. Helpers
   ----------------------------------------------------------- */
function cleanName(name) {
  if (!name) return "";
  const cleaned = String(name).replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return "";
  return cleaned;
}

function getCategory(name) {
  if (!name) return "";
  const k = name.toLowerCase();
  return config.categoryMap[k] || "CAMPUS";
}

function getDescription(name) {
  if (!name) return "";
  const k = name.toLowerCase();
  return config.descriptionMap[k] ||
         `${name} — more information about this location is coming soon.`;
}

function getHappensHere(name) {
  if (!name) return [];
  const k = name.toLowerCase();
  const list = (config.happensHereMap || {})[k];
  return Array.isArray(list) ? list : [];
}

function getImage(name) {
  if (!name) return "";
  const k = name.toLowerCase();
  return (config.imageMap || {})[k] || "";
}

function getExplorable(name) {
  if (!name) return [];
  const k = name.toLowerCase();
  const list = (config.explorableMap || {})[k];
  return Array.isArray(list) ? list : [];
}

/* Look up a Treedis entry by location name (case-insensitive).
   Accepts short-hand string entries as well as full objects, and
   always returns a normalized { sweepId, parentName, transitionTime }
   object — or null if the name has no mapping. */
function getTreedisEntry(name) {
  if (!name) return null;
  const map = config.treedisMap || {};
  const raw = map[String(name).toLowerCase().trim()];
  if (raw == null) return null;
  if (typeof raw === "string") {
    return { sweepId: raw, parentName: null, transitionTime: null };
  }
  return {
    sweepId:        raw.sweepId || null,
    parentName:     raw.parentName || null,
    transitionTime: raw.transitionTime || null
  };
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* -----------------------------------------------------------
   3. Leaflet map + panes
   ----------------------------------------------------------- */
const map = L.map("map", {
  zoomControl: false,
  attributionControl: true,
  maxZoom: 20,
  zoomSnap: 0.25,
  wheelPxPerZoomLevel: 120,
  maxBoundsViscosity: 1.0
});

L.control.zoom({ position: "topright" }).addTo(map);

map.createPane("imagePane");     map.getPane("imagePane").style.zIndex     = 200;
map.createPane("buildingsPane"); map.getPane("buildingsPane").style.zIndex = 420;
map.createPane("toursPane");     map.getPane("toursPane").style.zIndex     = 430;
map.createPane("pinsPane");      map.getPane("pinsPane").style.zIndex      = 500;

/* -----------------------------------------------------------
   4. DOM refs
   ----------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const el = {
  splash:          $("splash"),
  app:             $("app"),
  shell:           document.querySelector(".shell"),

  helpBtn:         $("helpBtn"),
  fullscreenBtn:   $("fullscreenBtn"),
  searchBtn:       $("searchBtn"),

  locations:          $("locations"),
  locationsList:      $("locationsList"),
  allLocationsList:   $("allLocationsList"),
  locationsCount:     $("locationsCount"),
  locationsClose:     $("locationsClose"),
  locationsToggle:    $("locationsToggle"),
  locationsBackdrop:  $("locationsBackdrop"),

  details:         $("details"),
  detailsHandle:   $("detailsHandle"),
  detailsClose:    $("detailsClose"),
  detailsTag:      $("detailsTag"),
  detailsTitle:    $("detailsTitle"),
  detailsSub:      $("detailsSub"),
  detailsBody:     $("detailsBody"),

  // Metadata panel dynamic sections
  happensHereBlock: $("happensHereBlock"),
  chipsHere:        $("chipsHere"),
  explorableBlock:  $("explorableBlock"),
  subList:          $("subList"),
  detailsImage:     $("detailsImage"),

  // Desktop tour nav (inside sidebar footer)
  tourName:        $("tourName"),
  tourCurrent:     $("tourCurrent"),
  tourTotal:       $("tourTotal"),
  tourPrev:        $("tourPrev"),
  tourNext:        $("tourNext"),

  // Mobile tour nav (separate .tourbar at the bottom of viewport)
  tourNameMobile:    $("tourNameMobile"),
  tourCurrentMobile: $("tourCurrentMobile"),
  tourTotalMobile:   $("tourTotalMobile"),
  tourPrevMobile:    $("tourPrevMobile"),
  tourNextMobile:    $("tourNextMobile"),

  fitBtn:          $("fitBtn"),

  /* ---- Treedis street-view overlay (new) ---------------- */
  streetview:        $("streetview"),
  tourFrame:         $("tour-frame"),
  streetviewClose:   $("streetviewClose"),
  streetviewTitle:   $("streetviewTitle"),
  streetviewSub:     $("streetviewSub"),
  streetviewTouchGuard: $("streetviewTouchGuard"),
  streetviewLoading: $("streetviewLoading"),
  streetviewLoading: $("streetviewLoading"),
  streetviewLoadingLabel:  $("streetviewLoadingLabel"),
  streetviewLoadingCancel: $("streetviewLoadingCancel"),


  /* Explore CTA inside the metadata panel — used to launch
     the street view for the currently-selected location.    */
  exploreCta:        $("exploreCta"),
  exploreCtaFooter:  $("exploreCtaFooter"),
  vrBtn:             $("vrBtn"),

  metabarSearch:   $("metabarSearch"),
  searchInput:     $("searchInput"),
  searchResults:   $("searchResults"),
  searchClear:     $("searchClear"),

  modeBtns:        document.querySelectorAll(".mode-btn")
};

const mqMobile = window.matchMedia("(max-width: 880px)");
function isMobile() { return mqMobile.matches; }

/* -----------------------------------------------------------
   5. Styling helpers
   ----------------------------------------------------------- */
function styleFor(kind) {
  const s = config.styles;
  if (kind === "building") return { ...s.buildings };
  if (kind === "tour")     return { ...s.tours };
  return { ...s.buildings };
}

function hoverStyleFor(kind) {
  const s = config.styles;
  if (kind === "building") return { ...s.buildingsHover };
  if (kind === "tour")     return { ...s.toursHover };
  return { ...s.buildingsHover };
}

/* -----------------------------------------------------------
   6. State
   ----------------------------------------------------------- */
let imageBounds     = null; // still used as campus bounds by reset/fit helpers
let imageOverlay    = null; // old single-image mode only
let baseTileLayer   = null; // new tile mode
let dataBounds      = null;
let buildingsLayer  = null;
let toursLayer      = null;
let tourPinsLayer   = L.layerGroup([], { pane: "pinsPane" });

let selectedLayer = null;
let selectedKind  = null;

let tourStops  = []; // [{ feature, layer, marker, order }]
let tourIndex  = -1;
let allFeatures = [];

/* Mobile drawer state. At any given time on mobile we can be in:
     - "map only"         (nothing open)
     - drawer open        (locations list visible)
     - details half       (bottom sheet covering ~half the screen)
     - details full       (bottom sheet covering the whole map area)
   The drawer and details are mutually exclusive. */
let drawerOpen   = false;
let detailsMode  = null; // null | "half" | "full"

/* Street view state. The iframe starts preloading the moment the
   page boots, but stays hidden (aria-hidden + CSS) until the user
   explicitly hits "Explore" on a location. While the street view
   is active the locations list and tour-bar arrows keep working,
   except they drive Treedis via postMessage instead of flying the
   map to the next feature. */
let streetViewActive = false;

/* Track the last successful Treedis navigation so we don't fire a
   redundant Navigate message (e.g. selecting the same row twice). */
let lastStreetViewSweepId = null;

/* Set to true when the user takes a real street-view action, so
   warmHomeSweep() aborts before clobbering their chosen sweep. */
let warmupCancelled = false;

/* When the user opens street view before TourReady has fired, we
   stash their intended target here. Once Treedis reports ready,
   _flushPendingSweep() sends the queued Navigate and hides the
   loading veil. Cleared on close or on successful flush. */
let pendingSweep = null;


/* Image-alignment state. Loaded from localStorage first (so
   the user's tuning persists), then falls back to the values
   in config.js. */
const ALIGN_KEY = "scsu-map.align.v1";
function loadAlign() {
  const fromCfg = {
    offsetLat: config.imageOffsetLat || 0,
    offsetLng: config.imageOffsetLng || 0,
    scaleX:    config.imageScaleX    || 1,
    scaleY:    config.imageScaleY    || 1
  };
  try {
    const raw = localStorage.getItem(ALIGN_KEY);
    if (!raw) return fromCfg;
    const parsed = JSON.parse(raw);
    return { ...fromCfg, ...parsed };
  } catch (_) { return fromCfg; }
}
function saveAlign(a) {
  try { localStorage.setItem(ALIGN_KEY, JSON.stringify(a)); } catch (_) {}
}
let align = loadAlign();

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

/* -----------------------------------------------------------
   6.6 STREET VIEW CONTROLLER
   -----------------------------------------------------------
   Thin UI layer over TourBridge. Responsible for:
     • Preloading the iframe in the background on boot
     • Showing/hiding the overlay panel
     • Keeping header text in sync with the active location
     • Bridging user actions (Explore CTA, explorable list,
       tour-bar arrows, locations list) into Navigate calls
   ----------------------------------------------------------- */
function preloadTreedisIframe() {
  if (!el.tourFrame) return;
  const url = config.treedis && config.treedis.tourUrl;
  if (!url) {
    console.warn("[treedis] no tourUrl configured — iframe will stay blank");
    return;
  }
  // Only set src once; subsequent calls are no-ops so we don't
  // reload the tour every time the overlay is reopened.
  if (el.tourFrame.src && el.tourFrame.src !== "about:blank") return;
  el.tourFrame.src = url;
  TourBridge.initialize(el.tourFrame);
}

function setStreetViewCaption(title, sub) {
  if (el.streetviewTitle) el.streetviewTitle.textContent = title || "—";
  if (el.streetviewSub)   el.streetviewSub.textContent   = sub || "";
}

/* When the user navigates inside Treedis (clicking a hotspot,
   walking to a new sweep, etc.), Treedis fires PoseChanged with
   the new sweep id. This function maps that sweep id back to
   the location it represents and updates the tour bar so the
   wrapper UI stays in sync.

   Sub-locations (rooms, floors) point at their parent via
   `parentName` in config.treedisMap — when the user enters one
   we surface the parent in the tour bar, since sub-locations
   aren't tour stops in their own right. */
function syncWrapperToSweep(sweepId) {
  if (!sweepId || !config.treedisMap) return;

  // Find the treedisMap entry whose sweepId matches.
  let matchedKey = null;
  let matchedEntry = null;
  for (const [key, entry] of Object.entries(config.treedisMap)) {
    if (entry && entry.sweepId === sweepId) {
      matchedKey = key;
      matchedEntry = entry;
      break;
    }
  }
  if (!matchedEntry) return; // unknown sweep — nothing to sync

  // Resolve to the parent location name if this is a sub-location.
  // Otherwise, the matched key IS the location name (lowercased
  // — treedisMap keys are case-insensitive matches against
  // GeoJSON `name`).
  const targetName = (matchedEntry.parentName || matchedKey).toLowerCase();

  // Find the corresponding tour stop and update the index.
  const newIndex = tourStops.findIndex(
    (s) => cleanName(s.feature.properties.name).toLowerCase() === targetName
  );
  if (newIndex < 0 || newIndex === tourIndex) return;

  tourIndex = newIndex;
  updateTourbar();
}

/* Open the street view overlay at the given sweep. `title` and
   `sub` are display-only (they populate the small header pill
   in the top-left of the overlay).

   Two paths:
     (a) Treedis is ready → fire Navigate immediately as before.
     (b) Treedis is NOT ready → show the loading veil and queue
         the sweep in pendingSweep. _flushPendingSweep() runs
         when TourReady fires and finishes the job. */
function openStreetView(sweepId, title, sub) {
  if (!sweepId) {
    console.warn("[streetview] open request ignored — no sweep id for", title);
    // Tiny visual nudge — still open the overlay so the user sees
    // the tour, just without a targeted navigate. This way
    // placeholder rows at least don't feel broken.
  }

  // Cancel any in-flight warm-up so it can't clobber this Navigate.
  warmupCancelled = true;

  streetViewActive = true;
  if (el.streetview) {
    el.streetview.setAttribute("aria-hidden", "false");
    el.streetview.classList.add("is-open");
  }
  document.body.classList.add("streetview-open");

  setStreetViewCaption(title, sub);

  if (sweepId) {
    if (TourBridge.isReady) {
      // Happy path — Treedis is ready, fire the Navigate now.
      TourBridge.navigateToSweep(sweepId);
      lastStreetViewSweepId = sweepId;
      _hideStreetViewLoading();
      pendingSweep = null;
    } else {
      // Treedis hasn't reported TourReady yet (cold load, or the
      // user clicked Explore unusually fast). Show our loading
      // veil and queue the target — _flushPendingSweep() will
      // send the Navigate the moment TourReady arrives.
      console.info("[streetview] queueing sweep until TourReady:", sweepId);
      pendingSweep = { sweepId, title, sub };
      _showStreetViewLoading();
    }
  } else {
    // No sweep id provided — just hide the loading veil if it's
    // still up from a previous open. Caption already set above.
    _hideStreetViewLoading();
    pendingSweep = null;
  }

  // Show the mobile "tap to interact" guard whenever we (re)open
  // so the first deliberate tap is always the one that activates
  // 3D interaction.
  if (isTouchDevice() && el.streetviewTouchGuard) {
    el.streetviewTouchGuard.classList.add("is-active");
  }

  // On mobile the details bottom sheet would cover the lower
  // third of the 3D scene — per the Figma flow, the panel is
  // tucked away when entering street view. The selection is
  // preserved so the caption + tour-bar stay in sync.
  if (isMobile() && el.details && el.details.classList.contains("is-open")) {
    // Hide the sheet without clearing selection (selection drives
    // tour-bar + street-view sync). We use the same is-hidden
    // state the drag handle already supports.
    el.details.classList.add("is-hidden");
    el.details.classList.remove("is-full");
    el.shell.classList.remove("details-full");
    // Close any open mobile drawer too.
    if (drawerOpen) closeMobileLocations({ silent: true });
  }
}

function closeStreetView() {
  streetViewActive = false;
  if (el.streetview) {
    el.streetview.setAttribute("aria-hidden", "true");
    el.streetview.classList.remove("is-open");
  }
  document.body.classList.remove("streetview-open");
  // If the user closed while we were still waiting on TourReady,
  // drop the queued sweep so it doesn't fire after they've moved
  // on. The loading veil gets hidden too.
  pendingSweep = null;
  _hideStreetViewLoading();
}


   /* Show / hide the loading veil that sits over the iframe while
   Treedis finishes booting. Safe to call repeatedly.

   On slow connections (e.g. 4G) Treedis can take 20–60s to boot.
   To keep the user informed instead of staring at a static
   spinner, we escalate the messaging on timers:
     • t = 0s    → "Loading street view…"
     • t = 8s    → switch to a slow-connection note
     • t = 25s   → reveal a Cancel button that closes the panel
   Timers are cleared whenever the veil is hidden so they don't
   leak across opens. */
const STREETVIEW_LOADING_DEFAULT = "Loading street view…";
const STREETVIEW_LOADING_SLOW =
  "Loading 3D tour — this can take a moment on slower connections.";
let _streetviewLoadingTimers = [];

function _clearStreetViewLoadingTimers() {
  _streetviewLoadingTimers.forEach((t) => clearTimeout(t));
  _streetviewLoadingTimers = [];
}

function _showStreetViewLoading() {
  if (!el.streetviewLoading) return;

  el.streetviewLoading.classList.add("is-active");
  el.streetviewLoading.setAttribute("aria-hidden", "false");

  // Reset to initial state every time we (re)show the veil so a
  // fast second open doesn't inherit the "slow" copy from a
  // previous slow open.
  if (el.streetviewLoadingLabel) {
    el.streetviewLoadingLabel.textContent = STREETVIEW_LOADING_DEFAULT;
  }
  if (el.streetviewLoadingCancel) {
    el.streetviewLoadingCancel.hidden = true;
  }

  // Wipe any prior timers before scheduling fresh ones.
  _clearStreetViewLoadingTimers();

  _streetviewLoadingTimers.push(setTimeout(() => {
    if (el.streetviewLoadingLabel) {
      el.streetviewLoadingLabel.textContent = STREETVIEW_LOADING_SLOW;
    }
  }, 8000));

  _streetviewLoadingTimers.push(setTimeout(() => {
    if (el.streetviewLoadingCancel) {
      el.streetviewLoadingCancel.hidden = false;
    }
  }, 25000));
}

function _hideStreetViewLoading() {
  _clearStreetViewLoadingTimers();
  if (el.streetviewLoading) {
    el.streetviewLoading.classList.remove("is-active");
    el.streetviewLoading.setAttribute("aria-hidden", "true");
  }
  if (el.streetviewLoadingCancel) {
    el.streetviewLoadingCancel.hidden = true;
  }
  if (el.streetviewLoadingLabel) {
    el.streetviewLoadingLabel.textContent = STREETVIEW_LOADING_DEFAULT;
  }
}

/* Called from the TourReady handler. If a sweep was queued by
   openStreetView() while Treedis was still booting, send the
   Navigate now and hide the loading veil. If nothing is queued
   but the panel is open, just hide the veil. No-op otherwise. */
/* Called after TourReady. Fires the queued Navigate, then watches
   PoseChanged to verify Treedis actually landed on the requested
   sweep. If we don't see confirmation within `verifyMs`, the
   Navigate gets re-sent. Caps at `maxAttempts` to avoid loops. */
function _flushPendingSweep() {
  if (!pendingSweep) {
    if (streetViewActive) _hideStreetViewLoading();
    return;
  }

  const targetSweepId = pendingSweep.sweepId;
  const verifyMs = 1500;
  const maxAttempts = 4;
  let attempt = 0;

  const tryNavigate = () => {
    // User may have closed the panel or queued a different sweep
    // since this attempt was scheduled. Bail in either case.
    if (!streetViewActive) return;
    if (!pendingSweep || pendingSweep.sweepId !== targetSweepId) return;

    attempt += 1;
    console.info(
      `[streetview] firing queued Navigate (attempt ${attempt}/${maxAttempts}):`,
      targetSweepId
    );
    TourBridge.navigateToSweep(targetSweepId);
    lastStreetViewSweepId = targetSweepId;

    setTimeout(() => {
      // Same bail conditions as above.
      if (!streetViewActive) return;
      if (!pendingSweep || pendingSweep.sweepId !== targetSweepId) return;

      // Did Treedis actually land on the right sweep?
      if (TourBridge._currentSweepId === targetSweepId) {
        console.info("[streetview] Navigate confirmed via PoseChanged");
        pendingSweep = null;
        _hideStreetViewLoading();
        return;
      }

      if (attempt < maxAttempts) {
        console.warn(
          "[streetview] no PoseChanged for target sweep yet — retrying. " +
          "Treedis says it is on:", TourBridge._currentSweepId
        );
        tryNavigate();
      } else {
        // Give up gracefully — hide the veil so the user can at
        // least interact with whatever sweep Treedis is on.
        console.warn(
          "[streetview] giving up after " + maxAttempts + " Navigate attempts. " +
          "Showing the panel anyway."
        );
        pendingSweep = null;
        _hideStreetViewLoading();
      }
    }, verifyMs);
  };

  tryNavigate();
}

function isTouchDevice() {
  return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
}

/* Navigate street view to the location currently represented by
   `layer` (if it has a Treedis mapping). When the panel is closed
   this is a no-op. If TourReady hasn't fired yet, we update the
   pendingSweep instead of firing Navigate (which Treedis would
   ignore anyway). */
function navigateStreetViewToLayer(layer) {
  if (!streetViewActive || !layer || !layer.feature) return;
  const name = cleanName(layer.feature.properties && layer.feature.properties.name);
  if (!name) return;

  const entry = getTreedisEntry(name);
  if (!entry || !entry.sweepId) {
    // No mapping — just update the caption so the user still gets
    // feedback that the selection changed.
    setStreetViewCaption(name, getCategory(name));
    return;
  }

  setStreetViewCaption(name, getCategory(name));

  if (!TourBridge.isReady) {
    // Still booting — re-queue. _flushPendingSweep() will fire
    // this target when TourReady arrives. Loading veil stays up.
    pendingSweep = { sweepId: entry.sweepId, title: name, sub: getCategory(name) };
    _showStreetViewLoading();
    return;
  }

  if (entry.sweepId !== lastStreetViewSweepId) {
    TourBridge.navigateToSweep(entry.sweepId);
    lastStreetViewSweepId = entry.sweepId;
  }
}

/* Navigate street view to a sub-location (an item from the
   "Explorable Locations" list). Uses the parent name to keep the
   caption anchored to the parent building. */
function openSubLocationInStreetView(parentName, subLocationName) {
  const entry = getTreedisEntry(subLocationName);
  const sweepId = entry && entry.sweepId;
  const displayParent = parentName || (entry && entry.parentName) || "";
  const caption = displayParent
    ? `${displayParent} — ${subLocationName}`
    : subLocationName;

  if (!sweepId) {
    console.warn(
      `[streetview] no sweep configured for "${subLocationName}" — ` +
      `open config.treedisMap to add one`
    );
  }

  // Always reveal the viewer, even when the sweep is a placeholder,
  // so users can see the parent's current view while the data is
  // being filled in.
  openStreetView(sweepId, displayParent || subLocationName, subLocationName);
  setStreetViewCaption(displayParent || subLocationName, subLocationName);
}

/* -----------------------------------------------------------
   6a. Map constraints + refresh helpers
   ----------------------------------------------------------- */
function getCampusCoverZoom() {
  if (!imageBounds) return 15;
  return Math.min(map.getMaxZoom(), map.getBoundsZoom(imageBounds, true));
}

function refreshMapConstraints({ recenterIfNeeded = true } = {}) {
  if (!imageBounds) return;

  map.invalidateSize({ pan: false });

  const coverZoom = getCampusCoverZoom();
  const extraZoomOut =
  config.mapMode === "tiles"
    ? ((config.tiles && config.tiles.zoomOutExtra) ?? 0.75)
    : 0.75;

  const minAllowedZoom = Math.max(0, coverZoom - extraZoomOut);

  map.setMaxBounds(imageBounds);
  map.setMinZoom(minAllowedZoom);

  if (!recenterIfNeeded) return;

  if (map.getZoom() < minAllowedZoom) {
    map.setView(imageBounds.getCenter(), minAllowedZoom, { animate: false });
  } else {
    map.panInsideBounds(imageBounds, { animate: false });
  }
}

function getCampusOffsetCenter(zoom, offsetXPx = 0, offsetYPx = 60) {
  if (!imageBounds) return null;

  const baseCenter = imageBounds.getCenter();
  const projected = map.project(baseCenter, zoom);

  // Negative Y here makes the image appear lower on screen.
  const shifted = L.point(projected.x + offsetXPx, projected.y - offsetYPx);

  return map.unproject(shifted, zoom);
}

function resetCampusView(animate = false) {
  if (!imageBounds) return;

  refreshMapConstraints({ recenterIfNeeded: false });

  // Tile mode: fit to the campus/vector bounds, not to a fake image box.
  if (config.mapMode === "tiles") {
    const opts = {
      padding: [24, 24],
      animate
    };

    if (config.tiles && config.tiles.initialZoom) {
      opts.maxZoom = config.tiles.initialZoom;
    }

    map.fitBounds(imageBounds, opts);
    return;
  }

  // Legacy single-image mode.
  const zoom = getCampusCoverZoom();
  const center = getCampusOffsetCenter(zoom, 0, -230);

  map.setView(center, zoom, { animate });
}

function scheduleMapRefresh({ recenterIfNeeded = true, delay = 0 } = {}) {
  clearTimeout(scheduleMapRefresh._t);
  scheduleMapRefresh._t = setTimeout(() => {
    refreshMapConstraints({ recenterIfNeeded });
  }, delay);
}

/* -----------------------------------------------------------
   7. Details panel
   ----------------------------------------------------------- */
function openDetails()  {
  el.shell.classList.add("has-details");
  el.details.setAttribute("aria-hidden", "false");

  if (isMobile()) {
    // Always open mutually-exclusive with drawer
    closeMobileLocations({ silent: true });
    setDetailsMode("half");
  }

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

function closeDetails() {
  el.shell.classList.remove("has-details");
  el.details.setAttribute("aria-hidden", "true");
  el.details.classList.remove("is-open", "is-full", "is-hidden", "is-dragging");
  el.details.style.transform = "";
  detailsMode = null;
  el.shell.classList.remove("details-full");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

function setDetailsMode(next) {
  // next ∈ { "half", "full" }. On mobile, toggles the CSS state flags.
  if (!isMobile()) return;
  if (next !== "half" && next !== "full") return;

  detailsMode = next;
  el.details.classList.add("is-open");
  el.details.classList.toggle("is-full", next === "full");
  el.details.classList.remove("is-hidden", "is-dragging");
  el.details.style.transform = "";
  el.shell.classList.toggle("details-full", next === "full");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

/* Render the "WHAT HAPPENS HERE?" chip row. Hides the whole
   block if the list is empty. */
function renderHappensHere(name) {
  const items = getHappensHere(name);
  if (!el.chipsHere || !el.happensHereBlock) return;

  if (!items.length) {
    el.happensHereBlock.hidden = true;
    el.chipsHere.innerHTML = "";
    return;
  }

  el.happensHereBlock.hidden = false;
  el.chipsHere.innerHTML = items
    .map((t) => `<span class="chip">${escapeHTML(t)}</span>`)
    .join("");
}

/* Render the location hero image. Falls back to the
   placeholder "X" frame if no image is mapped. */
function renderImage(name) {
  if (!el.detailsImage) return;
  const src = getImage(name);

  if (!src) {
    el.detailsImage.classList.remove("has-image");
    el.detailsImage.innerHTML =
      '<div class="details-image-x" aria-hidden="true"></div>' +
      '<figcaption>LOCATION IMAGE</figcaption>';
    return;
  }

  // Show the placeholder immediately so the panel's slide-in has a
  // simple box to render — then swap in the real <img> after the
  // current frame commits. Because the image is already in the
  // browser cache (preloaded on boot), this swap is effectively
  // instant and doesn't cause layout thrash during the panel's
  // transform animation.
  el.detailsImage.classList.remove("has-image");
  el.detailsImage.innerHTML =
    '<div class="details-image-x" aria-hidden="true"></div>' +
    '<figcaption>LOCATION IMAGE</figcaption>';

  requestAnimationFrame(() => {
    // Bail if the user has already navigated somewhere else.
    if (el.detailsImage.dataset.pendingSrc !== src) return;
    el.detailsImage.classList.add("has-image");
    el.detailsImage.innerHTML =
      `<img src="${escapeHTML(src)}" alt="${escapeHTML(name)}" ` +
      `onerror="this.parentNode.classList.remove('has-image');` +
      `this.parentNode.innerHTML='&lt;div class=&quot;details-image-x&quot;&gt;&lt;/div&gt;` +
      `&lt;figcaption&gt;LOCATION IMAGE&lt;/figcaption&gt;'">`;
  });
  el.detailsImage.dataset.pendingSrc = src;
}

/* Render the "EXPLORABLE LOCATIONS" list. Hides the whole
   block if the list is empty. Each row is clickable and — via
   the handler attached in renderDetails — opens the street view
   at that sub-location's sweep (falling back to the parent's
   view when the data isn't filled in yet). */
function renderExplorable(name) {
  const items = getExplorable(name);
  if (!el.subList || !el.explorableBlock) return;

  if (!items.length) {
    el.explorableBlock.hidden = true;
    el.subList.innerHTML = "";
    return;
  }

  el.explorableBlock.hidden = false;
  el.subList.innerHTML = items
    .map((t) => {
      const entry = getTreedisEntry(t);
      const hasSweep = !!(entry && entry.sweepId);
      // Rows without a sweep get a subtle "pending" class so they
      // still look clickable but signal that data is on the way.
      const pendingCls = hasSweep ? "" : " is-pending";
      return `<li class="sub-row${pendingCls}" role="button" tabindex="0" ` +
             `data-sub="${escapeHTML(t)}">` +
             `<span>${escapeHTML(t)}</span>` +
             `<span class="chev">›</span></li>`;
    })
    .join("");

  // Wire click handlers — the enclosing renderDetails knows the
  // parent building name, so we read it off dataset there.
  const parentName = el.subList.dataset.parent || "";
  el.subList.querySelectorAll(".sub-row").forEach((li) => {
    const handler = () => {
      const sub = li.dataset.sub;
      openSubLocationInStreetView(parentName, sub);
    };
    li.addEventListener("click", handler);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });
}

function renderDetails(feature, kind) {
  const props = (feature && feature.properties) || {};
  const name = cleanName(props.name);

  el.detailsTag.textContent = (kind === "tour"
                                 ? "TOUR STOP"
                                 : "CAMPUS BUILDING");

  el.detailsTitle.textContent = name || "—";
  el.detailsSub.textContent   = getCategory(name) || "—";
  el.detailsBody.textContent  = getDescription(name);

  // Stash the parent name so the explorable list's click handlers
  // know which building they belong to.
  if (el.subList) el.subList.dataset.parent = name || "";

  renderHappensHere(name);
  renderExplorable(name);
  renderImage(name);

  // Annotate the Explore CTA with the current location so the
  // single button click handler (wired once, further down) knows
  // where to navigate.
  if (el.exploreCta) {
    const entry = getTreedisEntry(name);
    el.exploreCta.dataset.locationName = name || "";
    el.exploreCta.dataset.sweepId = (entry && entry.sweepId) || "";
    // Keep the button enabled even without a sweep so users can
    // still open the viewer at its current position; the handler
    // logs a warning for missing data.
    el.exploreCta.classList.toggle(
      "is-pending", !(entry && entry.sweepId)
    );
    // Mirror the pending-state visual onto the desktop/iPad
    // persistent footer button so it stays in sync with the
    // canonical #exploreCta inside the scrolling content area.
    if (el.exploreCtaFooter) {
      el.exploreCtaFooter.classList.toggle(
        "is-pending", !(entry && entry.sweepId)
      );
    }
  }
  if (el.vrBtn) {
    const entry = getTreedisEntry(name);
    el.vrBtn.dataset.locationName = name || "";
    el.vrBtn.dataset.sweepId = (entry && entry.sweepId) || "";
  }
}

/* -----------------------------------------------------------
   8. Selection + focus
   ----------------------------------------------------------- */
function resetLayerStyle(layer, kind) {
  if (!layer || typeof layer.setStyle !== "function") return;
  layer.setStyle(styleFor(kind));
}

/* Compute the padding to use when flying to a selected feature.
   On mobile, the details sheet covers roughly the bottom half of
   the shell area, so we inflate the *bottom* padding so that the
   feature's center ends up in the visible upper half of the map. */
function focusPaddingFor(layer) {
  if (!isMobile()) return { padding: [80, 80] };

  const shell = el.shell;
  const shellH = shell ? shell.clientHeight : 600;
  // matches --mobile-half-h (46dvh of the whole viewport)
  // We need the portion of the shell that will be covered, roughly.
  const panelH = Math.round(window.innerHeight * 0.46);
  const bottomPad = Math.min(Math.max(panelH, 140), shellH - 80);

  return {
    paddingTopLeft:     [24, 24],
    paddingBottomRight: [24, bottomPad]
  };
}

function selectFeature(layer, kind, { focus = false } = {}) {
  if (selectedLayer && selectedLayer !== layer) {
    resetLayerStyle(selectedLayer, selectedKind);
    if (selectedLayer.closeTooltip) selectedLayer.closeTooltip();
  }
  selectedLayer = layer;
  selectedKind  = kind;

  if (selectedLayer && typeof selectedLayer.setStyle === "function") {
    selectedLayer.setStyle({ ...config.styles.selected });
    if (selectedLayer.bringToFront) selectedLayer.bringToFront();
  }

  renderDetails(layer.feature, kind);
  openDetails();
  if (layer.openTooltip) layer.openTooltip();

  if (focus && layer.getBounds) {
    const fitOpts = {
      ...focusPaddingFor(layer),
      maxZoom: config.tour.focusZoom,
      duration: 0.55
    };
    // Let the layout settle before flying so Leaflet measures the
    // latest shell width after the details panel state changes.
    const fly = () => {
      refreshMapConstraints({ recenterIfNeeded: false });
      map.flyToBounds(layer.getBounds(), fitOpts);
    };
    if (isMobile()) {
      requestAnimationFrame(() => requestAnimationFrame(fly));
    } else {
      requestAnimationFrame(fly);
    }
  }

  // Update the left-side locations list
  syncLocationsList();

  // Update tour index + pin highlight
  const idx = tourStops.findIndex((s) => s.layer === layer);
  tourIndex = idx;
  updateTourbar();
  highlightActivePin();

  // If the user is currently inside the street view, also move
  // the Treedis camera to the newly-selected location. This makes
  // the left Locations list / tour arrows / search results all
  // drive the 3D experience while it's open, per the spec.
  if (streetViewActive) {
    navigateStreetViewToLayer(layer);
  }
}

function clearSelection() {
  if (selectedLayer) {
    resetLayerStyle(selectedLayer, selectedKind);
    if (selectedLayer.closeTooltip) selectedLayer.closeTooltip();
  }

  selectedLayer = null;
  selectedKind  = null;
  tourIndex = -1;
  closeDetails();
  // Closing the details panel also closes the street view — without
  // a selected building there's nothing to drive the 3D view.
  if (streetViewActive) closeStreetView();
  updateTourbar();
  highlightActivePin();
  syncLocationsList();
}

/* -----------------------------------------------------------
   9. Layer builders
   ----------------------------------------------------------- */
function bindEvents(feature, layer, kind) {
  const props = feature.properties || {};
  const label = cleanName(props.name);
  if (!label) return;

  if (config.ui.showBuildingTooltips || kind === "tour") {
    layer.bindTooltip(label, {
      direction: "top",
      className: "campus-label",
      sticky: false,
      opacity: 1
    });
  }

  layer.on({
    mouseover: () => {
      if (selectedLayer === layer) return;
      if (!config.ui.enableHoverPreview) return;
      layer.setStyle(hoverStyleFor(kind));
      if (layer.bringToFront) layer.bringToFront();
    },
    mouseout: () => {
      if (selectedLayer === layer) return;
      resetLayerStyle(layer, kind);
      if (layer.closeTooltip) layer.closeTooltip();
    },
    click: (e) => {
      L.DomEvent.stopPropagation(e);
      selectFeature(layer, kind, { focus: true });
    }
  });
}

function buildLayer(data, kind, paneName) {
  return L.geoJSON(data, {
    pane: paneName,
    style: () => styleFor(kind),
    onEachFeature: (f, l) => bindEvents(f, l, kind)
  });
}

/* -----------------------------------------------------------
   10. Image-bounds computation
   ----------------------------------------------------------- */
function computeImageBounds(b, imgPxW, imgPxH, padPct, align) {
  const s = b.getSouth(), n = b.getNorth();
  const w = b.getWest(),  e = b.getEast();
  const latC = (s + n) / 2;
  const lngC = (w + e) / 2;

  let heightDeg = n - s;
  let widthDeg  = e - w;

  const latScale = Math.cos((latC * Math.PI) / 180);
  const dataAspect = (widthDeg * latScale) / heightDeg;
  const imgAspect  = imgPxW / imgPxH;

  if (imgAspect > dataAspect) {
    widthDeg = (heightDeg * imgAspect) / latScale;
  } else {
    heightDeg = (widthDeg * latScale) / imgAspect;
  }

  widthDeg  *= 1 + padPct;
  heightDeg *= 1 + padPct;

  // Apply user-tunable alignment offsets + independent X/Y scale
  const a = align || {};
  const offLat = Number(a.offsetLat) || 0;
  const offLng = Number(a.offsetLng) || 0;
  const sx = Number.isFinite(a.scaleX) && a.scaleX > 0 ? a.scaleX : 1;
  const sy = Number.isFinite(a.scaleY) && a.scaleY > 0 ? a.scaleY : 1;

  widthDeg  *= sx;
  heightDeg *= sy;

  const cLat = latC + offLat;
  const cLng = lngC + offLng;

  return L.latLngBounds(
    [cLat - heightDeg / 2, cLng - widthDeg / 2],
    [cLat + heightDeg / 2, cLng + widthDeg / 2]
  );
}

/* -----------------------------------------------------------
   11. Tour pins (numbered circles over stops)
   ----------------------------------------------------------- */
function buildTourPins() {
  tourStops = [];

  toursLayer.eachLayer((layer) => {
    const f = layer.feature;
    const props = f.properties || {};
    const order = Number(props.order_num);
    if (!Number.isFinite(order)) return;

    let center;
    try { center = layer.getBounds().getCenter(); }
    catch (e) { return; }

    const icon = L.divIcon({
      className: "tour-pin-wrap",
      html: `<div class="tour-pin" data-order="${order}">${order}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker(center, {
      icon,
      pane: "pinsPane",
      interactive: false,
      keyboard: false
    });
    tourPinsLayer.addLayer(marker);

    tourStops.push({ feature: f, layer, marker, order });
  });

  tourStops.sort((a, b) => a.order - b.order);
  setText(el.tourTotal,       tourStops.length);
  setText(el.tourTotalMobile, tourStops.length);
  setText(el.tourCurrent,       0);
  setText(el.tourCurrentMobile, 0);
  updateTourbar();
}

function highlightActivePin() {
  document.querySelectorAll(".tour-pin.is-active")
          .forEach((n) => n.classList.remove("is-active"));
  const stop = tourStops[tourIndex];
  if (!stop) return;
  const node = stop.marker.getElement()?.querySelector(".tour-pin");
  if (node) node.classList.add("is-active");
}

/* -----------------------------------------------------------
   12. Tourbar (shared between desktop sidebar footer & mobile bar)
   ----------------------------------------------------------- */
function setText(node, value) { if (node) node.textContent = value; }

function updateTourbar() {
  if (tourIndex < 0 || !tourStops[tourIndex]) {
    const label = tourStops.length ? "Start your tour" : "No stops configured";
    setText(el.tourName,       label);
    setText(el.tourNameMobile, label);
    const cur = tourIndex < 0 ? 0 : tourIndex + 1;
    setText(el.tourCurrent,       cur);
    setText(el.tourCurrentMobile, cur);

    const prevDisabled = true;
    const nextDisabled = !tourStops.length;
    if (el.tourPrev)       el.tourPrev.disabled       = prevDisabled;
    if (el.tourNext)       el.tourNext.disabled       = nextDisabled;
    if (el.tourPrevMobile) el.tourPrevMobile.disabled = prevDisabled;
    if (el.tourNextMobile) el.tourNextMobile.disabled = nextDisabled;
    return;
  }
  const stop = tourStops[tourIndex];
  const name = cleanName(stop.feature.properties.name);
  setText(el.tourName,       name);
  setText(el.tourNameMobile, name);
  setText(el.tourCurrent,       tourIndex + 1);
  setText(el.tourCurrentMobile, tourIndex + 1);

  const prevDisabled = tourIndex === 0;
  const nextDisabled = tourIndex === tourStops.length - 1;
  if (el.tourPrev)       el.tourPrev.disabled       = prevDisabled;
  if (el.tourNext)       el.tourNext.disabled       = nextDisabled;
  if (el.tourPrevMobile) el.tourPrevMobile.disabled = prevDisabled;
  if (el.tourNextMobile) el.tourNextMobile.disabled = nextDisabled;
}

function goToStop(i) {
  if (!tourStops.length) return;
  tourIndex = Math.max(0, Math.min(i, tourStops.length - 1));
  const stop = tourStops[tourIndex];
  selectFeature(stop.layer, "tour", { focus: true });
}

function tourPrevAction() { goToStop(Math.max(0, tourIndex - 1)); }
function tourNextAction() {
  if (tourIndex < 0) return goToStop(0);
  goToStop(tourIndex + 1);
}

/* -----------------------------------------------------------
   13. Locations sidebar (Figma-style list)
   ----------------------------------------------------------- */
function syncLocationsList() {
  const rows = el.locationsList.querySelectorAll(".location-row");
  rows.forEach((r) => {
    const name = r.dataset.name || "";
    const active = selectedLayer &&
                   cleanName(selectedLayer.feature.properties.name).toLowerCase() === name;
    r.classList.toggle("is-active", !!active);
  });

  // Also sync the All-tab list (added for the Featured/All redesign)
  if (el.allLocationsList) {
    const allRows = el.allLocationsList.querySelectorAll(".location-row");
    allRows.forEach((r) => {
      const name = r.dataset.name || "";
      const active = selectedLayer &&
                     cleanName(selectedLayer.feature.properties.name).toLowerCase() === name;
      r.classList.toggle("is-active", !!active);
    });
  }
}

function renderLocationsList() {
  el.locationsCount.textContent = tourStops.length;
  const rows = [];

  // "Recenter on Tour" row — fits the map to all tour stops so the
  // user can re-orient on the full route after navigating away.
  rows.push(`
    <li class="location-row all-row" role="option" data-all="1">
      <div>
        <div class="location-name">Recenter on Tour</div>
        <div class="location-num">${tourStops.length} STOPS</div>
      </div>
      <span class="location-chev">›</span>
    </li>
  `);

  tourStops.forEach((stop, i) => {
    const name = cleanName(stop.feature.properties.name);
    const cat = getCategory(name);
    rows.push(`
      <li class="location-row" role="option" data-name="${name.toLowerCase()}">
        <div>
          <div class="location-name">
            <span class="location-index">${i + 1}.</span>${name}
          </div>
          <div class="location-cat">${cat}</div>
        </div>
        <span class="location-chev">›</span>
      </li>
    `);
  });

  el.locationsList.innerHTML = rows.join("");

  el.locationsList.querySelectorAll(".location-row").forEach((row) => {
    row.addEventListener("click", () => {
      if (row.dataset.all) {
        clearSelection();
        if (imageBounds) resetCampusView(true);
        // On mobile, close the drawer after action
        closeMobileLocations();
        return;
      }
      const name = row.dataset.name;
      const stop = tourStops.find(
        (s) => cleanName(s.feature.properties.name).toLowerCase() === name
      );
      if (!stop) return;

      const locationName = cleanName(stop.feature.properties.name);

      // Two paths depending on which "mode" the user is in:
      //
      // Street view mode → drive the 3D viewer to the selected
      //   location's sweep without leaving street view. This is
      //   what the wireframe describes when it says "Tap the
      //   LOCATIONS MENU to re-access the locations list" while
      //   street view is active. We also keep the map's selected
      //   feature in sync (silently, without flying the map or
      //   opening the bottom sheet) so when the user eventually
      //   closes street view, the map is already focused on the
      //   right building.
      //
      // Map mode → existing behavior: select the feature, fly
      //   the map, open the details bottom sheet.
      closeMobileLocations({ silent: true });

      if (streetViewActive) {
        const entry = getTreedisEntry(locationName);
        const sweepId = entry && entry.sweepId;
        if (sweepId) {
          openStreetView(sweepId, locationName, getCategory(locationName));
        } else {
          // No sweep mapped — fall back to selecting on the map
          // and closing street view so the user isn't stranded.
          console.warn(
            "[locations] no Treedis sweep for", locationName,
            "— falling back to map view"
          );
          closeStreetView();
          selectFeature(stop.layer, "tour", { focus: true });
        }
        // Keep the underlying map selection in sync so the tour
        // bar index, pin highlight, and details data are correct
        // when the user closes street view later.
        selectFeature(stop.layer, "tour", { focus: false });
        return;
      }

      selectFeature(stop.layer, "tour", { focus: true });
    });
  });
}

/* -----------------------------------------------------------
   13b. "All" tab — every building on the campus
   -----------------------------------------------------------
   Populates #allLocationsList from buildingsLayer (the full
   building polygon set). Clicking a row selects that feature
   on the map and opens the details panel, exactly like the
   Featured rows do for tour stops.
   ----------------------------------------------------------- */
function renderAllLocationsList() {
  if (!el.allLocationsList || !buildingsLayer) return;

  // Collect (name, layer) pairs from the building features. We
  // dedupe by lower-cased clean name so duplicate features don't
  // each get their own row.
  const seen = new Map();
  buildingsLayer.eachLayer((layer) => {
    const f = layer.feature;
    if (!f || !f.properties) return;
    const raw = f.properties.name;
    if (!raw) return;
    const name = cleanName(raw);
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.set(key, { name, layer });
  });

  // Sort alphabetically for the All list — the Featured tab is
  // intentionally ordered by tour sequence, but "All" reads
  // better as an alphabetical reference.
  const items = Array.from(seen.values())
                     .sort((a, b) => a.name.localeCompare(b.name));

  if (!items.length) {
    el.allLocationsList.innerHTML =
      `<li class="locations-empty">No buildings loaded.</li>`;
    return;
  }

  const rows = items.map((it) => {
    const cat = getCategory(it.name);
    return `
      <li class="location-row" role="option"
          data-name="${it.name.toLowerCase()}">
        <div>
          <div class="location-name">${it.name}</div>
          <div class="location-cat">${cat}</div>
        </div>
        <span class="location-chev">›</span>
      </li>
    `;
  });

  el.allLocationsList.innerHTML = rows.join("");

  el.allLocationsList.querySelectorAll(".location-row").forEach((row) => {
    row.addEventListener("click", () => {
      const name = row.dataset.name;
      const item = items.find(
        (i) => i.name.toLowerCase() === name
      );
      if (!item) return;

      // Mobile: close the drawer after the user picks something.
      closeMobileLocations({ silent: true });

      // Same flow as the Featured rows — but kind:"building"
      // because these come from the buildings layer, not tours.
      selectFeature(item.layer, "building", { focus: true });
    });
  });
}

/* -----------------------------------------------------------
   14. Mobile locations drawer
   -----------------------------------------------------------
   The drawer slides in from the left, covering ~82% of the
   shell width. The remaining sliver of map behind it is dimmed
   by a backdrop that also tap-closes the drawer.

   Drawer and details are mutually exclusive.
   ----------------------------------------------------------- */
   function openMobileLocations() {
     drawerOpen = true;
     el.locations.classList.add("is-open");
     el.locationsBackdrop.classList.add("is-open");
     el.shell.classList.add("drawer-open");

     // Mutually exclusive with the details bottom sheet, but only
     // when we're in map mode. When the user is in street view, the
     // details panel may still have `is-open` set in the background
     // even though it's not visible — clearing the selection there
     // would also close the street view, which is not what the user
     // intended by tapping the Locations pill. They just want the
     // menu open *on top of* the current view (map or street view).
     if (!streetViewActive && el.details.classList.contains("is-open")) {
       clearSelection();
     }

     scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
   }

function closeMobileLocations(opts = {}) {
  if (!isMobile() && !opts.force) {
    // On desktop the list is permanent; nothing to do.
    return;
  }
  drawerOpen = false;
  el.locations.classList.remove("is-open");
  el.locationsBackdrop.classList.remove("is-open");
  el.shell.classList.remove("drawer-open");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

el.locationsToggle.addEventListener("click", () => {
  if (drawerOpen) closeMobileLocations();
  else openMobileLocations();
});
el.locationsClose.addEventListener("click", () => closeMobileLocations());
el.locationsBackdrop.addEventListener("click", () => closeMobileLocations());

/* -----------------------------------------------------------
   14a. Mobile details drag/slide
   -----------------------------------------------------------
   Ported from drag.html. The bottom sheet has two "snapped"
   states, "half" and "full", plus a transient "dragging" state
   where JS writes a live transform on the element. On release,
   the direction & distance of the drag decide which state to
   snap back to.
   ----------------------------------------------------------- */
let dragging  = false;
let dragStartY = 0;
let dragCurrY  = 0;
let dragStartMode = "half";

function onDetailsPointerDown(e) {
  if (!isMobile()) return;
  if (detailsMode !== "half" && detailsMode !== "full") return;

  dragging = true;
  dragStartY = e.clientY;
  dragCurrY  = e.clientY;
  dragStartMode = detailsMode;

  el.details.classList.add("is-dragging");
  try { el.detailsHandle.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
}

function onDetailsPointerMove(e) {
  if (!dragging || !isMobile()) return;
  dragCurrY = e.clientY;
  const delta = dragCurrY - dragStartY;

  // We only let the user drag in the "meaningful" direction for the
  // starting state. From "full", you can only pull down (delta>0).
  // From "half", you can either pull up to expand or down to dismiss.
  if (dragStartMode === "full") {
    el.details.style.transform = `translateY(${Math.max(0, delta)}px)`;
  } else if (dragStartMode === "half") {
    // Allow pull-up by up to 140px preview, pull-down unlimited.
    el.details.style.transform = `translateY(${Math.max(-140, delta)}px)`;
  }
}

function onDetailsPointerUp() {
  if (!dragging || !isMobile()) return;
  dragging = false;
  el.details.classList.remove("is-dragging");
  el.details.style.transform = "";

  const delta = dragCurrY - dragStartY;
  const THRESH = 40; // px of drag before we commit to a state change

  if (dragStartMode === "half") {
    if (delta < -THRESH) {
      setDetailsMode("full");
    } else if (delta > THRESH) {
      // Pulled down from half → dismiss entirely.
      clearSelection();
    } else {
      setDetailsMode("half");
    }
  } else if (dragStartMode === "full") {
    if (delta > THRESH) {
      setDetailsMode("half");
    } else {
      setDetailsMode("full");
    }
  }
}

el.detailsHandle.addEventListener("pointerdown", onDetailsPointerDown);
window.addEventListener("pointermove", onDetailsPointerMove);
window.addEventListener("pointerup",   onDetailsPointerUp);
window.addEventListener("pointercancel", onDetailsPointerUp);

/* Handle viewport changes. Switching from mobile → desktop (or vice
   versa) needs to reset panel state so the right CSS rules win. */
function handleViewportChange() {
  if (!isMobile()) {
    // On desktop: clear mobile-only state.
    drawerOpen = false;
    el.locations.classList.remove("is-open");
    el.locationsBackdrop.classList.remove("is-open");
    el.shell.classList.remove("drawer-open", "details-full");
    el.details.classList.remove("is-full", "is-hidden", "is-dragging");
    el.details.style.transform = "";
  } else {
    // On mobile: if details is open, restore the half state.
    if (el.shell.classList.contains("has-details")) {
      setDetailsMode("half");
    }
  }

  scheduleMapRefresh({ delay: 80 });
}
mqMobile.addEventListener?.("change", handleViewportChange);

/* -----------------------------------------------------------
   14b. Mobile search toggle
   ------------------------------------------------------------
   On desktop the search field lives permanently in the header,
   so the SEARCH button just focuses it. On mobile the search
   panel is hidden by default and the SEARCH button slides it
   in from under the header. The "x" button on the right of the
   field has two states:
     • if the input has text → clear the text
     • if empty              → close the whole panel
   ----------------------------------------------------------- */
function updateSearchBtnState() {
  if (!el.searchBtn) return;
  const open = el.metabarSearch.classList.contains("is-open");
  el.searchBtn.classList.toggle("is-active", open);
  el.searchBtn.setAttribute("aria-expanded", String(open));
}

function openSearchPanel() {
  el.metabarSearch.classList.add("is-open");
  // Let the DOM settle before focusing (avoids iOS keyboard flash)
  requestAnimationFrame(() => el.searchInput && el.searchInput.focus());
  updateSearchBtnState();
}

function closeSearchPanel() {
  el.metabarSearch.classList.remove("is-open");
  el.searchInput.value = "";
  el.searchResults.hidden = true;
  el.searchResults.innerHTML = "";
  refreshSearchClear();
  updateSearchBtnState();
}

function refreshSearchClear() {
  if (!el.searchClear) return;
  // Desktop: always hidden (the input behaves like a normal field).
  // Mobile : visible so the user can clear text or close the panel.
  if (isMobile()) {
    el.searchClear.hidden = false;
  } else {
    el.searchClear.hidden = true;
  }
}

if (el.searchBtn) {
  el.searchBtn.addEventListener("click", () => {
    if (isMobile()) {
      if (el.metabarSearch.classList.contains("is-open")) {
        closeSearchPanel();
      } else {
        openSearchPanel();
      }
    } else {
      // Desktop: just focus the field
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
}

if (el.searchClear) {
  el.searchClear.addEventListener("click", () => {
    if (el.searchInput.value) {
      // First click with text → clear it
      el.searchInput.value = "";
      el.searchResults.hidden = true;
      el.searchResults.innerHTML = "";
      el.searchInput.focus();
    } else {
      // Second click with empty input → close the panel (mobile only)
      if (isMobile()) {
        closeSearchPanel();
      }
    }
  });
}

// Keep the clear-button visibility in sync with the viewport
mqMobile.addEventListener?.("change", refreshSearchClear);
refreshSearchClear();

/* -----------------------------------------------------------
   15. Search
   ----------------------------------------------------------- */
function renderSearch(q) {
  const term = q.trim().toLowerCase();
  if (!term) { el.searchResults.hidden = true; el.searchResults.innerHTML = ""; return; }

  const matches = allFeatures
    .filter((x) => {
      const n = cleanName(x.props.name).toLowerCase();
      return n && n.includes(term);
    })
    .slice(0, 12);

  if (!matches.length) {
    el.searchResults.hidden = false;
    el.searchResults.innerHTML =
      `<div class="search-empty">No matches for "${q}".</div>`;
    return;
  }

  el.searchResults.hidden = false;
  el.searchResults.innerHTML = matches.map((m, i) => `
    <div class="search-result" data-i="${i}" role="option">
      <span>${cleanName(m.props.name)}</span>
      <span class="tag ${m.kind}">${m.kind}</span>
    </div>
  `).join("");

  el.searchResults.querySelectorAll(".search-result").forEach((node) => {
    node.addEventListener("click", () => {
      const m = matches[Number(node.dataset.i)];
      if (!m) return;
      selectFeature(m.layer, m.kind, { focus: true });
      el.searchInput.value = cleanName(m.props.name);
      el.searchResults.hidden = true;
      // On mobile, tucking the search away after a pick feels right
      if (isMobile()) closeSearchPanel();
    });
  });
}

/* -----------------------------------------------------------
   16. Event wiring
   ----------------------------------------------------------- */

/* ------- IMAGE ALIGNMENT TOOL ------- */
const alignUI = {
  btn:    $("alignBtn"),
  panel:  $("alignPanel"),
  close:  $("alignClose"),
  copy:   $("alignCopy"),
  save:   $("alignSave"),
  valLat: $("valLat"),
  valLng: $("valLng"),
  valSx:  $("valSx"),
  valSy:  $("valSy")
};

let alignMode = false;

/** Recompute bounds & push them to the live overlay. */
function reapplyAlign() {
  if (!imageOverlay || !dataBounds) return;
  imageBounds = computeImageBounds(
    dataBounds,
    config.imageWidthPx,
    config.imageHeightPx,
    config.imagePaddingPct,
    align
  );
  imageOverlay.setBounds(imageBounds);
  refreshMapConstraints();
  renderAlignValues();
  saveAlign(align);
}

function renderAlignValues() {
  alignUI.valLat.textContent = align.offsetLat.toFixed(6);
  alignUI.valLng.textContent = align.offsetLng.toFixed(6);
  alignUI.valSx .textContent = align.scaleX.toFixed(4);
  alignUI.valSy .textContent = align.scaleY.toFixed(4);
}

function nudge(dir, big) {
  // 1 base step ≈ ~2.5 m at this latitude (0.00002° lat, 0.00003° lng)
  const latStep = (big ? 0.0002  : 0.00002);
  const lngStep = (big ? 0.00024 : 0.000024);
  if (dir === "up")    align.offsetLat += latStep;
  if (dir === "down")  align.offsetLat -= latStep;
  if (dir === "left")  align.offsetLng -= lngStep;
  if (dir === "right") align.offsetLng += lngStep;
  reapplyAlign();
}

function scaleBy(axis, delta) {
  // delta is multiplicative factor, e.g. +0.002 or -0.002
  if (axis === "x") align.scaleX = Math.max(0.5, Math.min(2, align.scaleX + delta));
  if (axis === "y") align.scaleY = Math.max(0.5, Math.min(2, align.scaleY + delta));
  reapplyAlign();
}

function resetAlign() {
  align = { offsetLat: 0, offsetLng: 0, scaleX: 1, scaleY: 1 };
  reapplyAlign();
}

function toggleAlign(force) {
  alignMode = typeof force === "boolean" ? force : !alignMode;
  document.body.classList.toggle("align-mode", alignMode);
  alignUI.btn.classList.toggle("is-active", alignMode);
  alignUI.panel.hidden = !alignMode;
  if (imageOverlay) imageOverlay.setOpacity(alignMode ? 0.55 : 1);
  if (alignMode) renderAlignValues();
}

if (config.mapMode === "tiles") {
  // Tiles are already georeferenced by the XYZ grid.
  // The old image alignment tool is only for single imageOverlay mode.
  if (alignUI.btn) {
    alignUI.btn.hidden = true;
  }
} else {
  alignUI.btn  .addEventListener("click", () => toggleAlign());
  alignUI.close.addEventListener("click", () => toggleAlign(false));
  alignUI.save .addEventListener("click", () => toggleAlign(false));
}

alignUI.copy.addEventListener("click", () => {
  const snippet =
`  imageOffsetLat: ${align.offsetLat.toFixed(6)},
  imageOffsetLng: ${align.offsetLng.toFixed(6)},
  imageScaleX:    ${align.scaleX.toFixed(4)},
  imageScaleY:    ${align.scaleY.toFixed(4)},`;
  const done = () => {
    alignUI.copy.classList.add("is-copied");
    alignUI.copy.textContent = "Copied ✓";
    setTimeout(() => {
      alignUI.copy.classList.remove("is-copied");
      alignUI.copy.textContent = "Copy config";
    }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(snippet).then(done, () => fallback(snippet, done));
  } else {
    fallback(snippet, done);
  }
});
function fallback(text, cb) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); cb(); } catch (_) {}
  ta.remove();
}

alignUI.panel.addEventListener("click", (e) => {
  const nudgeBtn = e.target.closest("[data-nudge]");
  if (nudgeBtn) return nudge(nudgeBtn.dataset.nudge, e.shiftKey);

  const resetBtn = e.target.closest('[data-action="reset"]');
  if (resetBtn) return resetAlign();

  const scaleBtn = e.target.closest("[data-scale]");
  if (scaleBtn) {
    const [axis, sign] = [scaleBtn.dataset.scale[0], scaleBtn.dataset.scale[1]];
    const step = e.shiftKey ? 0.02 : 0.002;
    scaleBy(axis, sign === "+" ? step : -step);
  }
});

/* ------- Tour navigation buttons (desktop + mobile) ------- */
if (el.tourPrev)       el.tourPrev.addEventListener("click",       tourPrevAction);
if (el.tourNext)       el.tourNext.addEventListener("click",       tourNextAction);
if (el.tourPrevMobile) el.tourPrevMobile.addEventListener("click", tourPrevAction);
if (el.tourNextMobile) el.tourNextMobile.addEventListener("click", tourNextAction);

/* ------- Street view wiring --------------------------------
   • Explore CTA inside the metadata panel  → opens the viewer at
     the currently-selected building's sweep.
   • VR "Explore" button (desktop-only area) → same behaviour.
   • Explorable list rows are wired inside renderExplorable().
   • Close button hides the overlay and returns to the map.
   • Clicking the touch guard arms the 3D viewer for the first
     real interaction; it re-arms automatically on next open.
----------------------------------------------------------- */
function handleExploreClick(e) {
  if (e) e.preventDefault();
  const btn = e && e.currentTarget;
  const name    = (btn && btn.dataset.locationName)  || "";
  const sweepId = (btn && btn.dataset.sweepId)       || "";

  // Pull the latest entry in case config changed since render.
  const fresh = getTreedisEntry(name);
  const effectiveSweep = sweepId || (fresh && fresh.sweepId) || null;

  openStreetView(effectiveSweep, name, getCategory(name));
}
if (el.exploreCta) el.exploreCta.addEventListener("click", handleExploreClick);

/* The persistent desktop/iPad footer carries its own Explore button.
   Rather than duplicate the dataset/state logic above, the footer
   button simply forwards its click to the canonical #exploreCta —
   that element already has its dataset kept in sync by
   updateDetailsPanel() above and runs through handleExploreClick. */
if (el.exploreCtaFooter && el.exploreCta) {
  el.exploreCtaFooter.addEventListener("click", (e) => {
    e.preventDefault();
    el.exploreCta.click();
  });
}

/* The VR button carries a different intent than Explore: it shows
   a small instruction popup explaining how to open this location
   inside a VR headset (per the Figma annotation on the desktop
   flow). It does NOT launch the 2D street view.               */
if (el.vrBtn) {
  el.vrBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const name = el.vrBtn.dataset.locationName || "this location";
    const tourUrl = (config.treedis && config.treedis.tourUrl) || "";
    alert(
      `${name} is VR-Enabled\n\n` +
      `In your headset, navigate to:\n  ${tourUrl}\n\n` +
      `Open the tour and look for this location's door to enter.`
    );
  });
}

if (el.streetviewClose) {
  el.streetviewClose.addEventListener("click", () => closeStreetView());
}

if (el.streetviewLoadingCancel) {
  el.streetviewLoadingCancel.addEventListener("click", () => {
    console.info("[streetview] user cancelled while loading");
    closeStreetView();
  });
}

if (el.streetviewTouchGuard) {
  el.streetviewTouchGuard.addEventListener("click", () => {
    el.streetviewTouchGuard.classList.remove("is-active");
  });
}

el.fitBtn.addEventListener("click", () => {
  if (imageBounds) resetCampusView(true);
});

el.detailsClose.addEventListener("click", () => clearSelection());

if (el.searchInput) {
  el.searchInput.addEventListener("input", (e) => renderSearch(e.target.value));
  document.addEventListener("click", (e) => {
    // Don't hide results if the click is inside the search area itself
    if (e.target.closest(".metabar-search")) return;
    // Don't hide if user is tapping the SEARCH toggle button
    if (e.target.closest("#searchBtn")) return;
    el.searchResults.hidden = true;
  });
}

el.modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.modeBtns.forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    // Drive the page-level mode swap. The CSS uses `body.mode-learn`
    // to hide the .shell (Explore) and reveal the .learn-shell.
    const mode = btn.dataset.mode;          // "explore" | "learn"
    setAppMode(mode);
  });
});

window.addEventListener("resize", () => {
  scheduleMapRefresh({ delay: 80 });
});

// Help button — simple info overlay for now
el.helpBtn.addEventListener("click", () => {
  alert(
    "SCSU Metaversity\n\n" +
    "• Tap or click a location on the map to see details.\n" +
    "• Use the list on the left to jump to tour stops.\n" +
    "• Arrow buttons step through the tour.\n" +
    "• Arrow keys ← / → also navigate the tour.\n" +
    "• Press Escape to close any open panel.\n\n" +
    "Image alignment:\n" +
    "• If the satellite image doesn't line up with the polygons,\n" +
    "  click ALIGN in the header (or press Shift+A) to enter\n" +
    "  alignment mode. Use the on-screen controls or arrow keys\n" +
    "  to nudge the image, then hit Save & close."
  );
});

// Fullscreen toggle
el.fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

document.addEventListener("fullscreenchange", () => {
  scheduleMapRefresh({ delay: 80 });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    // Allow Escape inside the search field to close / blur
    if (e.key === "Escape" && e.target === el.searchInput) {
      if (isMobile() && el.metabarSearch.classList.contains("is-open")) {
        closeSearchPanel();
      } else {
        el.searchInput.blur();
        el.searchResults.hidden = true;
      }
    }
    return;
  }

  // Shift+A → toggle alignment tool
  if ((e.key === "a" || e.key === "A") && e.shiftKey) {
    toggleAlign();
    e.preventDefault();
    return;
  }

  // When alignment tool is open, arrow keys nudge the image, +/- scale
  if (alignMode) {
    if (e.key === "ArrowUp")    { nudge("up",    e.shiftKey); e.preventDefault(); }
    if (e.key === "ArrowDown")  { nudge("down",  e.shiftKey); e.preventDefault(); }
    if (e.key === "ArrowLeft")  { nudge("left",  e.shiftKey); e.preventDefault(); }
    if (e.key === "ArrowRight") { nudge("right", e.shiftKey); e.preventDefault(); }
    if (e.key === "+" || e.key === "=") {
      scaleBy("x",  e.shiftKey ? 0.02 :  0.002);
      scaleBy("y",  e.shiftKey ? 0.02 :  0.002);
      e.preventDefault();
    }
    if (e.key === "-" || e.key === "_") {
      scaleBy("x", e.shiftKey ? -0.02 : -0.002);
      scaleBy("y", e.shiftKey ? -0.02 : -0.002);
      e.preventDefault();
    }
    if (e.key === "Escape") { toggleAlign(false); }
    return;
  }

  // Otherwise: arrow keys drive the tour
  if (e.key === "ArrowRight")      { tourNextAction(); e.preventDefault(); }
  else if (e.key === "ArrowLeft")  { tourPrevAction(); e.preventDefault(); }
  else if (e.key === "Escape")     {
    if (isMobile() && el.metabarSearch.classList.contains("is-open")) {
      closeSearchPanel();
    } else if (streetViewActive) {
      // Escape is the fastest way back to the map from 3D.
      closeStreetView();
    } else if (drawerOpen) {
      closeMobileLocations();
    } else {
      clearSelection();
    }
  }
});

// Clicking the bare map clears selection
map.on("click", (e) => {
  if (e.originalEvent.target.closest(".leaflet-interactive")) return;
  // Don't steal the tap that closes the drawer
  if (drawerOpen) { closeMobileLocations(); return; }
  // When the street view is covering the map, clicks that still
  // somehow reach the Leaflet canvas (e.g., synthetic events)
  // shouldn't dismiss the current selection.
  if (streetViewActive) return;
  clearSelection();
});

/* -----------------------------------------------------------
   17. BOOT
   ----------------------------------------------------------- */

/** Try to fetch a GeoJSON file. Returns null on any failure
 *  (network error, 404, CORS, file://, non-JSON body). */
async function tryFetchGeoJSON(url) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    // Some servers serve .geojson as octet-stream or text/plain; that's fine.
    // What we really want is to not accidentally parse HTML.
    if (ct.includes("text/html")) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

/** Load both datasets. Tries fetch first (works when the
 *  page is served over http/https) and falls back to the
 *  window.SCSU_DATA shim (works when opened from disk). */
async function loadAllData() {
  const [bFetch, tFetch] = await Promise.all([
    tryFetchGeoJSON(config.dataFiles?.buildings || "data/buildings.geojson"),
    tryFetchGeoJSON(config.dataFiles?.tours     || "data/tours.geojson")
  ]);

  const fallback = window.SCSU_DATA || {};
  const empty = { type: "FeatureCollection", features: [] };

  const buildings = bFetch || fallback.buildings || empty;
  const tours     = tFetch || fallback.tours     || empty;

  const source =
    (bFetch && tFetch) ? "fetch (.geojson files)"
    : (bFetch || tFetch) ? "mixed (fetch + shim)"
    : "shim (window.SCSU_DATA)";
  console.info(`[metaversity] data loaded via ${source}`);

  return { buildings, tours };
}

/* -----------------------------------------------------------
   Asset preloading with progress tracking.

   Every promise here is defensive: it resolves (never rejects)
   on success, failure, OR after a per-asset timeout, so one
   broken URL can never soft-lock the splash. A shared counter
   updates the splash text as each asset finishes.
   ----------------------------------------------------------- */
function preloadImage(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!url) return resolve({ url, ok: false, reason: "empty" });

    const img = new Image();
    let done = false;
    const finish = (ok, reason) => {
      if (done) return;
      done = true;
      resolve({ url, ok, reason });
    };

    const timer = setTimeout(() => {
      console.warn("[preload] image timed out:", url);
      finish(false, "timeout");
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      console.warn("[preload] image failed:", url);
      finish(false, "error");
    };
    img.src = url;
  });
}

/* Resolves when Treedis posts TourReady, OR when `timeoutMs`
   elapses — whichever comes first. Never rejects. */
function waitForTreedisReady(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (TourBridge.isReady) {
      return resolve({ ok: true });
    }
    const start = Date.now();
    const t = setInterval(() => {
      if (TourBridge.isReady) {
        clearInterval(t);
        resolve({ ok: true });
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        console.warn("[preload] Treedis not ready within "
          + timeoutMs + "ms — continuing anyway");
        resolve({ ok: false, reason: "timeout" });
      }
    }, 100);
  });
}

/* Waits for TourReady (long deadline — Treedis can take 20s+ on
   cold loads), then silently Navigates the hidden iframe to the
   configured homeSweepId so the entry point is warm by the time
   the user clicks Explore.

   This runs detached from the splash. The splash never waits on
   it. If the user clicks Explore before TourReady fires, the
   warmupCancelled flag set by openStreetView() makes this bail
   before sending the home Navigate, so the user's chosen sweep
   wins.

   Only one sweep is warmed (the home sweep) — Treedis caches
   aggressively after the first nav so subsequent jumps are fast
   anyway, and blasting many navs during boot just competes with
   the model load and slows down TourReady. Never rejects. */
async function warmHomeSweep() {
  const ready = await waitForTreedisReady(60000);
  if (!ready.ok) {
    console.warn("[preload] skipping home-sweep warm-up — Treedis not ready");
    return { ok: false, reason: "not-ready" };
  }

  if (warmupCancelled) {
    console.info("[preload] home-sweep warm-up cancelled — user already navigated");
    return { ok: true, cancelled: true };
  }

  const homeSweep = (config.treedis && config.treedis.homeSweepId) || null;
  if (!homeSweep) {
    console.warn("[preload] no homeSweepId configured — skipping warm-up");
    return { ok: false, reason: "no-home-sweep" };
  }

  console.info("[preload] warming home sweep:", homeSweep);
  TourBridge.warmSweep(homeSweep);

  // Reset so the user's first real Explore click always fires a
  // fresh Navigate (otherwise the dedup in navigateStreetViewToLayer
  // would treat the click as a no-op).
  lastStreetViewSweepId = null;

  console.info("[preload] home sweep warm-up complete");
  return { ok: true };
}


/* Builds the splash-blocking task list: ONLY images. The Treedis
   iframe is started in the background by preloadTreedisIframe()
   and is intentionally NOT in this list — its boot can take 20+
   seconds and we don't want to hold the splash hostage to it.
   The user can interact with the map immediately while the
   iframe finishes loading off-screen. `onProgress(done, total)`
   is called after each image finishes. */
function preloadAllAssets(onProgress) {
  const imageUrls = [];

  // In tile mode, the base map loads tile-by-tile through Leaflet.
  // Do not block the splash screen by trying to preload one giant image.
  if (config.mapMode !== "tiles" && config.imageUrl) {
    imageUrls.push(config.imageUrl);
  }
  const imgMap = config.imageMap || {};
  for (const key in imgMap) {
    if (imgMap[key]) imageUrls.push(imgMap[key]);
  }

  const tasks = imageUrls.map((u) => preloadImage(u));

  const total = tasks.length;
  let done = 0;

  // Wrap each task so we can tick the counter as it finishes.
  const tracked = tasks.map((p) =>
    p.then((result) => {
      done += 1;
      try { onProgress && onProgress(done, total); } catch (_) {}
      return result;
    })
  );

  return Promise.all(tracked);
}

/* Updates the counter text shown on the splash. Called from
   preloadAllAssets()'s onProgress callback. */
function updateSplashProgress(done, total) {
  const node = document.getElementById("splashProgress");
  if (node) node.textContent = "Loading " + done + "/" + total + "…";
}
function addBaseTileLayer() {
  const t = config.tiles || {};

  if (!t.url) {
    console.warn("[metaversity] mapMode is 'tiles' but config.tiles.url is missing.");
    return null;
  }

  return L.tileLayer(t.url, {
    pane: "imagePane",
    minZoom: t.minZoom ?? 15,
    maxZoom: t.maxZoom ?? 20,
    maxNativeZoom: t.maxNativeZoom ?? t.maxZoom ?? 20,
    tms: !!t.tms,
    noWrap: true,
    bounds: t.bounds ? L.latLngBounds(t.bounds) : undefined,
    attribution: t.attribution || "Created by QGIS"
  }).addTo(map);
}
async function boot() {
  // If the sync UA check missed but the WebXR API confirms an
  // XR device, switch to the VR profile *before* preloading the
  // iframe — otherwise we'd point it at the desktop tour URL
  // and have to reload. The async detection was kicked off at
  // module load (detectXRAsync() is memoised), so this awaits
  // a promise that's already in flight, not a fresh probe.
  try {
    await maybeUpgradeToVRProfile();
    // Re-apply the body class — at module-load time <body>
    // might not have been parsed yet.
    document.body.classList.toggle("xr-mode", isVRMode());
  } catch (err) {
    console.warn("[treedis] XR detection failed:", err);
  }

  // Start the Treedis iframe loading in parallel with the map
  // data so it's warm by the time the user hits "Explore". The
  // iframe is still visually hidden — preloadTreedisIframe() only
  // sets the src and wires the postMessage bridge.
  preloadTreedisIframe();

  const { buildings: rawB, tours: rawT } = await loadAllData();

  const buildingsGeo = reprojectFC(rawB, config.dataCRS);
  const toursGeo     = reprojectFC(rawT, config.dataCRS);

  buildingsLayer = buildLayer(buildingsGeo, "building", "buildingsPane");
  toursLayer     = buildLayer(toursGeo,     "tour",     "toursPane");

  // Data extent (from both layers combined)
  dataBounds = L.latLngBounds([]);
  [buildingsLayer, toursLayer].forEach((l) => {
    try {
      const b = l.getBounds();
      if (b && b.isValid()) dataBounds.extend(b);
    } catch (_) {}
  });

  if (!dataBounds.isValid()) {
    console.warn("[metaversity] no valid geometry found; falling back");
    dataBounds = L.latLngBounds([33.494, -80.855], [33.502, -80.843]);
  }

// Base map: tiles are preferred for production.
// In tile mode, the raster map is already georeferenced by the XYZ tile grid.
// We do NOT compute image bounds from the polygons anymore.
if (config.mapMode === "tiles") {
  baseTileLayer = addBaseTileLayer();

  // Use explicit tile bounds if provided; otherwise use the vector data
  // bounds with padding only for fit/reset/maxBounds behavior.
  if (config.tiles && config.tiles.bounds) {
    imageBounds = L.latLngBounds(config.tiles.bounds);
  } else {
    imageBounds = dataBounds.pad((config.tiles && config.tiles.boundsPadding) ?? 0.35);
  }

  if (config.tiles && config.tiles.initialCenter && config.tiles.initialZoom) {
    map.setView(config.tiles.initialCenter, config.tiles.initialZoom, { animate: false });
  } else {
    resetCampusView(false);
  }

  refreshMapConstraints({ recenterIfNeeded: false });
} else {
  // Legacy single-image mode
  imageBounds = computeImageBounds(
    dataBounds,
    config.imageWidthPx,
    config.imageHeightPx,
    config.imagePaddingPct,
    align
  );

  imageOverlay = L.imageOverlay(config.imageUrl, imageBounds, {
    pane: "imagePane",
    interactive: false,
    opacity: 1,
    attribution: "© SC State University | Imagery: SC_2023_RGB WMTS"
  }).addTo(map);

  resetCampusView(false);
}

  // Add overlays (z-order: buildings → tours)
  buildingsLayer.addTo(map);
  toursLayer.addTo(map);

  // Tour pins
  buildTourPins();
  tourPinsLayer.addTo(map);

  // Locations list
  renderLocationsList();
  renderAllLocationsList();

  // Leaflet warm-up: force the first selected-style application
  // and immediately revert it. This pays the cost of Leaflet's
  // lazy internal setup now, while the user is still looking at
  // the splash, so the first real click feels snappy instead of
  // stuttery. We do the same for a hover style to warm that path
  // too.
  try {
    const warm = tourStops[0] && tourStops[0].layer;
    if (warm) {
      warm.setStyle({ ...config.styles.selected });
      warm.setStyle(hoverStyleFor("tour"));
      warm.setStyle(styleFor("tour"));
    }
  } catch (_) { /* non-critical */ }

  // Search index
  const push = (layer, kind) => {
    layer.eachLayer((lyr) => {
      const n = cleanName(lyr.feature.properties.name);
      if (n) allFeatures.push({ kind, layer: lyr, props: lyr.feature.properties });
    });
  };
  push(buildingsLayer, "building");
  push(toursLayer,     "tour");

  console.info("[metaversity] ready", {
    buildings: buildingsLayer.getLayers().length,
    tours:     toursLayer.getLayers().length
  });

  // Wait for the map's own assets (satellite SVG + every entry in
  // config.imageMap) before hiding the splash. The Treedis iframe
  // is intentionally NOT in this list — it boots in the background
  // via preloadTreedisIframe() and the user can interact with the
  // map while that finishes. The 15s hard cap is just a safety net
  // in case an image URL hangs.
  const preload = preloadAllAssets(updateSplashProgress);
  const hardCap = new Promise((r) => setTimeout(() => {
    console.warn("[metaversity] hard cap reached — revealing app");
    r("hardcap");
  }, 15000));
  await Promise.race([preload, hardCap]);

  // Kick off the Treedis home-sweep warm-up detached. It waits
  // for TourReady (up to 60s) then nudges the iframe to the home
  // sweep so the first Explore click feels instant. Runs in the
  // background while the user is exploring the map.
  warmHomeSweep().catch((err) => {
    console.warn("[preload] home-sweep warm-up errored:", err);
  });

  // Reveal app
  requestAnimationFrame(() => {
    el.app.setAttribute("aria-hidden", "false");
    el.app.classList.add("is-ready");
    el.splash.classList.add("is-hidden");
    setTimeout(() => { el.splash.style.display = "none"; }, 500);
    scheduleMapRefresh({ delay: 80 });

    // Show the welcome / start screen modal. The user picks
    // between "Enter Experience" (just dismiss) and "How to Use"
    // (start the coachmark walkthrough). Only show on the first
    // boot — re-opens are driven from the burger menu.
    if (typeof showStartScreen === "function") {
      // Small delay so the splash fade-out doesn't visually clash
      // with the start screen fade-in.
      setTimeout(() => showStartScreen(), 220);
    }
  });
}

// Kick off boot immediately. The splash hides as soon as the
// satellite image and building photos are loaded. The Treedis
// iframe continues loading in the background and warms its home
// sweep when ready (see warmHomeSweep inside boot).

/* ============================================================
   START SCREEN + COACHMARK WALKTHROUGH
   ------------------------------------------------------------
   First-run welcome modal with two paths:

     • "Enter Experience" — dismisses the modal; the user
       gets the campus map in its default state.
     • "How to Use"       — runs a 3-step coachmark sequence
       that highlights the left sidebar, the top bar, and the
       right details panel.

   The coachmark sequence starts by selecting the first tour
   stop (Crawford-Zimmerman) so the right details panel is
   populated with real content the user can see being pointed
   to. When the walkthrough finishes (final step's "next" or
   the X button), we clear that selection and reset the
   campus view so the app is back to its untouched state.

   The walkthrough is also reachable from the burger menu's
   "How to use" link at any time after the initial visit.
   ============================================================ */
(function setupOnboarding() {
  // Pull the DOM nodes once. If any are missing we silently
  // disable the feature rather than throw — the rest of the
  // app should still work.
  const startScreen   = document.getElementById("startScreen");
  const startEnterBtn = document.getElementById("startEnterBtn");
  const startHowBtn   = document.getElementById("startHowToUseBtn");

  const overlay     = document.getElementById("coachmarkOverlay");
  const card        = document.getElementById("coachmarkCard");
  const ring        = document.getElementById("coachmarkRing");
  const titleEl     = document.getElementById("coachmarkTitle");
  const bodyEl      = document.getElementById("coachmarkBody");
  const prevBtn     = document.getElementById("coachmarkPrev");
  const nextBtn     = document.getElementById("coachmarkNext");
  const closeBtn    = document.getElementById("coachmarkClose");
  const currentEl   = document.getElementById("coachmarkCurrent");
  const totalEl     = document.getElementById("coachmarkTotal");
  const burgerHowTo = document.getElementById("burgerHowToUse");
  const burgerCheckbox = document.getElementById("burgerToggle");

  // New: the two mirrored controls for the "show start screen
  // on startup" preference. The start-screen one is worded
  // negatively ("Don't show again") so its `checked` state is
  // INVERTED relative to the underlying preference.
  const suppressCheckbox = document.getElementById("startScreenSuppress");
  const startupSwitch    = document.getElementById("burgerShowStartScreen");

  // Mirrored controls for the "show 3D navigation instructions"
  // preference. Same pattern: modal checkbox is inverted, burger
  // switch is direct. Separate localStorage key so the two
  // settings don't conflict.
  const navModal           = document.getElementById("navInstructions");
  const navGotItBtn        = document.getElementById("navInstructionsGotIt");
  const navSuppressCheckbox = document.getElementById("navInstructionsSuppress");
  const navInstructionsSwitch = document.getElementById("burgerShowNavInstructions");

  if (!startScreen || !overlay || !card) {
    console.warn("[onboarding] required nodes missing — disabled");
    return;
  }

  /* -- Preferences ------------------------------------------
     Two independent settings, both stored in localStorage:
       • scsu:showStartScreen   — welcome window on boot
       • scsu:showNavInstructions — 3D nav modal on first
                                    Explore click of a session
     Both default to "show" (true) when no value is stored.
     The same read/write helpers handle both, parameterized by
     storage key. --------------------------------------------- */
  const PREF_KEY = "scsu:showStartScreen";
  const NAV_PREF_KEY = "scsu:showNavInstructions";

  function readPref(key) {
    try {
      const v = localStorage.getItem(key);
      // Default to true when nothing is stored yet.
      return v === null ? true : v === "1";
    } catch (_) {
      // localStorage can throw in private mode / sandboxed
      // contexts — fall back to "always show".
      return true;
    }
  }

  function writePref(key, show) {
    try {
      localStorage.setItem(key, show ? "1" : "0");
    } catch (_) {
      // Silent — preference just won't persist this session.
    }
  }

  // Backwards-compatible aliases so the existing showStartScreen
  // call sites don't need to change.
  function readShowOnStartup()        { return readPref(PREF_KEY); }
  function writeShowOnStartup(show)   { writePref(PREF_KEY, show); }
  function readShowNavInstructions()  { return readPref(NAV_PREF_KEY); }
  function writeShowNavInstructions(show) { writePref(NAV_PREF_KEY, show); }

  // Push current preferences into all four controls. Called
  // at init and whenever any control changes so its mirror
  // stays in sync.
  function syncPrefControls() {
    const showStart = readShowOnStartup();
    if (suppressCheckbox) suppressCheckbox.checked = !showStart; // inverted
    if (startupSwitch)    startupSwitch.checked    = showStart;

    const showNav = readShowNavInstructions();
    if (navSuppressCheckbox)  navSuppressCheckbox.checked  = !showNav; // inverted
    if (navInstructionsSwitch) navInstructionsSwitch.checked = showNav;
  }

  // The four edge masks that collectively dim everything around
  // the highlighted target rectangle.
  const masks = {
    top:    overlay.querySelector('[data-mask="top"]'),
    right:  overlay.querySelector('[data-mask="right"]'),
    bottom: overlay.querySelector('[data-mask="bottom"]'),
    left:   overlay.querySelector('[data-mask="left"]')
  };

  /* -- Step definitions ------------------------------------
     `getRect()` returns the on-screen rect of the element to
     highlight. We resolve it lazily per-step so a layout shift
     between steps (e.g. details panel opening) is reflected.
     `placement` controls which side of the highlight the card
     sits on. ------------------------------------------------- */
     const STEPS = [
      {
        id: "left-sidebar",
        desktop: {
          title: "Locations Sidebar",
          body: "Browse all campus locations here. Use the search bar to find " +
                "buildings or courses, switch between Featured and All to filter " +
                "the list, and follow the Guided Tour at the bottom to step " +
                "through key stops in order.",
          getRect: () => {
            const node = document.getElementById("locations");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "right"
        },
        mobile: {
          title: "Locations Menu",
          body: "Tap the Locations button to open the full list of campus " +
                "stops. From there you can search, switch between Featured " +
                "and All, and follow the Guided Tour in order.",
          getRect: () => {
            const node = document.getElementById("locationsToggle");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        }
      },
      {
        id: "top-bar",
        desktop: {
          title: "Top Navigation",
          body:
            "Toggle between Explore and Learn modes from the pill at the top " +
            "of the screen. The menu icon on the right opens shortcuts, " +
            "including this walkthrough — you can reopen it any time from " +
            "“How to use”.",
          getRect: () => {
            const node = document.querySelector(".metabar");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        },
        mobile: {
          title: "Top Navigation",
          body:
            "Switch between Explore and Learn from the pill at the top. " +
            "Tap the menu icon for shortcuts, including this walkthrough " +
            "(reopen it any time from “How to use”).",
          getRect: () => {
            const node = document.querySelector(".metabar");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        }
      },
      {
        id: "right-panel",
        desktop: {
          title: "Location Details",
          body: "When you select a building from the map, sidebar, search, or " +
                "guided tour, its details appear here. Tap Explore to drop into " +
                "an immersive street view (where available), and use the " +
                "Explorable Locations list to jump to specific rooms or sub-areas.",
          getRect: () => {
            const node = document.getElementById("details");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "left"
        },
        mobile: {
          title: "Location Details",
          body: "When you pick a stop, its details slide up from the bottom. " +
                "Drag the panel up for the full view — including the Explore " +
                "button for street view and the list of rooms inside.",
          getRect: () => {
            const node = document.getElementById("details");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "top"     // card sits ABOVE the bottom sheet on mobile
        }
      }
    ];

  let stepIndex = 0;
  let active    = false;
  let resizeRaf = 0;
  let prevFocus = null;

  /* -- Layout helpers ---------------------------------------
     positionCutout() applies inline geometry to the four mask
     rectangles so they cover everything except the supplied
     target rect. positionCard() places the tooltip relative
     to that rect and chooses an arrow orientation that points
     at the target. --------------------------------------- */

  function positionCutout(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect || rect.width === 0 || rect.height === 0) {
      // No measurable target — fully dim the screen and skip
      // the ring. The card will fall back to centered.
      masks.top.style.cssText    = "top:0;left:0;width:100%;height:100%";
      masks.right.style.cssText  = "top:0;left:0;width:0;height:0";
      masks.bottom.style.cssText = "top:0;left:0;width:0;height:0";
      masks.left.style.cssText   = "top:0;left:0;width:0;height:0";
      ring.style.display = "none";
      return;
    }

    // Inset the cutout slightly so the ring has visual breathing
    // room without obscuring content beyond the actual target.
    const pad = 6;
    const x  = Math.max(0, rect.left   - pad);
    const y  = Math.max(0, rect.top    - pad);
    const w  = Math.min(vw - x, rect.width  + pad * 2);
    const h  = Math.min(vh - y, rect.height + pad * 2);

    // Top strip — full width, from 0 to y
    masks.top.style.top    = "0";
    masks.top.style.left   = "0";
    masks.top.style.width  = vw + "px";
    masks.top.style.height = y + "px";

    // Bottom strip — full width, from y+h to vh
    masks.bottom.style.top    = (y + h) + "px";
    masks.bottom.style.left   = "0";
    masks.bottom.style.width  = vw + "px";
    masks.bottom.style.height = Math.max(0, vh - (y + h)) + "px";

    // Left strip — only the band beside the cutout
    masks.left.style.top    = y + "px";
    masks.left.style.left   = "0";
    masks.left.style.width  = x + "px";
    masks.left.style.height = h + "px";

    // Right strip — only the band beside the cutout
    masks.right.style.top    = y + "px";
    masks.right.style.left   = (x + w) + "px";
    masks.right.style.width  = Math.max(0, vw - (x + w)) + "px";
    masks.right.style.height = h + "px";

    // Subtle outline on the cutout itself
    ring.style.display = "block";
    ring.style.top    = y + "px";
    ring.style.left   = x + "px";
    ring.style.width  = w + "px";
    ring.style.height = h + "px";
  }

  function positionCard(rect, placement) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = card.offsetWidth  || 360;
    const cardH = card.offsetHeight || 180;
    const gap   = 18;
    const edge  = 16;

    let top, left, arrow = "none";

    if (!rect || rect.width === 0 || rect.height === 0) {
      // Centered fallback
      top  = Math.max(edge, (vh - cardH) / 2);
      left = Math.max(edge, (vw - cardW) / 2);
      card.dataset.arrow = "none";
      card.style.top  = top  + "px";
      card.style.left = left + "px";
      return;
    }

    // Pick the placement, then clamp into viewport with a tiny
    // edge margin so the card never sits off-screen.
    switch (placement) {
      case "right":
        left  = rect.right + gap;
        top   = rect.top   + Math.min(40, rect.height / 2 - 24);
        arrow = "left";
        break;
      case "left":
        left  = rect.left - gap - cardW;
        top   = rect.top   + Math.min(40, rect.height / 2 - 24);
        arrow = "right";
        break;
      case "bottom":
        left  = rect.left + Math.min(40, rect.width / 2 - 24);
        top   = rect.bottom + gap;
        arrow = "top";
        break;
      case "top":
      default:
        left  = rect.left + Math.min(40, rect.width / 2 - 24);
        top   = rect.top - gap - cardH;
        arrow = "bottom";
        break;
    }

    // If the chosen placement runs off-screen, fall back to a
    // centered (no-arrow) position rather than clamping the
    // card on top of the highlight.
    const fitsHoriz = left >= edge && (left + cardW) <= (vw - edge);
    const fitsVert  = top  >= edge && (top  + cardH) <= (vh - edge);

    if (!fitsHoriz || !fitsVert) {
      // Try to keep the original axis intent if possible.
      if (placement === "right" || placement === "left") {
        // Horizontal placement failed — center horizontally,
        // place under the target.
        left  = Math.max(edge, Math.min(vw - cardW - edge, (vw - cardW) / 2));
        top   = rect.bottom + gap;
        if (top + cardH > vh - edge) {
          top = Math.max(edge, rect.top - gap - cardH);
        }
        arrow = "none";
      } else {
        // Vertical placement failed — center vertically, place
        // beside the target on whichever side has more room.
        const roomRight = vw - rect.right;
        const roomLeft  = rect.left;
        if (roomRight >= roomLeft) {
          left  = Math.min(vw - cardW - edge, rect.right + gap);
          arrow = "left";
        } else {
          left  = Math.max(edge, rect.left - gap - cardW);
          arrow = "right";
        }
        top = Math.max(edge, Math.min(vh - cardH - edge, (vh - cardH) / 2));
      }

      // Final clamp
      left = Math.max(edge, Math.min(vw - cardW - edge, left));
      top  = Math.max(edge, Math.min(vh - cardH - edge, top));
    }

    card.dataset.arrow = arrow;
    card.style.top  = top  + "px";
    card.style.left = left + "px";
  }

  function renderStep() {
    const stepBase = STEPS[stepIndex];
    if (!stepBase) return;

    // Resolve the variant for the current viewport. Fall back to
    // desktop if the mobile variant isn't defined for some step.
    const step = (isMobile() && stepBase.mobile) ? stepBase.mobile
                                                 : stepBase.desktop;

    titleEl.textContent = step.title;
    bodyEl.textContent  = step.body;
    currentEl.textContent = String(stepIndex + 1);
    totalEl.textContent   = String(STEPS.length);

    const isFirst = stepIndex === 0;
    const isLast  = stepIndex === STEPS.length - 1;
    prevBtn.hidden = isFirst;
    nextBtn.hidden = false;
    nextBtn.textContent = isLast ? "Finish" : "Next";
    nextBtn.classList.toggle("coachmark-nav-finish", isLast);

    requestAnimationFrame(() => {
      const rect = step.getRect && step.getRect();
      positionCutout(rect);
      requestAnimationFrame(() => positionCard(rect, step.placement));
    });
  }

  function onResize() {
    if (!active) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const stepBase = STEPS[stepIndex];
      if (!stepBase) return;
      const step = (isMobile() && stepBase.mobile) ? stepBase.mobile
                                                   : stepBase.desktop;
      const rect = step.getRect && step.getRect();
      positionCutout(rect);
      positionCard(rect, step.placement);
    });
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeWalkthrough();
    } else if (e.key === "ArrowRight") {
      if (stepIndex < STEPS.length - 1) {
        stepIndex += 1;
        renderStep();
      }
    } else if (e.key === "ArrowLeft") {
      if (stepIndex > 0) {
        stepIndex -= 1;
        renderStep();
      }
    }
  }

  /* -- Open / close ----------------------------------------- */

  function openWalkthrough() {
    if (active) return;
    active = true;
    stepIndex = 0;

    // Remember focus so we can restore it on close.
    prevFocus = document.activeElement;

    // Programmatically pick the first tour stop so the right
    // details panel has real content to point at. This drives
    // the same `selectFeature` path that a normal click would.
    try {
      if (Array.isArray(tourStops) && tourStops.length) {
        // goToStop already handles selecting + flying to bounds.
        goToStop(0);
      }
    } catch (err) {
      console.warn("[onboarding] could not focus first tour stop:", err);
    }

    document.body.classList.add("coachmarks-active");
    overlay.setAttribute("aria-hidden", "false");

    // Allow the details panel layout transition to settle
    // before measuring. 320ms covers the 260ms map-refresh
    // delay used elsewhere.
    setTimeout(() => {
      renderStep();
      // Move focus into the card and trap Tab navigation
      // there. We do this after renderStep so the buttons
      // hidden state for the current step is settled (the
      // first step has no Previous button so focus shouldn't
      // start there).
      try { closeBtn.focus({ preventScroll: true }); }
      catch (_) { /* ignore */ }
      installFocusTrap(card);
    }, 320);

    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
  }

  function closeWalkthrough() {
    if (!active) return;
    active = false;

    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("coachmarks-active");
    removeFocusTrap();

    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);

    // Defensive: collapse the masks/ring/card to zero size so
    // even if a browser leaves them paintable for a frame, they
    // can't swallow clicks. The CSS pointer-events guard should
    // already prevent this, but inline-style cleanup is cheap
    // insurance.
    try {
      Object.values(masks).forEach((m) => {
        m.style.cssText = "top:0;left:0;width:0;height:0";
      });
      ring.style.cssText = "display:none;top:0;left:0;width:0;height:0";
      card.style.top = "";
      card.style.left = "";
      card.dataset.arrow = "none";
    } catch (_) { /* ignore */ }

    // Reset everything we touched: clear the auto-selected
    // building, close the details panel, and put the map
    // back at the campus-wide default view.
    try { if (typeof clearSelection === "function") clearSelection(); }
    catch (err) { console.warn("[onboarding] clearSelection failed:", err); }

    try {
      if (typeof resetCampusView === "function") resetCampusView(true);
    } catch (err) {
      console.warn("[onboarding] resetCampusView failed:", err);
    }

    // Restore focus
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus({ preventScroll: true }); }
      catch (_) { /* ignore */ }
    }
    prevFocus = null;
  }

  function nextStep() {
    if (stepIndex >= STEPS.length - 1) {
      // Last step — "Next" finishes the walkthrough. Per the
      // spec, the final step's button is hidden, so this is
      // really only reachable via ArrowRight. Treat it as a
      // graceful close.
      closeWalkthrough();
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function prevStep() {
    if (stepIndex <= 0) return;
    stepIndex -= 1;
    renderStep();
  }

  /* -- Start screen ---------------------------------------- */

  /* -- Focus trap -------------------------------------------
     A modal that visually blocks the page must also block
     keyboard navigation, otherwise Tab can land focus on the
     burger button or the search input behind the dim layer.
     We install a single document-level keydown listener while
     a trap is active and bounce focus back when it tries to
     leave the trapped container.

     The trap also intercepts Tab cycling so Shift+Tab from
     the first focusable wraps to the last and vice versa,
     which is the standard accessible-modal pattern. -------- */
  let activeTrapContainer = null;

  function getFocusables(container) {
    if (!container) return [];
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(container.querySelectorAll(selector))
      .filter((node) => {
        // Skip nodes that are visually hidden — the visually-
        // hidden checkbox inputs we use under custom styling
        // are still focusable, which is what we want, so the
        // only thing we filter out here is `display: none`.
        if (node.offsetParent === null && node.getClientRects().length === 0) {
          // Allow our visually-hidden-but-focusable inputs through:
          // they have offsetParent null only when truly hidden.
          // The clip-path trick keeps offsetParent set, but the
          // CSS `clip` rect trick we use does not. Detect ours
          // by class so they stay reachable.
          if (node.matches('input[type="checkbox"]')) return true;
          return false;
        }
        return true;
      });
  }

  function onTrapKeydown(e) {
    if (e.key !== "Tab" || !activeTrapContainer) return;
    const focusables = getFocusables(activeTrapContainer);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const current = document.activeElement;

    if (e.shiftKey) {
      if (current === first || !activeTrapContainer.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (current === last || !activeTrapContainer.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function installFocusTrap(container) {
    activeTrapContainer = container;
    document.addEventListener("keydown", onTrapKeydown, true);
  }

  function removeFocusTrap() {
    activeTrapContainer = null;
    document.removeEventListener("keydown", onTrapKeydown, true);
  }

  function showStartScreen(opts) {
    // If the user has previously checked "Don't show again",
    // skip the modal on natural boots. Burger-menu re-opens
    // pass { force: true } to override.
    const force = !!(opts && opts.force);
    if (!force && !readShowOnStartup()) return;

    // Always re-sync the controls before showing — the user
    // might have toggled the burger-panel switch in a previous
    // session and we want the checkbox to reflect that state.
    syncPrefControls();

    startScreen.setAttribute("aria-hidden", "false");

    // Mark the body so any global keyboard shortcuts (Escape
    // to close panels, Shift+A for align, etc.) can opt out
    // while the modal is open.
    document.body.classList.add("modal-open");

    // Move focus into the modal for screen readers and keyboard
    // users, then trap Tab navigation inside it so the user
    // can't accidentally focus the burger button or any other
    // background control sitting visually-hidden behind the dim
    // layer.
    if (startEnterBtn) {
      requestAnimationFrame(() => {
        try { startEnterBtn.focus({ preventScroll: true }); }
        catch (_) { /* ignore */ }
      });
    }
    installFocusTrap(startScreen);
  }

  function hideStartScreen() {
    startScreen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    removeFocusTrap();
  }

  /* -- Navigation Instructions modal ------------------------
     Same modal pattern as the start screen but for the 3D
     street view onboarding. Shows the first time the user
     clicks Explore on a building's details panel (or any
     other path that opens street view), unless they've
     opted out. Single "Got it" button + "Don't show again"
     checkbox. -------------------------------------------- */

  function showNavInstructions(opts) {
    if (!navModal) return false;

    const force = !!(opts && opts.force);
    if (!force && !readShowNavInstructions()) return false;

    syncPrefControls();
    navModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (navGotItBtn) {
      requestAnimationFrame(() => {
        try { navGotItBtn.focus({ preventScroll: true }); }
        catch (_) { /* ignore */ }
      });
    }
    installFocusTrap(navModal);
    return true;
  }

  function hideNavInstructions() {
    if (!navModal) return;
    navModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    removeFocusTrap();
  }

  /* -- openStreetView gating wrapper ------------------------
     The 3D nav-instructions modal must show on the first
     street-view open within a session. There are several call
     sites that open street view (the Explore CTA, the sub-list
     "Room 100"/etc rows, the locations list while inside SV,
     internal warm-ups), so the cleanest seam is the function
     itself: we monkey-patch window.openStreetView once, and
     every caller automatically goes through the gate.

     Skipped when:
       • the preference is off
       • street view is already active (mid-session navigation
         between sweeps shouldn't re-prompt)
     ------------------------------------------------------- */
  let pendingStreetViewArgs = null;
  let originalOpenStreetView = null;

  function installStreetViewGate() {
    if (typeof window.openStreetView !== "function") {
      console.warn("[onboarding] openStreetView not on window — gate disabled");
      return;
    }
    originalOpenStreetView = window.openStreetView;

    window.openStreetView = function gatedOpenStreetView() {
      const args = Array.prototype.slice.call(arguments);

      // Mid-session navigation between sweeps — skip the modal.
      if (typeof streetViewActive !== "undefined" && streetViewActive) {
        return originalOpenStreetView.apply(this, args);
      }

      // Preference says skip → straight through.
      if (!readShowNavInstructions()) {
        return originalOpenStreetView.apply(this, args);
      }

      // Cache the args, show the modal. The "Got it" handler
      // replays the call by invoking the original function
      // directly with these same arguments.
      pendingStreetViewArgs = args;
      showNavInstructions();
      // Returning undefined matches the original's signature.
    };
  }

  function replayPendingStreetView() {
    if (!pendingStreetViewArgs || !originalOpenStreetView) return;
    const args = pendingStreetViewArgs;
    pendingStreetViewArgs = null;
    try { originalOpenStreetView.apply(null, args); }
    catch (err) {
      console.warn("[onboarding] failed to replay street view:", err);
    }
  }

  // Expose to boot()
  window.showStartScreen = showStartScreen;

  /* -- Wire up event listeners ----------------------------- */

  if (startEnterBtn) {
    startEnterBtn.addEventListener("click", () => {
      hideStartScreen();
    });
  }

  if (startHowBtn) {
    startHowBtn.addEventListener("click", () => {
      hideStartScreen();
      // Brief pause so the start-screen fade-out completes
      // before the coachmark fade-in begins.
      setTimeout(openWalkthrough, 200);
    });
  }

  prevBtn.addEventListener("click", prevStep);
  nextBtn.addEventListener("click", nextStep);
  closeBtn.addEventListener("click", closeWalkthrough);

  // The burger menu's "How to use" link reopens the walkthrough.
  // We close the burger panel first by unchecking its checkbox.
  if (burgerHowTo) {
    burgerHowTo.addEventListener("click", (e) => {
      e.preventDefault();
      if (burgerCheckbox) burgerCheckbox.checked = false;
      // Wait for the panel slide-out animation (.26s) before
      // starting so the dim layer doesn't fight the slide.
      setTimeout(openWalkthrough, 280);
    });
  }

  /* -- Mirrored "show on startup" preference controls -------
     The start-screen checkbox is worded negatively
     ("Don't show again") and the burger-panel switch is worded
     positively ("Show welcome screen on startup"). They both
     write the same flag, so toggling either one immediately
     updates the other for visual consistency. -------------- */
  if (suppressCheckbox) {
    suppressCheckbox.addEventListener("change", () => {
      writeShowOnStartup(!suppressCheckbox.checked);
      syncPrefControls();
    });
  }
  if (startupSwitch) {
    startupSwitch.addEventListener("change", () => {
      writeShowOnStartup(startupSwitch.checked);
      syncPrefControls();
    });
  }

  /* -- Nav-instructions modal: button + mirrored controls -- */
  if (navGotItBtn) {
    navGotItBtn.addEventListener("click", () => {
      hideNavInstructions();
      // Replay the deferred openStreetView() call that
      // triggered this modal.
      replayPendingStreetView();
    });
  }
  if (navSuppressCheckbox) {
    navSuppressCheckbox.addEventListener("change", () => {
      writeShowNavInstructions(!navSuppressCheckbox.checked);
      syncPrefControls();
    });
  }
  if (navInstructionsSwitch) {
    navInstructionsSwitch.addEventListener("change", () => {
      writeShowNavInstructions(navInstructionsSwitch.checked);
      syncPrefControls();
    });
  }

  // Install the gate AFTER the rest of app.js has run, so
  // window.openStreetView exists. The IIFE itself runs at
  // script-load time, but openStreetView is declared at
  // top-level above this IIFE so it's already on `window`.
  installStreetViewGate();

  // Reflect any stored preference into both controls now so
  // they're correct even before the start screen ever opens.
  syncPrefControls();
})();

boot().catch((err) => {
  console.error("[metaversity] fatal:", err);
  el.splash.innerHTML =
    "<div style='font-family:monospace;padding:24px;color:#b91c1c;" +
    "text-align:center;max-width:480px'>" +
    "Failed to initialise the map:<br><br><code>" +
    String(err && err.message || err) + "</code></div>";
});

/* ===========================================================
   LEARN MODE
   -----------------------------------------------------------
   The Explore/Learn pill in the header swaps which "shell" is
   visible. Explore is the existing map experience; Learn shows
   a course catalog (left list, right detail). Course content is
   read from window.SCSU_DATA.courses, populated by data/courses.js.

   This block is intentionally self-contained — it doesn't reach
   into the map module beyond the small `setAppMode` call. If
   data/courses.js fails to load, the page degrades to an empty
   list with a friendly message (the script tag has onerror and
   the array fallback below ensures we never throw).
   =========================================================== */
(function initLearnMode() {
  const courses = (window.SCSU_DATA && window.SCSU_DATA.courses) || [];

  // Cache learn-mode DOM. None of these are required for Explore
  // to function — if the markup is missing for any reason, every
  // method below quietly no-ops.
  const L = {
    shell:        document.getElementById("learnShell"),
    list:         document.getElementById("courseList"),
    count:        document.getElementById("coursesCount"),
    empty:        document.getElementById("courseEmpty"),
    body:         document.getElementById("courseBody"),
    actions:      document.getElementById("courseActions"),
    heroStamp:    document.getElementById("courseHeroStamp"),
    hero:      document.getElementById("courseHero"),
    code:         document.getElementById("courseCode"),
    credits:      document.getElementById("courseCredits"),
    updated:      document.getElementById("courseUpdated"),
    title:        document.getElementById("courseTitle"),
    lede:         document.getElementById("courseLede"),
    overview:     document.getElementById("courseOverview"),
    curriculum:   document.getElementById("courseCurriculum"),
    beginBtn:     document.getElementById("courseBeginBtn"),
    back:         document.getElementById("courseBack"),
    vr:           document.getElementById("courseVr"),
    vrHelp:       document.getElementById("courseVrHelp"),
    vrTooltip:    document.getElementById("courseVrTooltip"),
    vrNote:       document.getElementById("courseVrNote")
  };

  // Bail if the Learn shell isn't in the DOM. We still expose
  // setAppMode below so the click handler doesn't error out;
  // it'll just no-op the learn half.
  if (!L.shell) {
    window.setAppMode = function (mode) {
      document.body.classList.toggle("mode-learn", mode === "learn");
    };
    return;
  }

  let activeCourseId = null;

  /* ---- Render: course list ---- */
  function renderCourseList() {
    if (!L.list) return;
    L.list.innerHTML = "";
    if (L.count) L.count.textContent = String(courses.length);

    if (!courses.length) {
      const empty = document.createElement("li");
      empty.className = "locations-empty";          // reuses existing style
      empty.textContent = "No courses available yet.";
      L.list.appendChild(empty);
      return;
    }

    courses.forEach((c) => {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "course-row";
      btn.dataset.courseId = c.id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", "false");

      const text = document.createElement("div");
      text.className = "course-row-text";
      const name = document.createElement("div");
      name.className = "course-row-name";
      name.textContent = c.title || "(untitled)";
      const code = document.createElement("div");
      code.className = "course-row-code";
      code.textContent = c.code || "";
      text.appendChild(name);
      text.appendChild(code);

      const chev = document.createElement("span");
      chev.className = "course-row-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "›";

      btn.appendChild(text);
      btn.appendChild(chev);
      btn.addEventListener("click", () => selectCourse(c.id));

      li.appendChild(btn);
      L.list.appendChild(li);
    });
  }

  /* ---- Render: course detail panel ---- */
  function renderCourseDetail(course) {
    if (!course) {
      // No selection — show empty state, hide article AND the
      // persistent action bar (it has no course to act on).
      if (L.empty)   L.empty.style.display = "";
      if (L.body)    L.body.hidden = true;
      if (L.actions) L.actions.hidden = true;
      return;
    }

    if (L.empty)   L.empty.style.display = "none";
    if (L.body)    L.body.hidden = false;
    if (L.actions) L.actions.hidden = false;

    if (L.code)     L.code.textContent     = course.code || "";
    if (L.credits)  L.credits.textContent  = course.credits || "";
    if (L.updated)  L.updated.textContent  = course.lastUpdated || "—";
    if (L.title)    L.title.textContent    = course.title || "";
    if (L.lede)     L.lede.textContent     = course.lede || "";
    if (L.overview) L.overview.textContent = course.overview || "";

    // Hero — bind real artwork if the course has an `image` field;
    // otherwise fall back to the watermarked placeholder. Mirrors
    // the .details-image.has-image bind used in Explore mode so
    // the two modes stay visually consistent.
    if (L.hero) {
      // Reset to placeholder state first so navigating between
      // courses doesn't leave a stale <img> behind.
      L.hero.classList.remove("has-image");
      const oldImg = L.hero.querySelector("img");
      if (oldImg) oldImg.remove();

      if (course.image) {
        const img = document.createElement("img");
        img.src = course.image;
        img.alt = course.title || "";
        // If the file 404s, drop back to the placeholder.
        img.onerror = () => {
          L.hero.classList.remove("has-image");
          img.remove();
        };
        L.hero.appendChild(img);
        L.hero.classList.add("has-image");
      }
    }

    // Hero watermark — still set even when an image is bound, so
    // the placeholder is correct if the image fails to load.
    if (L.heroStamp) {
      const stamp = (course.code || "").replace(/\s+/g, "");
      L.heroStamp.textContent = stamp;
    }

    if (L.curriculum) {
      L.curriculum.innerHTML = "";
      (course.curriculum || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        L.curriculum.appendChild(li);
      });
    }

    // VR-Enabled chip + tooltip
    const imm = course.immersive;
    if (imm && L.vr) {
      L.vr.hidden = false;
      if (L.vrNote) L.vrNote.textContent = imm.note || "";
    } else if (L.vr) {
      L.vr.hidden = true;
      hideVrTooltip();
    }

    // Begin Course CTA — open VR URL if immersive, otherwise
    // just log for now (placeholder behavior until real course
    // launch routes are wired up).
    if (L.beginBtn) {
      L.beginBtn.onclick = () => {
        if (imm && imm.vrUrl && imm.vrUrl !== "https://www.#") {
          window.open(imm.vrUrl, "_blank", "noopener");
        } else {
          // Soft-noop on placeholder URLs so a stray click
          // doesn't navigate the page somewhere unhelpful.
          console.info("[learn] begin course:", course.id);
        }
      };
    }
  }

  /* ---- Selection ---- */
  function selectCourse(id) {
    const course = courses.find((c) => c.id === id);
    activeCourseId = course ? course.id : null;

    // Update list active state
    if (L.list) {
      L.list.querySelectorAll(".course-row").forEach((row) => {
        const isActive = row.dataset.courseId === activeCourseId;
        row.classList.toggle("is-active", isActive);
        row.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    renderCourseDetail(course);

    // Mobile: slide the detail pane in over the list.
    L.shell.classList.toggle("has-detail", !!course);

    // Move keyboard focus to the detail title for screen-reader
    // users coming from the list. Only on small screens — on
    // desktop the list stays in focus so arrow-keying through
    // courses is smooth.
    if (course && isMobile() && L.title) {
      L.title.setAttribute("tabindex", "-1");
      L.title.focus({ preventScroll: false });
    }
  }

  /* ---- VR tooltip toggle ---- */
  function showVrTooltip() {
    if (!L.vrTooltip) return;
    L.vrTooltip.classList.add("is-open");
    L.vrTooltip.setAttribute("aria-hidden", "false");
    if (L.vrHelp) L.vrHelp.setAttribute("aria-expanded", "true");
  }
  function hideVrTooltip() {
    if (!L.vrTooltip) return;
    L.vrTooltip.classList.remove("is-open");
    L.vrTooltip.setAttribute("aria-hidden", "true");
    if (L.vrHelp) L.vrHelp.setAttribute("aria-expanded", "false");
  }

  if (L.vrHelp) {
    L.vrHelp.setAttribute("aria-expanded", "false");
    L.vrHelp.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = L.vrTooltip && L.vrTooltip.classList.contains("is-open");
      if (open) hideVrTooltip(); else showVrTooltip();
    });
    // Click-away to dismiss
    document.addEventListener("click", (e) => {
      if (!L.vrTooltip || !L.vrTooltip.classList.contains("is-open")) return;
      if (e.target === L.vrHelp || L.vrTooltip.contains(e.target)) return;
      hideVrTooltip();
    });
    // Escape to dismiss
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && L.vrTooltip &&
          L.vrTooltip.classList.contains("is-open")) {
        hideVrTooltip();
      }
    });
  }

  /* ---- Mobile back button — return to list view ---- */
  if (L.back) {
    L.back.addEventListener("click", () => {
      L.shell.classList.remove("has-detail");
      hideVrTooltip();
    });
  }

  /* ---- App-mode switcher (called by the .mode-btn handler) ---- */
  window.setAppMode = function (mode) {
    const learn = mode === "learn";
    document.body.classList.toggle("mode-learn", learn);

    L.shell.setAttribute("aria-hidden", learn ? "false" : "true");

    // Mirror sane defaults each time we enter Learn.
    if (learn) {
      // On desktop, auto-pick the first course so the right
      // pane isn't empty. On mobile we keep the list view.
      if (!activeCourseId && !isMobile() && courses.length) {
        selectCourse(courses[0].id);
      }
    } else {
      // Leaving Learn — collapse any open mobile detail and
      // dismiss the VR tooltip so it doesn't reopen on return.
      L.shell.classList.remove("has-detail");
      hideVrTooltip();
    }
  };

  // Initial render — list is built once at boot, detail stays
  // empty until the user (or setAppMode) picks a course.
  renderCourseList();
})();
