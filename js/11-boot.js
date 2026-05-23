/* === SCSU app — Part 11: BOOT (data loading, preload, boot) === */
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

/** Load every dataset the app needs: geometry (GeoJSON) and
 *  per-location content (locations.json, treedis-sweeps.json,
 *  courses.json). All four fetches run in parallel; each one
 *  silently falls back to the corresponding data/*.js shim
 *  populated at <script> parse time when its fetch fails (404,
 *  CORS, file:// origin, etc.). loadDataJSON() — defined in
 *  js/00-data-adapter.js — is responsible for the content
 *  fetches and for rebuilding the legacy flat maps
 *  (config.descriptionMap, config.treedisMaps, …) so the rest
 *  of the app doesn't need to know JSON is involved. */
async function loadAllData() {
  // Kick off all four fetches in parallel. Geometry stays here
  // because boot() needs the FeatureCollections to build Leaflet
  // layers; content lives on window.CAMPUS_CONFIG / SCSU_DATA
  // so the adapter handles it side-effectfully.
  const contentP = (typeof loadDataJSON === "function")
    ? loadDataJSON()
    : Promise.resolve(null);

  const [bFetch, tFetch, contentReport] = await Promise.all([
    tryFetchGeoJSON(config.dataFiles?.buildings || "data/buildings.geojson"),
    tryFetchGeoJSON(config.dataFiles?.tours     || "data/tours.geojson"),
    contentP
  ]);

  const fallback = window.SCSU_DATA || {};
  const empty = { type: "FeatureCollection", features: [] };

  const buildings = bFetch || fallback.buildings || empty;
  const tours     = tFetch || fallback.tours     || empty;

  const geomSource =
    (bFetch && tFetch) ? "fetch (.geojson files)"
    : (bFetch || tFetch) ? "mixed (fetch + shim)"
    : "shim (window.SCSU_DATA)";
  console.info(`[metaversity] geometry loaded via ${geomSource}`);
  if (contentReport) {
    console.info(`[metaversity] content loaded: ` +
      `locations=${contentReport.locations}, ` +
      `sweeps=${contentReport.sweeps}, ` +
      `courses=${contentReport.courses}`);
  }

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

