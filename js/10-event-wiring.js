/* === SCSU app — Part 10: Event wiring + image alignment tool === */
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
  // `fresh` is also where we read the per-entry rotation /
  // transitionTime — the dataset only carries the sweep id.
  const fresh = getTreedisEntry(name);
  const effectiveSweep = sweepId || (fresh && fresh.sweepId) || null;

  openStreetView(effectiveSweep, name, getCategory(name), {
    rotation:       (fresh && fresh.rotation)       || null,
    transitionTime: (fresh && fresh.transitionTime) || null
  });
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

