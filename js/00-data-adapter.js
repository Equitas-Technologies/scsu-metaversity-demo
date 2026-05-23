/* === SCSU app — Data Adapter (CMS-shape JSON → legacy maps) ===
   ============================================================
   Bridges the per-location-document JSON shape (locations.json,
   treedis-sweeps.json, courses.json) to the flat lookup maps
   the rest of the app already reads:

     window.CAMPUS_CONFIG.categoryMap, .descriptionMap,
       .imageMap, .happensHereMap, .departmentMap,
       .addressMap, .explorableMap
     window.CAMPUS_CONFIG.treedisMaps.{desktop, vr}
     window.CAMPUS_CONFIG.treedisMap         (alias)
     window.SCSU_DATA.courses

   Nothing in 01-utils.js, 06-details-panel.js, 13-learn-mode.js,
   or anywhere else needs to know JSON is involved — they keep
   reading the same `config.descriptionMap[k]` calls they always
   have. The adapter is the *only* place where the shape decision
   lives, which is exactly the seam a future CMS will slot into:
   when a CMS lands, replace loadDataJSON() with loadDataFromCMS()
   and nothing else changes.

   Loading strategy mirrors the GeoJSON files (see 11-boot.js):
     1. Try fetch() — works over http/https.
     2. If fetch fails (file:// origin, 404, CORS), fall back to
        the legacy data/*.js shim scripts which have already
        populated window.CAMPUS_CONFIG / window.SCSU_DATA at
        <script> parse time. This means the page still works
        when opened directly from disk.

   The adapter functions are idempotent — running applyLocations
   on an already-populated config is harmless, so the fetch path
   and the shim path can coexist without conflicting.
   ============================================================ */

/* Try fetching a JSON file. Returns null on any failure so the
   caller can fall back to the shim path. Mirrors the
   tryFetchGeoJSON() helper above for consistency. */
async function tryFetchJSON(url) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    // Defensive: avoid mistakenly parsing an HTML error page.
    if (ct.includes("text/html")) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

/* Take a locations.json payload (per-document shape) and
   rebuild the seven flat maps on window.CAMPUS_CONFIG that
   01-utils.js reads from. Each per-location-document field
   becomes one entry in its corresponding flat map.

   Locations that don't carry a given field are simply
   skipped for that map — same as the hand-edited locations.js
   where you only listed buildings that had, say, a custom
   description. */
function applyLocationsJSON(payload) {
  if (!payload || !Array.isArray(payload.locations)) return false;

  const cfg = (window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {});
  cfg.categoryMap    = cfg.categoryMap    || {};
  cfg.descriptionMap = cfg.descriptionMap || {};
  cfg.imageMap       = cfg.imageMap       || {};
  cfg.happensHereMap = cfg.happensHereMap || {};
  cfg.departmentMap  = cfg.departmentMap  || {};
  cfg.addressMap     = cfg.addressMap     || {};
  cfg.explorableMap  = cfg.explorableMap  || {};

  for (const loc of payload.locations) {
    if (!loc || !loc.key) continue;
    const k = String(loc.key).toLowerCase();

    if (typeof loc.category === "string")    cfg.categoryMap[k]    = loc.category;
    if (typeof loc.description === "string") cfg.descriptionMap[k] = loc.description;
    if (typeof loc.image === "string")       cfg.imageMap[k]       = loc.image;
    if (typeof loc.address === "string")     cfg.addressMap[k]     = loc.address;

    if (Array.isArray(loc.happensHere)) cfg.happensHereMap[k] = loc.happensHere;
    if (Array.isArray(loc.departments)) cfg.departmentMap[k]  = loc.departments;
    if (Array.isArray(loc.explorable))  cfg.explorableMap[k]  = loc.explorable;
  }
  return true;
}

/* Same idea for the Treedis sweeps. The per-document shape
   carries parentName at the document level (it's the same in
   both profiles) and per-profile sub-objects for desktop/vr.
   The legacy maps store the parentName *inside* each profile
   entry, so we re-inject it as we flatten.

   `treedisMap` (singular) is kept as an alias to the desktop
   profile for any code path that hasn't been migrated;
   01-utils.js / applyTreedisProfile() will repoint it to the
   VR profile at boot when XR is detected (existing behavior,
   unchanged). */
function applyTreedisSweepsJSON(payload) {
  if (!payload || !Array.isArray(payload.sweeps)) return false;

  const cfg = (window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {});
  const desktop = {};
  const vr      = {};

  for (const s of payload.sweeps) {
    if (!s || !s.key) continue;
    const k = String(s.key).toLowerCase();

    if (s.desktop) desktop[k] = mergeParentName(s.desktop, s.parentName);
    if (s.vr)      vr[k]      = mergeParentName(s.vr,      s.parentName);
  }

  cfg.treedisMaps = { desktop, vr };

  // Default alias to desktop. 01-utils.js's applyTreedisProfile()
  // repoints this to `vr` when an XR session is supported. We do
  // not call applyTreedisProfile() here — that ran at <script>
  // parse time before the JSON arrived; the boot sequence calls
  // it again once the JSON is in place. See 11-boot.js.
  cfg.treedisMap = desktop;
  return true;
}

/* Re-attach parentName to a per-profile entry and drop any
   keys that are null/undefined. The legacy hand-edited
   treedis-sweeps.js only set keys when they had values, so
   reading raw.rotation gave undefined rather than explicit
   null. The lookup in 01-utils.js coerces either to null via
   `|| null`, so behaviorally both shapes are identical — but
   stripping the nulls here keeps the in-memory entries
   byte-equivalent to the legacy ones, which makes equivalence
   tests trivial and Git diffs of any future debugging dump
   readable. */
function mergeParentName(profileEntry, parentName) {
  const out = {};
  for (const k of Object.keys(profileEntry || {})) {
    const v = profileEntry[k];
    // Preserve sweepId even when null (it's the entry's primary
    // identifier; a null sweepId is a meaningful "placeholder"
    // state the rest of the code checks for explicitly).
    if (k === "sweepId") { out[k] = v; continue; }
    if (v != null) out[k] = v;
  }
  if (parentName) out.parentName = parentName;
  return out;
}

/* Courses live under window.SCSU_DATA.courses (not
   CAMPUS_CONFIG) for historical reasons — 13-learn-mode.js
   reads them from there. The JSON shape is identical to the
   legacy array, so this is a one-line assignment. */
function applyCoursesJSON(payload) {
  if (!payload || !Array.isArray(payload.courses)) return false;
  window.SCSU_DATA = window.SCSU_DATA || {};
  window.SCSU_DATA.courses = payload.courses;
  return true;
}

/* Orchestrator. Fetches the three JSON files in parallel; for
   each one, falls back silently to whatever the legacy .js
   shim already populated. Returns a small report so the boot
   log can show which path was used (useful for debugging
   file:// vs http loads).

   URLs come from config.dataFiles (set in config.js), so a
   future CMS can repoint these to API endpoints without
   touching the adapter — as long as the API returns the same
   per-document JSON shape. */
async function loadDataJSON() {
  const cfg = window.CAMPUS_CONFIG || {};
  const files = cfg.dataFiles || {};

  const [locP, sweepsP, coursesP] = await Promise.all([
    tryFetchJSON(files.locations     || "data/locations.json"),
    tryFetchJSON(files.treedisSweeps || "data/treedis-sweeps.json"),
    tryFetchJSON(files.courses       || "data/courses.json")
  ]);

  const report = {
    locations: locP     ? "json" : "shim",
    sweeps:    sweepsP  ? "json" : "shim",
    courses:   coursesP ? "json" : "shim"
  };

  if (locP)     applyLocationsJSON(locP);
  if (sweepsP)  applyTreedisSweepsJSON(sweepsP);
  if (coursesP) applyCoursesJSON(coursesP);

  // If a Treedis profile was already picked at module-load time
  // (resolveTreedisProfile() in 01-utils.js runs synchronously
  // against whatever sweeps the shim had loaded), re-apply it
  // now so cfg.treedisMap / cfg.treedis.modelId / .tourUrl all
  // reflect the freshly-fetched JSON data. This is a no-op if
  // applyTreedisProfile() isn't defined yet (paranoia for load
  // order), and otherwise harmless to call.
  try {
    if (typeof applyTreedisProfile === "function" &&
        typeof activeTreedisProfile === "string") {
      applyTreedisProfile(activeTreedisProfile);
    }
  } catch (_) { /* non-critical */ }

  return report;
}
