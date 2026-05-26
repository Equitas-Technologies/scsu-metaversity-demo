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
    // Primary basemap: Stadia's Outdoors VECTOR style, rendered by
    // MapLibre GL (see addBaseTileLayer). Vector lets us keep streets,
    // landmarks, and the Outdoors look while switching OFF only the
    // redundant building/POI text labels (see hideLabelSourceLayers).
    vectorStyleUrl: "https://tiles.stadiamaps.com/styles/outdoors.json?api_key=0b158bc8-1c5f-4d1d-b305-b51e386cce12",

    // Symbol (label) layers from these OpenMapTiles source-layers are
    // hidden after the style loads. "poi" covers the building/place-of-
    // interest names that duplicated our own permanent labels; street
    // names (transportation_name), place names, parks and water stay.
    hideLabelSourceLayers: ["poi"],

    // Raster fallback — used only if MapLibre GL fails to load. Plain
    // Outdoors raster so the map is still usable (with its own labels).
    url: "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png?api_key=0b158bc8-1c5f-4d1d-b305-b51e386cce12",

    // Satellite view: Stadia's Alidade Satellite raster imagery,
    // toggled on/off by the on-map satellite button (see setSatelliteView
    // in 11-boot). Global coverage, so it fills the viewport
    // (satelliteBounds is left off). Uses the shared Stadia api_key and
    // counts against that plan's quota.
    satelliteUrl: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg?api_key=0b158bc8-1c5f-4d1d-b305-b51e386cce12",
    satelliteAttribution: "© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) © Stadia Maps © OpenMapTiles © OpenStreetMap contributors",

    // Alternative satellite source — the local, pre-rendered 2023 RGB
    // aerial of campus (SC_2023_RGB WMTS) in assets/tiles. To use it
    // instead of Stadia, swap the two lines above for these and set
    // satelliteBounds: true (it only covers the campus bounds, zoom
    // 15–20; outside that the vector base shows through). Local = no quota.
    //   satelliteUrl: "assets/tiles/{z}/{x}/{y}.png",
    //   satelliteAttribution: "Aerial imagery: SC_2023_RGB WMTS",
    //   satelliteBounds: true,

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

    attribution: "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors"
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
    tours:     "data/tours.geojson",
    // Per-location content (CMS-shape JSON). When a CMS lands,
    // these can be repointed at an API endpoint that returns the
    // same JSON shape — the adapter in js/00-data-adapter.js is
    // the only thing that knows what the shape looks like.
    locations:     "data/locations.json",
    treedisSweeps: "data/treedis-sweeps.json",
    courses:       "data/courses.json"
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
      color: "#AEBAC8", weight: 1, fillColor: "#CBD5E1", fillOpacity: 0.35
    },
    buildingsHover: {
      color: "#828FA3", weight: 1.5, fillColor: "#94A3B8", fillOpacity: 0.55
    },
    /* Guided tour stops: blue fill with a subtly darker blue stroke
       (a step or two darker than the fill, not black) so the border
       reads as a soft outline rather than a hard frame. */
    tours: {
      color: "#60A5FA", weight: 1.5, fillColor: "#BFDBFE", fillOpacity: 0.35
    },
    toursHover: {
      color: "#3B82F6", weight: 2, fillColor: "#93C5FD", fillOpacity: 0.60
    },
    /* Off-campus tour stops get a distinct orange/amber treatment so
       the user can tell at a glance that the shape on the map is a
       directional indicator (not a real building). The Olar Farm
       arrow on the highway uses this. */
    toursOffCampus: {
      color: "#9A3412", weight: 2, fillColor: "#FB923C", fillOpacity: 0.75,
      dashArray: "4 3"
    },
    toursOffCampusHover: {
      color: "#7C2D12", weight: 2.5, fillColor: "#F97316", fillOpacity: 0.90,
      dashArray: "4 3"
    },
    /* Selected element: green fill with a subtly darker green stroke
       (was black) so the selection outline stays soft. */
    selected: {
      color: "#4ADE80", weight: 2.5, fillColor: "#86EFAC", fillOpacity: 0.55
    },
    selectedOffCampus: {
      color: "#7C2D12", weight: 3, fillColor: "#EA580C", fillOpacity: 0.85,
      dashArray: "4 3"
    }
  },

  ui: {
    enableHoverPreview: true,
    showBuildingTooltips: true,
    // When true, each feature's NAME is shown as an always-on label
    // on the map (a permanent Leaflet tooltip) instead of only on
    // hover. Set false to revert to hover-only labels.
    permanentLabels: true,
    // Zoom gate for permanent labels: they're hidden when the map is
    // zoomed out below this level (avoids clutter on the overview)
    // and shown at this zoom or closer. Ignored unless
    // permanentLabels is true. Map zoom range is 15–20.
    permanentLabelMinZoom: 18
  }
});
