/* === SCSU app — Part 6: Details panel + selection (sec 7, 8) === */
/* -----------------------------------------------------------
   7. Details panel
   ----------------------------------------------------------- */
function openDetails()  {
  el.shell.classList.add("has-details");
  el.details.setAttribute("aria-hidden", "false");

  if (isMobile()) {
    // Always open mutually-exclusive with drawer
    closeMobileLocations({ silent: true });
    setDetailsMode("half");
  }

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

function closeDetails() {
  el.shell.classList.remove("has-details");
  el.details.setAttribute("aria-hidden", "true");
  el.details.classList.remove("is-open", "is-full", "is-hidden", "is-dragging");
  el.details.style.transform = "";
  detailsMode = null;
  el.shell.classList.remove("details-full");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

function setDetailsMode(next) {
  // next ∈ { "half", "full" }. On mobile, toggles the CSS state flags.
  if (!isMobile()) return;
  if (next !== "half" && next !== "full") return;

  detailsMode = next;
  el.details.classList.add("is-open");
  el.details.classList.toggle("is-full", next === "full");
  el.details.classList.remove("is-hidden", "is-dragging");
  el.details.style.transform = "";
  el.shell.classList.toggle("details-full", next === "full");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

/* Render the "WHAT HAPPENS HERE?" chip row. Hides the whole
   block if the list is empty. */
function renderHappensHere(name) {
  const items = getHappensHere(name);
  if (!el.chipsHere || !el.happensHereBlock) return;

  if (!items.length) {
    el.happensHereBlock.hidden = true;
    el.chipsHere.innerHTML = "";
    return;
  }

  el.happensHereBlock.hidden = false;
  el.chipsHere.innerHTML = items
    .map((t) => `<span class="chip">${escapeHTML(t)}</span>`)
    .join("");
}

/* Render the location hero image. Falls back to the
   placeholder "X" frame if no image is mapped. */
function renderImage(name) {
  if (!el.detailsImage) return;
  const src = getImage(name);

  if (!src) {
    el.detailsImage.classList.remove("has-image");
    el.detailsImage.innerHTML =
      '<div class="details-image-x" aria-hidden="true"></div>' +
      '<figcaption>LOCATION IMAGE</figcaption>';
    return;
  }

  // Show the placeholder immediately so the panel's slide-in has a
  // simple box to render — then swap in the real <img> after the
  // current frame commits. Because the image is already in the
  // browser cache (preloaded on boot), this swap is effectively
  // instant and doesn't cause layout thrash during the panel's
  // transform animation.
  el.detailsImage.classList.remove("has-image");
  el.detailsImage.innerHTML =
    '<div class="details-image-x" aria-hidden="true"></div>' +
    '<figcaption>LOCATION IMAGE</figcaption>';

  requestAnimationFrame(() => {
    // Bail if the user has already navigated somewhere else.
    if (el.detailsImage.dataset.pendingSrc !== src) return;
    el.detailsImage.classList.add("has-image");
    el.detailsImage.innerHTML =
      `<img src="${escapeHTML(src)}" alt="${escapeHTML(name)}" ` +
      `onerror="this.parentNode.classList.remove('has-image');` +
      `this.parentNode.innerHTML='&lt;div class=&quot;details-image-x&quot;&gt;&lt;/div&gt;` +
      `&lt;figcaption&gt;LOCATION IMAGE&lt;/figcaption&gt;'">`;
  });
  el.detailsImage.dataset.pendingSrc = src;
}

/* Render the "EXPLORABLE LOCATIONS" list. Hides the whole
   block if the list is empty. Each row is clickable and — via
   the handler attached in renderDetails — opens the street view
   at that sub-location's sweep (falling back to the parent's
   view when the data isn't filled in yet). */
function renderExplorable(name) {
  const items = getExplorable(name);
  if (!el.subList || !el.explorableBlock) return;

  if (!items.length) {
    el.explorableBlock.hidden = true;
    el.subList.innerHTML = "";
    return;
  }

  el.explorableBlock.hidden = false;
  el.subList.innerHTML = items
    .map((t) => {
      const entry = getTreedisEntry(t);
      const hasSweep = !!(entry && entry.sweepId);
      // Rows without a sweep get a subtle "pending" class so they
      // still look clickable but signal that data is on the way.
      const pendingCls = hasSweep ? "" : " is-pending";
      return `<li class="sub-row${pendingCls}" role="button" tabindex="0" ` +
             `data-sub="${escapeHTML(t)}">` +
             `<span>${escapeHTML(t)}</span>` +
             `<span class="chev">›</span></li>`;
    })
    .join("");

  // Wire click handlers — the enclosing renderDetails knows the
  // parent building name, so we read it off dataset there.
  const parentName = el.subList.dataset.parent || "";
  el.subList.querySelectorAll(".sub-row").forEach((li) => {
    const handler = () => {
      const sub = li.dataset.sub;
      openSubLocationInStreetView(parentName, sub);
    };
    li.addEventListener("click", handler);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });
}

/* Render the physical address block and "Open in Maps" links.
   ----------------------------------------------------------------
   Pulls the address string from addressMap (via getAddress()). If
   the location has no address configured the whole block is
   hidden — there's no placeholder state. When an address IS
   configured, we render:

     • The address line itself (selectable text so users can copy).
     • A "Google Maps" link  — works everywhere, opens in a new tab.
     • An "Apple Maps" link  — shown only on iOS/macOS UAs.
     • A native "Open in Maps" link using the geo: URI scheme —
       shown only on Android/iOS where the OS routes geo: through
       its app chooser, letting users pick whichever map app they
       prefer (Waze, OsmAnd, Maps.me, etc.).

   The Google Maps link uses the official Maps URL `search` endpoint
   (api=1 + query=encoded address). Both Apple Maps and the geo:
   URI accept the same plain-text address. */
function renderAddress(name) {
  if (!el.addressBlock || !el.detailsAddress || !el.detailsAddressLinks) return;

  const addr = getAddress(name);
  if (!addr) {
    el.addressBlock.hidden = true;
    el.detailsAddress.textContent = "";
    el.detailsAddressLinks.innerHTML = "";
    return;
  }

  el.addressBlock.hidden = false;
  el.detailsAddress.textContent = addr;

  const q = encodeURIComponent(addr);
  const ua = navigator.userAgent || "";
  const isIOS     = /iPhone|iPad|iPod/.test(ua);
  const isMacOS   = /Macintosh/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile  = isIOS || isAndroid;

  const links = [];

  // Google Maps — universal, works in every browser.
  links.push(
    `<a class="address-link address-link-google" ` +
    `href="https://www.google.com/maps/search/?api=1&query=${q}" ` +
    `target="_blank" rel="noopener noreferrer" ` +
    `aria-label="Open ${escapeHTML(addr)} in Google Maps">` +
    `<span class="address-link-icon" aria-hidden="true">🗺️</span>` +
    `Google Maps</a>`
  );

  // Apple Maps — only show on Apple platforms where it actually opens.
  if (isIOS || isMacOS) {
    links.push(
      `<a class="address-link address-link-apple" ` +
      `href="https://maps.apple.com/?q=${q}" ` +
      `target="_blank" rel="noopener noreferrer" ` +
      `aria-label="Open ${escapeHTML(addr)} in Apple Maps">` +
      `<span class="address-link-icon" aria-hidden="true">🍎</span>` +
      `Apple Maps</a>`
    );
  }

  // geo: URI — Android & iOS both hand this to the OS app chooser
  // so the user can pick their preferred map app (Waze, OsmAnd,
  // Maps.me, etc.). Skipped on desktop browsers where it does
  // nothing useful.
  if (isMobile) {
    links.push(
      `<a class="address-link address-link-native" ` +
      `href="geo:0,0?q=${q}" ` +
      `aria-label="Open ${escapeHTML(addr)} in your preferred map app">` +
      `<span class="address-link-icon" aria-hidden="true">📍</span>` +
      `Open in Maps</a>`
    );
  }

  el.detailsAddressLinks.innerHTML = links.join("");
}

function renderDetails(feature, kind) {
  const props = (feature && feature.properties) || {};
  const name = cleanName(props.name);
  const isOffCampus = !!props.off_campus;
  const offCampusDistance = props.off_campus_distance || "";

  if (isOffCampus) {
    el.detailsTag.textContent = "OFF-CAMPUS STOP";
    el.detailsTag.classList.add("is-offcampus");
  } else {
    el.detailsTag.textContent = (kind === "tour"
                                   ? "TOUR STOP"
                                   : "CAMPUS BUILDING");
    el.detailsTag.classList.remove("is-offcampus");
  }

  el.detailsTitle.textContent = name || "—";

  /* Subtitle under the building name shows the department(s)
     occupying the location — per the Figma metadata panel (e.g.
     "Mathematics & Science; College of Agriculture"). When the
     location has no departments configured (open spaces,
     historic shells), we fall back to the category so the row
     never reads as an empty line. The category itself still
     appears in the kicker tag above the title. */
  const depts = getDepartments(name);
  el.detailsSub.textContent = depts.length
    ? depts.join("; ")
    : (getCategory(name) || "—");

  el.detailsBody.textContent  = getDescription(name);

  /* Insert (or remove) a small inline notice right above the
     description so users on the details panel know the site is
     not represented on the campus map. The notice element is
     created lazily on demand and lives as a sibling of the
     description body. */
  let note = document.getElementById("detailsOffCampusNote");
  if (isOffCampus) {
    if (!note && el.detailsBody && el.detailsBody.parentNode) {
      note = document.createElement("div");
      note.id = "detailsOffCampusNote";
      note.className = "details-offcampus-note";
      el.detailsBody.parentNode.insertBefore(note, el.detailsBody);
    }
    if (note) {
      const distLine = offCampusDistance
        ? ` Approximately <strong>${offCampusDistance}</strong>.`
        : "";
      note.innerHTML =
        `<span class="offcampus-icon" aria-hidden="true">📍</span>` +
        `<span><strong>Off-campus location.</strong> ` +
        `This site isn't shown on the campus map.${distLine} ` +
        `Use <strong>Explore</strong> to open the virtual tour.</span>`;
    }
  } else if (note && note.parentNode) {
    note.parentNode.removeChild(note);
  }

  // Stash the parent name so the explorable list's click handlers
  // know which building they belong to.
  if (el.subList) el.subList.dataset.parent = name || "";

  renderHappensHere(name);
  renderExplorable(name);
  renderAddress(name);
  renderImage(name);

  // Annotate the Explore CTA with the current location so the
  // single button click handler (wired once, further down) knows
  // where to navigate.
  //
  // Visibility rule: both the Explore CTA and the VR-Enabled
  // controls are shown ONLY when this location has a real Treedis
  // sweep configured (see hasSweep() / treedis-sweeps.js).
  // Buildings without a sweep (e.g. Staley Hall, most academic
  // halls that haven't been captured yet) shouldn't advertise an
  // immersive view that doesn't exist — the panel quietly drops
  // both the red CTA and the VR row, becoming an info-only card.
  //
  // We toggle four elements so both layouts (mobile inline +
  // desktop/iPad persistent footer) stay in sync:
  //   #exploreCta        — mobile inline Explore button
  //   #exploreCtaFooter  — desktop/iPad footer Explore button
  //   .details-vr-inline — mobile inline VR-Enabled row
  //   .details-footer    — entire desktop/iPad footer bar
  //                        (collapses cleanly instead of leaving
  //                        an empty 85px black strip)
  const sweepAvailable = hasSweep(name);

  // We use a dedicated CSS class (`.is-hidden-no-sweep`) rather
  // than the HTML `hidden` attribute because several of these
  // elements have explicit `display: flex` / `display: inline-flex`
  // CSS rules that outrank `hidden`'s implicit `display: none`.
  // The class carries `!important` to win that battle cleanly —
  // see the matching rules in 04-map-details.css.
  if (el.exploreCta) {
    const entry = getTreedisEntry(name);
    el.exploreCta.dataset.locationName = name || "";
    el.exploreCta.dataset.sweepId = (entry && entry.sweepId) || "";
    el.exploreCta.classList.toggle("is-hidden-no-sweep", !sweepAvailable);
  }
  if (el.exploreCtaFooter) {
    el.exploreCtaFooter.classList.toggle("is-hidden-no-sweep", !sweepAvailable);
  }
  if (el.vrInline) {
    el.vrInline.classList.toggle("is-hidden-no-sweep", !sweepAvailable);
  }
  if (el.detailsFooter) {
    el.detailsFooter.classList.toggle("is-hidden-no-sweep", !sweepAvailable);
  }
  if (el.vrBtn) {
    const entry = getTreedisEntry(name);
    el.vrBtn.dataset.locationName = name || "";
    el.vrBtn.dataset.sweepId = (entry && entry.sweepId) || "";
  }
}

/* -----------------------------------------------------------
   8. Selection + focus
   ----------------------------------------------------------- */
function resetLayerStyle(layer, kind) {
  if (!layer || typeof layer.setStyle !== "function") return;
  layer.setStyle(styleFor(kind, layer.feature));
}

/* Compute the padding to use when flying to a selected feature.
   On mobile, the details sheet covers roughly the bottom half of
   the shell area, so we inflate the *bottom* padding so that the
   feature's center ends up in the visible upper half of the map. */
function focusPaddingFor(layer) {
  if (!isMobile()) return { padding: [80, 80] };

  const shell = el.shell;
  const shellH = shell ? shell.clientHeight : 600;
  // matches --mobile-half-h (46dvh of the whole viewport)
  // We need the portion of the shell that will be covered, roughly.
  const panelH = Math.round(window.innerHeight * 0.46);
  const bottomPad = Math.min(Math.max(panelH, 140), shellH - 80);

  return {
    paddingTopLeft:     [24, 24],
    paddingBottomRight: [24, bottomPad]
  };
}

function selectFeature(layer, kind, { focus = false } = {}) {
  if (selectedLayer && selectedLayer !== layer) {
    resetLayerStyle(selectedLayer, selectedKind);
    if (selectedLayer.closeTooltip) selectedLayer.closeTooltip();
  }
  selectedLayer = layer;
  selectedKind  = kind;

  const isOffCampus = isOffCampusFeature(layer && layer.feature);

  if (selectedLayer && typeof selectedLayer.setStyle === "function") {
    selectedLayer.setStyle(selectedStyleFor(layer && layer.feature));
    if (selectedLayer.bringToFront) selectedLayer.bringToFront();
  }

  renderDetails(layer.feature, kind);
  openDetails();
  if (layer.openTooltip) layer.openTooltip();

  /* Off-campus tour stops (e.g. Olar Farm) carry a placeholder
     polygon at the campus edge as a directional indicator only.
     Flying to it would zoom past every real building on the way
     and confuse the user, so we skip the per-feature fly. Instead,
     we reset to the full campus view so the user sees the whole
     campus plus the directional arrow pointing toward the real
     site — visual confirmation that the location isn't on the
     map. The details panel still opens and the user can click
     Explore to jump straight into the Treedis sweep.

     We skip the reset when the user is already inside the street
     view (streetViewActive) — there's no visible map to refresh,
     and snapping it underneath would just spend an animation the
     user can't see. */
  if (focus && layer.getBounds && !isOffCampus) {
    const fitOpts = {
      ...focusPaddingFor(layer),
      maxZoom: config.tour.focusZoom,
      duration: 0.55
    };
    // Let the layout settle before flying so Leaflet measures the
    // latest shell width after the details panel state changes.
    const fly = () => {
      refreshMapConstraints({ recenterIfNeeded: false });
      map.flyToBounds(layer.getBounds(), fitOpts);
    };
    if (isMobile()) {
      requestAnimationFrame(() => requestAnimationFrame(fly));
    } else {
      requestAnimationFrame(fly);
    }
  } else if (focus && isOffCampus && !streetViewActive && imageBounds) {
    // Off-campus path: animate the map back to the full campus
    // view. Uses the same RAF settle pattern as the normal fly so
    // Leaflet measures the post-panel-open shell width correctly.
    const reset = () => {
      refreshMapConstraints({ recenterIfNeeded: false });
      resetCampusView(true);
    };
    if (isMobile()) {
      requestAnimationFrame(() => requestAnimationFrame(reset));
    } else {
      requestAnimationFrame(reset);
    }
  }

  // Update the left-side locations list
  syncLocationsList();

  // Update tour index + pin highlight
  const idx = tourStops.findIndex((s) => s.layer === layer);
  tourIndex = idx;
  updateTourbar();
  highlightActivePin();

  // If the user is currently inside the street view, also move
  // the Treedis camera to the newly-selected location. This makes
  // the left Locations list / tour arrows / search results all
  // drive the 3D experience while it's open, per the spec.
  if (streetViewActive) {
    navigateStreetViewToLayer(layer);
  }
}

function clearSelection() {
  if (selectedLayer) {
    resetLayerStyle(selectedLayer, selectedKind);
    if (selectedLayer.closeTooltip) selectedLayer.closeTooltip();
  }

  selectedLayer = null;
  selectedKind  = null;
  tourIndex = -1;
  closeDetails();
  // Closing the details panel also closes the street view — without
  // a selected building there's nothing to drive the 3D view.
  if (streetViewActive) closeStreetView();
  updateTourbar();
  highlightActivePin();
  syncLocationsList();
}
