/* === SCSU app — Part 2: Map setup, DOM refs, state === */
/* Includes: Leaflet map + panes (sec 3), DOM refs (sec 4),
   styling helpers (sec 5), and all module-level state (sec 6). */
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

  // All-tab sort control (Alphabetical / Department)
  locSortAlpha:       $("locSortAlpha"),
  locSortDept:        $("locSortDept"),

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
  addressBlock:     $("addressBlock"),
  detailsAddress:   $("detailsAddress"),
  detailsAddressLinks: $("detailsAddressLinks"),
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
     the street view for the currently-selected location.
     `exploreCta`       — mobile inline button (inside scroll flow)
     `exploreCtaFooter` — desktop/iPad persistent footer button
     `vrInline`         — mobile inline VR-Enabled row
     `detailsFooter`    — desktop/iPad persistent footer wrapper
                          (collapses entirely when the building
                          has no Treedis sweep configured)
     `vrBtn`            — legacy hidden button JS still binds to */
  exploreCta:        $("exploreCta"),
  exploreCtaFooter:  $("exploreCtaFooter"),
  detailsFooter:     document.querySelector(".details-footer"),
  vrInline:          document.querySelector(".details-vr-inline"),
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
   -----------------------------------------------------------
   The optional `feature` argument lets us pick a different
   palette for off-campus tour stops (e.g. the Olar Farm arrow
   that sits at the campus edge as a directional indicator).
   Callers that don't have a feature handy (legacy code paths)
   can omit it — they get the original behavior.
   ----------------------------------------------------------- */
function isOffCampusFeature(feature) {
  return !!(feature && feature.properties && feature.properties.off_campus);
}

function styleFor(kind, feature) {
  const s = config.styles;
  if (kind === "building") return { ...s.buildings };
  if (kind === "tour") {
    if (isOffCampusFeature(feature) && s.toursOffCampus) {
      return { ...s.toursOffCampus };
    }
    return { ...s.tours };
  }
  return { ...s.buildings };
}

function hoverStyleFor(kind, feature) {
  const s = config.styles;
  if (kind === "building") return { ...s.buildingsHover };
  if (kind === "tour") {
    if (isOffCampusFeature(feature) && s.toursOffCampusHover) {
      return { ...s.toursOffCampusHover };
    }
    return { ...s.toursHover };
  }
  return { ...s.buildingsHover };
}

function selectedStyleFor(feature) {
  const s = config.styles;
  if (isOffCampusFeature(feature) && s.selectedOffCampus) {
    return { ...s.selectedOffCampus };
  }
  return { ...s.selected };
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
