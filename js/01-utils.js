/* === SCSU app — Part 1: Utils, reprojection, helpers === */
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

/* Look up the list of departments occupying a location.
   Returns an array (possibly empty) so callers can iterate
   without null-checks. Used by renderSearch() in
   09-sidebar-search.js to surface buildings whose department
   list contains the query term — e.g. typing "rotc" finds
   Soldiers' Hall, "engineering" finds Bethea Hall, etc. */
function getDepartments(name) {
  if (!name) return [];
  const k = name.toLowerCase();
  const list = (config.departmentMap || {})[k];
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

/* Look up the physical street address for a location, if any.
   Returns an empty string when no address is configured. Used
   by the details panel to render an "Open in Maps" link —
   primarily for off-campus locations (Olar Farm) but works for
   any location with a known address. */
function getAddress(name) {
  if (!name) return "";
  const k = name.toLowerCase();
  return (config.addressMap || {})[k] || "";
}

/* Look up a Treedis entry by location name (case-insensitive).
   Accepts short-hand string entries as well as full objects, and
   always returns a normalized
     { sweepId, parentName, transitionTime, rotation }
   object — or null if the name has no mapping.

   `rotation`, when present, is forwarded to TourBridge.navigateToSweep
   so the camera lands at the sweep facing a specific direction. */
function getTreedisEntry(name) {
  if (!name) return null;
  const map = config.treedisMap || {};
  const raw = map[String(name).toLowerCase().trim()];
  if (raw == null) return null;
  if (typeof raw === "string") {
    return {
      sweepId: raw, parentName: null, transitionTime: null, rotation: null
    };
  }
  return {
    sweepId:        raw.sweepId || null,
    parentName:     raw.parentName || null,
    transitionTime: raw.transitionTime || null,
    rotation:       raw.rotation || null
  };
}

/* True when the location has a usable Treedis sweep configured.
   Drives whether the details panel shows the Explore CTA and
   VR-Enabled controls — locations without a sweep have no
   immersive view to launch, so those controls would mislead.
   Buildings without a sweep get a quiet info-only details
   panel (tag, title, description, image) instead. */
function hasSweep(name) {
  const entry = getTreedisEntry(name);
  return !!(entry && entry.sweepId);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
