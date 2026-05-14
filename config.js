/* ============================================================
   SCSU METAVERSITY — Configuration
   ------------------------------------------------------------
   This file holds the *structural* settings that wire the app
   together: brand strings, map tiles, the coordinate system,
   data file paths, Treedis SDK plumbing, Leaflet styles, and
   UI flags. It rarely changes.

   Per-location *content* lives in sibling files so non-technical
   editors can update copy without touching app plumbing:

     • data/locations.js       — descriptionMap, imageMap,
                                 categoryMap, happensHereMap,
                                 explorableMap
     • data/treedis-sweeps.js  — treedisMaps (per-location
                                 sweep IDs, split into desktop
                                 vs. vr profiles)
     • data/courses.js         — Learn-mode course catalog

   Those files all assign onto `window.CAMPUS_CONFIG`, so app.js
   keeps reading them as `config.descriptionMap`, `config.treedisMap`,
   etc. without any code changes.

   IMPORTANT loading order: this file is loaded AFTER the data/*.js
   files in index.html. We use `Object.assign(window.CAMPUS_CONFIG
   || {}, …)` below so we merge into whatever the data files
   already set, rather than overwriting it.

   ─── Treedis dual-profile (desktop / VR) ────────────────────
   The SCSU campus exists in two separate Treedis models — one
   for desktop/tablet/mobile, one for XR/VR headset browsers.
   Sweep IDs are scoped per model, so we keep both `modelId` and
   `tourUrl` under `treedis.profiles.{desktop, vr}` and let app.js
   pick a profile at boot. The legacy top-level fields
   `treedis.modelId` / `treedis.tourUrl` are kept as
   desktop-profile aliases for backward compatibility; app.js
   overwrites them with the VR equivalents when XR is detected.
   ============================================================ */
window.CAMPUS_CONFIG = Object.assign(window.CAMPUS_CONFIG || {}, {
  /* -- Branding ------------------------------------------- */
  brand: {
    name: "SCSU",
    product: "Metaversity",
    tagline: "Virtual Campus Tour"
  },

  /* -- Satellite image ------------------------------------- */
  /* -- Base map tiles -------------------------------------- */
  mapMode: "tiles",

  tiles: {
    url: "assets/tiles/{z}/{x}/{y}.png",

    // Match the QGIS OUTPUT_HTML.html values.
    minZoom: 15,
    maxZoom: 20,
    maxNativeZoom: 20,
    tms: false,

    // QGIS preview center from OUTPUT_HTML.html.
    initialCenter: [33.4977, -80.8493],
    initialZoom: 17,

    zoomOutExtra: 0.10,

    // Extra space around building/tour bounds when fitting the map.
    boundsPadding: 0.35,
    bounds: [
      [33.4909200101593001, -80.8627640321827954],
      [33.5051108680217027, -80.8355473474424997]
    ],

    attribution: "© SC State University | Imagery: SC_2023_RGB WMTS"
  },

  /* -- Coordinate system of the GeoJSON data --------------- */
  dataCRS: "EPSG:4326",

  /* -- Data files -----------------------------------------
     Paths to the GeoJSON files, relative to index.html.
     These are used when the page is served over http/https.
     When opened directly from disk (file://), the app falls
     back to the data/*.js shim scripts loaded in index.html.
     ------------------------------------------------------- */
  dataFiles: {
    buildings: "data/buildings.geojson",
    tours:     "data/tours.geojson"
  },

  /* -- Tour configuration ---------------------------------- */
  tour: {
    defaultGroup: "mainTour",
    focusZoom: 19
  },

  /* -- Treedis street view configuration ------------------
     Shared SDK plumbing lives at the top level; the model-
     specific fields (modelId, tourUrl) live under `profiles`
     because we ship two Treedis models — one for desktop,
     one for VR.

     The per-location sweep lookup (treedisMaps) lives in
     data/treedis-sweeps.js.
     ------------------------------------------------------- */
  treedis: {
    /* Per-profile model + tour URL. app.js picks one of these at
       boot via detectXRProfile() and copies its values up to
       treedis.modelId / treedis.tourUrl. */
    profiles: {
      desktop: {
        modelId: "8e4ca3fc",
        tourUrl: "https://spaces.dtsxr.com/tour/8e4ca3fc",
        /* Campus "home" sweep — null = open the iframe at the
           model's default sweep. Set this to a real sweep id
           later if a campus landing is desired. */
        homeSweepId: null
      },
      vr: {
        modelId: "scsu-campus-ade0f346",
        tourUrl: "https://spaces.dtsxr.com/tour/scsu-campus-ade0f346",
        homeSweepId: null
      }
    },

    /* Active-profile aliases. These default to the desktop
       profile and get overwritten by app.js (resolveTreedisProfile)
       at boot if XR is detected. Older code paths that read
       config.treedis.modelId / .tourUrl keep working. */
    modelId: "8e4ca3fc",
    tourUrl: "https://spaces.dtsxr.com/tour/8e4ca3fc",
    homeSweepId: null,

    /* Origin used by the Treedis SDK for postMessage safety.
       Both models live on the same origin, so this stays shared. */
    origin: "https://spaces.dtsxr.com",

    /* External student portal referenced by the legacy menu. */
    studentPortal: "https://metaversitysportal.carrd.co/",

    /* Transition time (ms) used when Treedis moves sweep.     */
    defaultTransitionTime: 0
  },

  /* -- Layer styles ---------------------------------------- */
  styles: {
    buildings: {
      color: "#111111", weight: 1, fillColor: "#CBD5E1", fillOpacity: 0.35
    },
    buildingsHover: {
      color: "#111111", weight: 1.5, fillColor: "#94A3B8", fillOpacity: 0.55
    },
    tours: {
      color: "#111111", weight: 1.5, fillColor: "#A7F3D0", fillOpacity: 0.35
    },
    toursHover: {
      color: "#111111", weight: 2, fillColor: "#6EE7B7", fillOpacity: 0.60
    },
    selected: {
      color: "#111111", weight: 2.5, fillColor: "#86EFAC", fillOpacity: 0.55
    }
  },

  ui: {
    enableHoverPreview: true,
    showBuildingTooltips: true
  }
});
