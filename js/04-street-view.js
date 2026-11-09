/* === SCSU app — Part 4: Street view controller (sec 6.6) === */
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
  refreshStreetViewCaption();
}

/* The caption only shows what the tour bar doesn't already say:
     - room after a jump ("Room 110")  → is-room: room name only
     - tour stop shown in the tour bar → is-redundant: hidden
     - anything else (All list, search,
       non-tour buildings)             → full caption
   Its text is always kept current (the session snapshot reads it), so
   only its visibility changes. Also called from updateTourbar(), which
   runs after the selection settles. */
function refreshStreetViewCaption() {
  const caption = el.streetviewCaption;
  if (!caption) return;
  const title = el.streetviewTitle ? el.streetviewTitle.textContent : "";
  const sub   = el.streetviewSub   ? el.streetviewSub.textContent   : "";

  const isRoom = !!sub && sub !== title && sub !== getCategory(title);
  const stop = tourIndex >= 0 && tourStops[tourIndex];
  const stopName = stop ? cleanName(stop.feature.properties.name) : "";
  const isTourStop = !!stopName && stopName.toLowerCase() === title.toLowerCase();

  caption.classList.toggle("is-room", isRoom);
  caption.classList.toggle("is-redundant", !isRoom && isTourStop);
}

/* When the user navigates inside Treedis (clicking a hotspot,
   walking to a new sweep, etc.), Treedis fires PoseChanged with
   the new sweep id. This function maps that sweep id back to
   the location it represents and updates the caption, selection,
   details and tour bar so the wrapper UI stays in sync.

   Sub-locations (rooms, floors) point at their parent via
   `parentName` in config.treedisMap — when the user enters one
   we select the parent (sub-locations aren't map features in
   their own right) and show "Parent — Room" in the caption.
   Unmapped sweeps (paths between locations) leave everything
   as is. */
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

  // While a queued Navigate is landing, Treedis can report its default
  // sweep first; don't let that pull the wrapper elsewhere.
  if (pendingSweep && pendingSweep.sweepId !== sweepId) return;

  // Resolve to the parent location name if this is a sub-location.
  // Otherwise, the matched key IS the location name (lowercased
  // — treedisMap keys are case-insensitive matches against
  // GeoJSON `name`).
  const parentKey = matchedEntry.parentName || matchedKey;
  const hit = findFeatureByName(parentKey);
  const parentDisplay = hit ? cleanName(hit.props.name) : parentKey;

  // treedisMap keys are lower-cased; recover the display spelling of
  // a room from the parent's explorable list.
  if (matchedEntry.parentName) {
    const sub = getExplorable(parentDisplay)
      .find((n) => n.toLowerCase() === matchedKey) || matchedKey;
    setStreetViewCaption(parentDisplay, sub);
  } else {
    setStreetViewCaption(parentDisplay, getCategory(parentDisplay));
  }

  if (hit && hit.layer !== selectedLayer) {
    selectFeature(hit.layer, hit.kind, { syncStreetView: false });
  }
  saveSessionState();
}

/* Open the street view overlay at the given sweep. `title` and
   `sub` are display-only (they populate the small header pill
   in the top-left of the overlay).

   `options` is forwarded to TourBridge.navigateToSweep:
     • rotation       — { x, y } in degrees; camera lands facing this way
     • transitionTime — ms; per-entry override of the global default
   Both are optional — omit to let Treedis / config defaults apply.

   Two paths:
     (a) Treedis is ready → fire Navigate immediately as before.
     (b) Treedis is NOT ready → show the loading veil and queue
         the sweep in pendingSweep. _flushPendingSweep() runs
         when TourReady fires and finishes the job. */
function openStreetView(sweepId, title, sub, options) {
  if (!sweepId) {
    console.warn("[streetview] open request ignored — no sweep id for", title);
    // Tiny visual nudge — still open the overlay so the user sees
    // the tour, just without a targeted navigate. This way
    // placeholder rows at least don't feel broken.
  }

  // Normalize options so the rest of the function (and the queued
  // path) never has to deal with undefined.
  const navOpts = {
    rotation:       (options && options.rotation)       || null,
    transitionTime: (options && options.transitionTime) || null
  };

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
      // `_buildNavOptions` strips nulls so TourBridge applies its
      // own defaults for anything we don't specify.
      TourBridge.navigateToSweep(sweepId, _buildNavOptions(navOpts));
      lastStreetViewSweepId = sweepId;
      _hideStreetViewLoading();
      pendingSweep = null;
    } else {
      // Treedis hasn't reported TourReady yet (cold load, or the
      // user clicked Explore unusually fast). Show our loading
      // veil and queue the target — _flushPendingSweep() will
      // send the Navigate (with these same options) the moment
      // TourReady arrives.
      console.info("[streetview] queueing sweep until TourReady:", sweepId);
      pendingSweep = {
        sweepId, title, sub,
        rotation:       navOpts.rotation,
        transitionTime: navOpts.transitionTime
      };
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

  saveSessionState();
}

/* Build the options object for TourBridge.navigateToSweep, omitting
   any nulls so the bridge's own defaults apply (e.g. the configured
   defaultTransitionTime) instead of being overridden by null. */
function _buildNavOptions(navOpts) {
  const out = {};
  if (navOpts && navOpts.rotation)       out.rotation       = navOpts.rotation;
  if (navOpts && navOpts.transitionTime) out.transitionTime = navOpts.transitionTime;
  return out;
}

/* The selection may have changed while in 3D (list, tour bar,
   walking in Treedis), so closing brings the map to the selected
   location and, on mobile, the tucked-away details sheet comes
   back at half height. Callers that select and focus a new
   location themselves pass { refocus: false }. */
function closeStreetView(opts) {
  const wasActive = streetViewActive;
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

  const refocus = !(opts && opts.refocus === false);
  if (wasActive && refocus && selectedLayer) {
    if (isMobile() && el.shell.classList.contains("has-details")) {
      setDetailsMode("half");
    }
    focusMapOnLayer(selectedLayer);
  }

  saveSessionState();
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
  }, 15000));

  _streetviewLoadingTimers.push(setTimeout(() => {
    if (el.streetviewLoadingCancel) {
      el.streetviewLoadingCancel.hidden = false;
    }
  }, 30000));
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
    // Pull through whatever rotation / transitionTime was stashed
    // when the sweep got queued. _buildNavOptions strips nulls so
    // TourBridge defaults apply when those weren't specified.
    TourBridge.navigateToSweep(targetSweepId, _buildNavOptions({
      rotation:       pendingSweep && pendingSweep.rotation,
      transitionTime: pendingSweep && pendingSweep.transitionTime
    }));
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
    pendingSweep = {
      sweepId: entry.sweepId,
      title: name,
      sub: getCategory(name),
      rotation:       entry.rotation       || null,
      transitionTime: entry.transitionTime || null
    };
    _showStreetViewLoading();
    return;
  }

  if (entry.sweepId !== lastStreetViewSweepId) {
    // Forward the per-entry rotation / transitionTime so the camera
    // lands at the configured heading. _buildNavOptions strips nulls.
    TourBridge.navigateToSweep(entry.sweepId, _buildNavOptions({
      rotation:       entry.rotation,
      transitionTime: entry.transitionTime
    }));
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
  // being filled in. Forward the entry's rotation / transitionTime
  // so the camera lands facing the configured direction when
  // present.
  openStreetView(
    sweepId,
    displayParent || subLocationName,
    subLocationName,
    {
      rotation:       (entry && entry.rotation)       || null,
      transitionTime: (entry && entry.transitionTime) || null
    }
  );
  setStreetViewCaption(displayParent || subLocationName, subLocationName);
}
