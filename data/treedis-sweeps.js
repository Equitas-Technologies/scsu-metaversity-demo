/* ============================================================
   SCSU METAVERSITY — Treedis sweep map (FALLBACK SHIM)
   ------------------------------------------------------------
   ⚠️  EDITORS: this file is no longer the source of truth.
   The canonical data lives in data/treedis-sweeps.json. This
   shim is kept so the page still works when opened directly
   from disk (file:// origin), where fetch() can't read JSON.

   When served over http/https, js/00-data-adapter.js fetches
   data/treedis-sweeps.json and overwrites whatever this shim
   set, so any edits made here are silently ignored in production.

   To regenerate this file from the JSON, run:
       node scripts/extract.js     (JSON → fresh shim)

   --- legacy header continues below ---

   Loaded via <script>, like the other data/*.js files. Writes
   onto window.CAMPUS_CONFIG.treedisMaps so app.js can look up
   sweep IDs scoped to the device profile (desktop vs. VR).

   ─── Why two profiles? ────────────────────────────────────
   The SCSU campus exists in two separate Treedis models:

     • Desktop / tablet / mobile  →  model `8e4ca3fc`
     • XR / VR headset browsers   →  model `scsu-campus-ade0f346`

   Sweep IDs are scoped per model — a sweep id from the desktop
   model will not resolve in the VR model and vice versa, so we
   keep two completely separate lookup tables here. app.js picks
   one at boot time based on the result of detectXRProfile()
   (see app.js — uses navigator.xr.isSessionSupported plus a
   UA-token check for `OculusBrowser` / `Quest` / ` VR ` /
   `Pico`). The top-level SDK plumbing in config.js (modelId,
   tourUrl) is also profile-scoped now — see config.js.

   ─── Entry shape ──────────────────────────────────────────
   Each entry can be either:
     • a string  → treated as { sweepId: "...", parentName: null }
     • an object → { sweepId, parentName?, transitionTime?, rotation? }

   Case-insensitive keys match `name` from the GeoJSON data
   (same convention as descriptionMap / imageMap etc).
   Sub-locations (rooms, floors, etc.) use a `parentName`
   so the street view UI can show the right building title.

   `parentName` is matched (case-insensitively) against the
   tour-stop name in tours.geojson — when a sub-location's
   sweep becomes active, syncWrapperToSweep() looks up the
   tour stop whose `cleanName(name).toLowerCase()` equals
   `parentName.toLowerCase()`. It MUST therefore match the
   exact tour-stop name (e.g. "Crawford-Zimmerman Building",
   not "Crawford-Zimmerman"); otherwise the tour bar won't
   update when the user navigates inside Treedis.

   `rotation` is forwarded to Treedis's `Navigate` command as
   `{ x, y }` (x = pitch, y = yaw). The values below were
   sourced from the `&x=…&y=…` parameters in the SCSU_Links
   spreadsheet — they encode camera heading and tilt that the
   client-team captured at each location. They're per-profile
   because the same physical viewpoint resolves differently in
   the desktop vs VR models. When present, the camera lands at
   the sweep facing that direction instead of Treedis's default.

   Entries with `sweepId: null` are deliberate placeholders —
   the app treats them gracefully and logs a warning rather
   than breaking.

   ─── Backward compatibility ───────────────────────────────
   Older app code reads `config.treedisMap` (singular). For
   safety we also expose `treedisMap` as an alias of the
   desktop profile, so any code path we miss falls back to
   the desktop sweeps rather than erroring. app.js repoints
   the alias to the VR profile at boot when XR is detected.

   ─── v2 GeoJSON name changes ──────────────────────────────
   The v2 buildings + tours GeoJSON renamed two tour stops:
     • "Crawford Zimmerman"      → "Crawford-Zimmerman Building"
     • "S-H-M Memorial Square"   → "SHM Memorial Square"
   Both the keys below and the `parentName` strings for their
   sub-locations have been updated to match.
   ============================================================ */
window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};

/* ============================================================
   DESKTOP / TABLET / MOBILE — model `8e4ca3fc`
   Sourced from the "Desktop" sheet of SCSU_Links_5-19.xlsx.
   ============================================================ */
const TREEDIS_MAP_DESKTOP = {
  "nance hall": {
    sweepId: "tha74gz4z0hsxqh6e1ziudqpd",
    rotation: { x: 6.575815542193622, y: -95.18049943080082 }
  },

  "crawford-zimmerman building": {
    sweepId: "dpbd0zqf00zr1qg5wqumx6p2c",
    rotation: { x: -3.8674802731657634, y: -114.43023263065089 }
  },

  "kirkland w. green student center": {
    sweepId: "itqbbw5un90s6fubay1sg9wpb",
    rotation: { x: -5.045205601736886, y: -73.01935857694679 }
  },

  "oliver c. dawson stadium": {
    sweepId: "a69zbymdc8gnx3nzhy7nm3rna",
    rotation: { x: 0.0, y: -89.50120756964095 }
  },

  "shm memorial square": {
    // Sheet calls the building-level sweep "Historical Plaza".
    sweepId: "pfx40p9qnu4ibcpk6zkt2xdta",
    rotation: { x: -10.066993209030864, y: -60.01572577915264 }
  },

  "olar demo farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc",
    rotation: { x: -6.074742487063323, y: -94.63152563319096 }
  },

  "olar farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc",
    rotation: { x: -6.074742487063323, y: -94.63152563319096 }
  },

  "legacy plaza": {
    sweepId: "pfx40p9qnu4ibcpk6zkt2xdta",
    rotation: { x: -12.467846650109486, y: -73.5622939104859 }
  },

  "street view": {
    // No matching row in the sheet; left at the prior id so existing
    //     references keep resolving. Replace if the new model needs a
    //     different "street view" entry point.
    sweepId: "gs6itzr7wgg9zm7iicpmf27qd"
  },

  /* ---- Nance Hall sub-locations ----------- */
  "room 100": {
    sweepId: "smq4rk3baq414duy3icagdidd",
    parentName: "Nance Hall",
    rotation: { x: -9.297494867085225, y: -113.23768652513726 }
  },

  "room 110": {
    sweepId: "seh878f3barigi91p12186a8c",
    parentName: "Nance Hall",
    rotation: { x: -10.35426512117927, y: -92.29163820600608 }
  },

  "lecture room": {
    sweepId: "uqik25u7i841yyf37nw53wnba",
    parentName: "Nance Hall",
    rotation: { x: -11.467494110408978, y: -88.61718297306204 }
  },

  "room 110 - baby": {
    // TODO: not in current spreadsheet — confirm whether this
    //        sub-location still applies in the new model.
    sweepId: null,
    parentName: "Nance Hall"
  },

  "faculty suite": {
    // TODO: not in current spreadsheet — confirm whether this
    //        sub-location still applies in the new model.
    sweepId: null,
    parentName: "Nance Hall"
  },

  /* ---- Crawford-Zimmerman sub-locations --- */
  /* parentName must match the v2 tour stop name exactly so
     syncWrapperToSweep() can find the parent in tourStops. */
  "crawford zimmerman 1st floor": {
    sweepId: "n1xw6qb7rekq3kim4dnsss68c",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -19.292573028798614, y: -103.48085806032049 }
  },

  "campus bookstore": {
    // Same sweep as `crawford zimmerman 1st floor` — the sheet
    //     labels this sweep "Store". Keeping both keys so either
    //     alias resolves.
    sweepId: "n1xw6qb7rekq3kim4dnsss68c",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -19.292573028798614, y: -103.48085806032049 }
  },

  "office of student financial services": {
    sweepId: "w71ztkwx17guq5zwx8yk60ctb",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -13.846676418385572, y: -88.2009725696489 }
  },

  "facilities management & operations": {
    sweepId: "w71ztkwx17guq5zwx8yk60ctb",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -13.846676418385572, y: -88.2009725696489 }
  },

  "admissions & financial aid": {
    sweepId: "br7rxxkae3inaq9cuuw2cs12a",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -12.838917584364898, y: -131.22476860488183 }
  },

  /* ---- Student Center floors -------------- */
  "student center 1st floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  "student center 2nd floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  /* ---- Memorial sub-locations ------------- */
  "historical marker": {
    // Same sweep as the building-level entry — the sheet's
    //     'Historical Plaza' sweep doubles as the historical-marker
    //     sub-location.
    sweepId: "nhyxqi32uey2ix9sp3zhxwm4c",
    parentName: "SHM Memorial Square",
    rotation: { x: -5.7041985820700125, y: -74.48094044330865 }
  },

  "bronze busts/monuments": {
    sweepId: "mghxr3x2p305y5unaqk6e30ua",
    parentName: "SHM Memorial Square",
    rotation: { x: -4.287741634450163, y: -56.26992221819853 }
  },

  /* ---- Stadium sub-locations -------------- */
  "midfield": {
    sweepId: "2k4mat4f2ba0gca1iap2xs9md",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: -8.93945593460425, y: -93.52687114515514 }
  },

  "gate 1": {
    sweepId: "b9z6epq22rc4a3918w6bgkw8d",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: -4.875785109580019, y: -88.75009825677934 }
  },

  "bulldog wall": {
    sweepId: "uhpx2eq3adep8nfzmwwb5utqd",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: 0.1450587289677038, y: -83.61075957121203 }
  }
};

/* ============================================================
   XR / VR — model `scsu-campus-ade0f346`
   Sourced from the "VR" sheet of SCSU_Links_5-19.xlsx.

   The VR sheet supplies its own sweep IDs and rotation values
   per location — both differ from desktop, since the same
   physical viewpoint maps to a different sweep in the VR model
   and the headset uses a different default headed/tilt.
   Sub-locations not present in the VR sheet are left null with
   the same parentName so the UI still resolves the building title.
   ============================================================ */
const TREEDIS_MAP_VR = {
  "nance hall": {
    sweepId: "tha74gz4z0hsxqh6e1ziudqpd",
    rotation: { x: 5.556788914278276, y: -76.99676497350086 }
  },

  "crawford-zimmerman building": {
    sweepId: "dpbd0zqf00zr1qg5wqumx6p2c",
    rotation: { x: -0.025693314832779427, y: -106.19951589595766 }
  },

  "kirkland w. green student center": {
    sweepId: "itqbbw5un90s6fubay1sg9wpb",
    rotation: { x: -8.908086462791735, y: -56.44339936674188 }
  },

  "oliver c. dawson stadium": {
    sweepId: "a69zbymdc8gnx3nzhy7nm3rna",
    rotation: { x: 22.621086451514035, y: -89.67573758863338 }
  },

  "shm memorial square": {
    // Sheet calls the building-level sweep "Historical Plaza".
    sweepId: "pfx40p9qnu4ibcpk6zkt2xdta",
    rotation: { x: -6.13003803406695, y: -61.000306844200416 }
  },

  "olar demo farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc",
    rotation: { x: -6.215822504455127, y: -93.42109560097343 }
  },

  "olar farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc",
    rotation: { x: -6.215822504455127, y: -93.42109560097343 }
  },

  "legacy plaza": {
    sweepId: "pfx40p9qnu4ibcpk6zkt2xdta",
    rotation: { x: -10.082997365430176, y: -63.402001658418165 }
  },

  "street view": {
    // No matching row in the VR sheet — left null so the
    //     app falls back to the model's default landing sweep.
    sweepId: null
  },

  /* ---- Nance Hall sub-locations ----------- */
  "room 100": {
    sweepId: "smq4rk3baq414duy3icagdidd",
    parentName: "Nance Hall",
    rotation: { x: -9.774468609592939, y: -116.1334759674568 }
  },

  "room 110": {
    sweepId: "seh878f3barigi91p12186a8c",
    parentName: "Nance Hall",
    rotation: { x: -7.063387086849155, y: -90.87034773872239 }
  },

  "lecture room": {
    sweepId: "uqik25u7i841yyf37nw53wnba",
    parentName: "Nance Hall",
    rotation: { x: -11.383827319357279, y: -90.27528396260246 }
  },

  "room 110 - baby": {
    sweepId: null,
    parentName: "Nance Hall"
  },

  "faculty suite": {
    sweepId: null,
    parentName: "Nance Hall"
  },

  /* ---- Crawford-Zimmerman sub-locations --- */
  "crawford zimmerman 1st floor": {
    sweepId: "n1xw6qb7rekq3kim4dnsss68c",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -10.778452827629257, y: -116.97112289300262 }
  },

  "campus bookstore": {
    sweepId: "n1xw6qb7rekq3kim4dnsss68c",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -10.778452827629257, y: -116.97112289300262 }
  },

  "office of student financial services": {
    sweepId: "w71ztkwx17guq5zwx8yk60ctb",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -9.543466825753555, y: -71.00390733365607 }
  },

  "facilities management & operations": {
    sweepId: null,
    parentName: "Crawford-Zimmerman Building"
  },

  "admissions & financial aid": {
    sweepId: "br7rxxkae3inaq9cuuw2cs12a",
    parentName: "Crawford-Zimmerman Building",
    rotation: { x: -9.178350717274991, y: -128.72651147955688 }
  },

  /* ---- Student Center floors -------------- */
  "student center 1st floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  "student center 2nd floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  /* ---- Memorial sub-locations ------------- */
  "historical marker": {
    // Same sweep as the building-level entry.
    sweepId: "nhyxqi32uey2ix9sp3zhxwm4c",
    parentName: "SHM Memorial Square",
    rotation: { x: -5.478315845629449, y: -78.43629994638431 }
  },

  "bronze busts/monuments": {
    sweepId: "mghxr3x2p305y5unaqk6e30ua",
    parentName: "SHM Memorial Square",
    rotation: { x: -2.7516061341687155, y: -57.567059361179396 }
  },

  /* ---- Stadium sub-locations -------------- */
  "midfield": {
    sweepId: "2k4mat4f2ba0gca1iap2xs9md",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: -16.29417295692844, y: -96.35244452221659 }
  },

  "gate 1": {
    sweepId: "b9z6epq22rc4a3918w6bgkw8d",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: -2.179720094489177, y: -95.82436955362265 }
  },

  "bulldog wall": {
    sweepId: "uhpx2eq3adep8nfzmwwb5utqd",
    parentName: "Oliver C. Dawson Stadium",
    rotation: { x: -9.368142352368098, y: -83.533449366017 }
  }
};

/* Expose both profiles. `treedisMaps` is the new dual-profile
   API. `treedisMap` (singular) is preserved as an alias to the
   desktop profile for any code path that hasn't been migrated —
   app.js repoints it to the VR profile at boot when XR is
   detected. */
window.CAMPUS_CONFIG.treedisMaps = {
  desktop: TREEDIS_MAP_DESKTOP,
  vr:      TREEDIS_MAP_VR
};
window.CAMPUS_CONFIG.treedisMap = TREEDIS_MAP_DESKTOP;
