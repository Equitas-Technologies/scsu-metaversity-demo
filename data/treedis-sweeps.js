/* ============================================================
   SCSU METAVERSITY — Treedis sweep map
   ------------------------------------------------------------
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
     • an object → { sweepId, parentName?, transitionTime? }

   Case-insensitive keys match `name` from the GeoJSON data
   (same convention as descriptionMap / imageMap etc).
   Sub-locations (rooms, floors, etc.) use a `parentName`
   so the street view UI can show the right building title.

   Entries with `sweepId: null` are deliberate placeholders —
   the app treats them gracefully and logs a warning rather
   than breaking.

   ─── Backward compatibility ───────────────────────────────
   Older app code reads `config.treedisMap` (singular). For
   safety we also expose `treedisMap` as an alias of the
   desktop profile, so any code path we miss falls back to
   the desktop sweeps rather than erroring. app.js repoints
   the alias to the VR profile at boot when XR is detected.
   ============================================================ */
window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};

/* ============================================================
   DESKTOP / TABLET / MOBILE — model `8e4ca3fc`
   Sourced from the "Desktop" sheet of SCSU_Links.xlsx.
   ============================================================ */
const TREEDIS_MAP_DESKTOP = {
  /* ---- Top-level buildings ---------------------------- */
  "nance hall": {
    sweepId: "129qre2zyzhkp9e6sdregmmnb"
  },
  "crawford zimmerman": {
    sweepId: "zu9846n3g155mah3egxm5r70c"
  },
  "kirkland w. green student center": {
    sweepId: "5s2skyqyg7w7xdt99utc1636a"
  },
  "oliver c. dawson stadium": {
    sweepId: "0ysqgq6zyay1qms9d4n3pht3a"
  },
  "s-h-m memorial square": {
    // Sheet calls the building-level sweep "Historical Plaza".
    sweepId: "ngewc47tmsx3nt70wgyk6778a"
  },
  "olar demo farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc"
  },
  "olar farm": {
    sweepId: "hnz5p2wkdqr4isd41y1z2e1kc"
  },
  "legacy plaza": {
    sweepId: "siisknwp2903ign49n8mkafxa"
  },
  "street view": {
    // No matching row in the new sheet; left at the prior id so
    // existing references keep resolving. Replace if the new
    // model needs a different "street view" entry point.
    sweepId: "gs6itzr7wgg9zm7iicpmf27qd"
  },

  /* ---- Nance Hall sub-locations -----------------------
     Per the SCSU_Links sheet, the only Nance Hall sub-locations
     that exist are Room 100, Room 110, and Lecture Room. The
     previous "1st floor" / "2nd floor" / "general lecture room"
     keys were stale and have been removed.
     ----------------------------------------------------- */
  "room 100": {
    sweepId: "smq4rk3baq414duy3icagdidd",
    parentName: "Nance Hall"
  },
  "room 110": {
    sweepId: "2ki84r23di9yq9p613u5yg34d",
    parentName: "Nance Hall"
  },
  "lecture room": {
    sweepId: "1t7xp1xztp4aw4bs372705dwd",
    parentName: "Nance Hall"
  },
  "room 110 - baby": {
    // TODO: not in current spreadsheet — confirm whether this
    //       sub-location still applies in the new model.
    sweepId: null,
    parentName: "Nance Hall"
  },
  "faculty suite": {
    // TODO: not in current spreadsheet — confirm whether this
    //       sub-location still applies in the new model.
    sweepId: null,
    parentName: "Nance Hall"
  },

  /* ---- Crawford-Zimmerman sub-locations --------------- */
  "crawford zimmerman 1st floor": {
    sweepId: "sawh7uqgn3msc6b6y5aeabgpc",
    parentName: "Crawford-Zimmerman"
  },
  "campus bookstore": {
    // Same sweep as `crawford zimmerman 1st floor` — the sheet
    // labels this sweep "Store". Keeping both keys so either
    // alias resolves.
    sweepId: "sawh7uqgn3msc6b6y5aeabgpc",
    parentName: "Crawford-Zimmerman"
  },
  "office of student financial services": {
    sweepId: "m4hxr31wf6g7x6znru5wkp26a",
    parentName: "Crawford-Zimmerman"
  },
  "facilities management & operations": {
    // TODO: not in current spreadsheet — confirm whether this
    //       sub-location still applies in the new model.
    sweepId: "m4hxr31wf6g7x6znru5wkp26a",
    parentName: "Crawford-Zimmerman"
  },
  "admissions & financial aid": {
    sweepId: "br7rxxkae3inaq9cuuw2cs12a",
    parentName: "Crawford-Zimmerman"
  },

  /* ---- Student Center floors -------------------------- */
  "student center 1st floor": {
    // TODO: spreadsheet has no separate sweep id for floors.
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },
  "student center 2nd floor": {
    // TODO: spreadsheet has no separate sweep id for floors.
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  /* ---- Memorial sub-locations ------------------------- */
  "historical marker": {
    // Sheet's "Historical Plaza" sweep — the building-level
    // landing for the memorial square also serves as the
    // historical-marker sub-location.
    sweepId: "ngewc47tmsx3nt70wgyk6778a",
    parentName: "S-H-M Memorial Square"
  },
  "bronze busts/monuments": {
    sweepId: "zckbgra0e4w7hfi5i50s3gria",
    parentName: "S-H-M Memorial Square"
  },

  /* ---- Stadium sub-locations -------------------------- */
  "midfield": {
    sweepId: "2k4mat4f2ba0gca1iap2xs9md",
    parentName: "Oliver C. Dawson Stadium"
  },
  "gate 1": {
    sweepId: "b9z6epq22rc4a3918w6bgkw8d",
    parentName: "Oliver C. Dawson Stadium"
  },
  "bulldog wall": {
    sweepId: "ak3m9c0k9d6dfzkmw7h6h192a",
    parentName: "Oliver C. Dawson Stadium"
  }
};

/* ============================================================
   XR / VR — model `scsu-campus-ade0f346`
   Sourced from the "VR" sheet of SCSU_Links.xlsx.

   Diffs from the desktop profile (different sweep ids):
     • nance hall            → asfnat04t866bzrkzegbaki6c
     • oliver c. dawson stadium → a69zbymdc8gnx3nzhy7nm3rna
     • olar (demo) farm      → pgq02k1ubi2mb2gc7cpfpm24d
     • crawford zimmerman 1st floor / campus bookstore (Store)
                             → 5hd06kcibi7d76t8t777r3y7d

   All other sweep ids match the desktop profile. Sub-locations
   not present in the VR sheet are left null with the same
   parentName so the UI still resolves the building title.
   ============================================================ */
const TREEDIS_MAP_VR = {
  /* ---- Top-level buildings ---------------------------- */
  "nance hall": {
    sweepId: "asfnat04t866bzrkzegbaki6c"
  },
  "crawford zimmerman": {
    sweepId: "zu9846n3g155mah3egxm5r70c"
  },
  "kirkland w. green student center": {
    sweepId: "5s2skyqyg7w7xdt99utc1636a"
  },
  "oliver c. dawson stadium": {
    sweepId: "a69zbymdc8gnx3nzhy7nm3rna"
  },
  "s-h-m memorial square": {
    sweepId: "ngewc47tmsx3nt70wgyk6778a"
  },
  "olar demo farm": {
    sweepId: "pgq02k1ubi2mb2gc7cpfpm24d"
  },
  "olar farm": {
    sweepId: "pgq02k1ubi2mb2gc7cpfpm24d"
  },
  "legacy plaza": {
    sweepId: "siisknwp2903ign49n8mkafxa"
  },
  "street view": {
    // No matching row in the VR sheet — left null so the
    // app falls back to the model's default landing sweep.
    sweepId: null
  },

  /* ---- Nance Hall sub-locations ----------------------- */
  "room 100": {
    sweepId: "smq4rk3baq414duy3icagdidd",
    parentName: "Nance Hall"
  },
  "room 110": {
    sweepId: "2ki84r23di9yq9p613u5yg34d",
    parentName: "Nance Hall"
  },
  "lecture room": {
    sweepId: "1t7xp1xztp4aw4bs372705dwd",
    parentName: "Nance Hall"
  },
  "room 110 - baby": {
    sweepId: null,
    parentName: "Nance Hall"
  },
  "faculty suite": {
    sweepId: null,
    parentName: "Nance Hall"
  },

  /* ---- Crawford-Zimmerman sub-locations ---------------
     The VR sheet has a "Store" row with its own sweep id,
     distinct from the desktop "Store". The desktop file
     re-uses the "Store" sweep for the floor-level entry;
     we do the same in VR.
     ----------------------------------------------------- */
  "crawford zimmerman 1st floor": {
    sweepId: "5hd06kcibi7d76t8t777r3y7d",
    parentName: "Crawford-Zimmerman"
  },
  "campus bookstore": {
    sweepId: "5hd06kcibi7d76t8t777r3y7d",
    parentName: "Crawford-Zimmerman"
  },
  "office of student financial services": {
    sweepId: "m4hxr31wf6g7x6znru5wkp26a",
    parentName: "Crawford-Zimmerman"
  },
  "facilities management & operations": {
    sweepId: null,
    parentName: "Crawford-Zimmerman"
  },
  "admissions & financial aid": {
    sweepId: "br7rxxkae3inaq9cuuw2cs12a",
    parentName: "Crawford-Zimmerman"
  },

  /* ---- Student Center floors -------------------------- */
  "student center 1st floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },
  "student center 2nd floor": {
    sweepId: null,
    parentName: "Kirkland W. Green Student Center"
  },

  /* ---- Memorial sub-locations ------------------------- */
  "historical marker": {
    sweepId: "ngewc47tmsx3nt70wgyk6778a",
    parentName: "S-H-M Memorial Square"
  },
  "bronze busts/monuments": {
    sweepId: "zckbgra0e4w7hfi5i50s3gria",
    parentName: "S-H-M Memorial Square"
  },

  /* ---- Stadium sub-locations -------------------------- */
  "midfield": {
    sweepId: "2k4mat4f2ba0gca1iap2xs9md",
    parentName: "Oliver C. Dawson Stadium"
  },
  "gate 1": {
    sweepId: "b9z6epq22rc4a3918w6bgkw8d",
    parentName: "Oliver C. Dawson Stadium"
  },
  "bulldog wall": {
    sweepId: "ak3m9c0k9d6dfzkmw7h6h192a",
    parentName: "Oliver C. Dawson Stadium"
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
