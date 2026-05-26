/* === SCSU app — Part 9: Sidebar, mobile drawer, search === */
/* Includes sections 13, 13b, 14, 14a, 14b, 15. */
/* -----------------------------------------------------------
   13. Locations sidebar (Figma-style list)
   ----------------------------------------------------------- */
function syncLocationsList() {
  const rows = el.locationsList.querySelectorAll(".location-row");
  rows.forEach((r) => {
    const name = r.dataset.name || "";
    const active = selectedLayer &&
                   cleanName(selectedLayer.feature.properties.name).toLowerCase() === name;
    r.classList.toggle("is-active", !!active);
  });

  // Also sync the All-tab list (added for the Featured/All redesign)
  if (el.allLocationsList) {
    const allRows = el.allLocationsList.querySelectorAll(".location-row");
    allRows.forEach((r) => {
      const name = r.dataset.name || "";
      const active = selectedLayer &&
                     cleanName(selectedLayer.feature.properties.name).toLowerCase() === name;
      r.classList.toggle("is-active", !!active);
    });
  }
}

function renderLocationsList() {
  el.locationsCount.textContent = tourStops.length;
  const rows = [];

  // "Recenter on Tour" row — fits the map to all tour stops so the
  // user can re-orient on the full route after navigating away.
  rows.push(`
    <li class="location-row all-row" role="option" data-all="1">
      <div>
        <div class="location-name">Recenter on Tour</div>
        <div class="location-num">${tourStops.length} STOPS</div>
      </div>
      <span class="location-chev">›</span>
    </li>
  `);

  tourStops.forEach((stop, i) => {
    const name = cleanName(stop.feature.properties.name);
    const cat = getCategory(name);
    const props = stop.feature.properties || {};
    const offCampus = !!props.off_campus;
    const distance = props.off_campus_distance || "";
    const offCampusBadge = offCampus && distance
      ? `<span class="location-offcampus-badge" title="This location is not on the campus map">${distance}</span>`
      : "";
    const rowClass = offCampus ? "location-row is-offcampus" : "location-row";
    rows.push(`
      <li class="${rowClass}" role="option" data-name="${name.toLowerCase()}">
        <div>
          <div class="location-name">
            <span class="location-index">${i + 1}.</span>${name}
          </div>
          <div class="location-cat">${cat}</div>
          ${offCampusBadge}
        </div>
        <span class="location-chev">›</span>
      </li>
    `);
  });

  el.locationsList.innerHTML = rows.join("");

  el.locationsList.querySelectorAll(".location-row").forEach((row) => {
    row.addEventListener("click", () => {
      if (row.dataset.all) {
        clearSelection();
        if (imageBounds) resetCampusView(true);
        // On mobile, close the drawer after action
        closeMobileLocations();
        return;
      }
      const name = row.dataset.name;
      const stop = tourStops.find(
        (s) => cleanName(s.feature.properties.name).toLowerCase() === name
      );
      if (!stop) return;

      const locationName = cleanName(stop.feature.properties.name);

      // Two paths depending on which "mode" the user is in:
      //
      // Street view mode → drive the 3D viewer to the selected
      //   location's sweep without leaving street view. This is
      //   what the wireframe describes when it says "Tap the
      //   LOCATIONS MENU to re-access the locations list" while
      //   street view is active. We also keep the map's selected
      //   feature in sync (silently, without flying the map or
      //   opening the bottom sheet) so when the user eventually
      //   closes street view, the map is already focused on the
      //   right building.
      //
      // Map mode → existing behavior: select the feature, fly
      //   the map, open the details bottom sheet.
      closeMobileLocations({ silent: true });

      if (streetViewActive) {
        const entry = getTreedisEntry(locationName);
        const sweepId = entry && entry.sweepId;
        if (sweepId) {
          openStreetView(sweepId, locationName, getCategory(locationName), {
            rotation:       (entry && entry.rotation)       || null,
            transitionTime: (entry && entry.transitionTime) || null
          });
        } else {
          // No sweep mapped — fall back to selecting on the map
          // and closing street view so the user isn't stranded.
          console.warn(
            "[locations] no Treedis sweep for", locationName,
            "— falling back to map view"
          );
          closeStreetView();
          selectFeature(stop.layer, "tour", { focus: true });
        }
        // Keep the underlying map selection in sync so the tour
        // bar index, pin highlight, and details data are correct
        // when the user closes street view later.
        selectFeature(stop.layer, "tour", { focus: false });
        return;
      }

      selectFeature(stop.layer, "tour", { focus: true });
    });
  });
}

/* -----------------------------------------------------------
   13b. "All" tab — every building on the campus
   -----------------------------------------------------------
   Populates #allLocationsList from buildingsLayer (the full
   building polygon set). Clicking a row selects that feature
   on the map and opens the details panel, exactly like the
   Featured rows do for tour stops.
   ----------------------------------------------------------- */
function renderAllLocationsList() {
  if (!el.allLocationsList || !buildingsLayer) return;

  // Collect (name, layer) pairs from the building features. We
  // dedupe by lower-cased clean name so duplicate features don't
  // each get their own row.
  const seen = new Map();
  buildingsLayer.eachLayer((layer) => {
    const f = layer.feature;
    if (!f || !f.properties) return;
    const raw = f.properties.name;
    if (!raw) return;
    const name = cleanName(raw);
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.set(key, { name, layer, kind: "building" });
  });

  // Tour-stop buildings are intentionally absent from buildingsLayer
  // (their footprints duplicate the tour polygons — see boot()). Add the
  // on-campus ones back here so the All list still lists them; their row
  // selects the tour feature. Off-campus stops (e.g. the farm) are not
  // buildings, so they stay out of this list.
  (tourStops || []).forEach((stop) => {
    const f = stop.feature;
    if (!f || !f.properties || f.properties.off_campus) return;
    const name = cleanName(f.properties.name);
    const key = name.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, { name, layer: stop.layer, kind: "tour" });
  });

  if (!seen.size) {
    el.allLocationsList.innerHTML =
      `<li class="locations-empty">No buildings loaded.</li>`;
    return;
  }

  // Which sort mode is currently active? Defaults to alphabetical
  // — matches the radio's `checked` default in map.html and
  // mirrors the Figma reference where Alphabetical is the active
  // option on first paint.
  const byDept = !!(el.locSortDept && el.locSortDept.checked);

  // Alphabetical: a single flat list, A→Z by name. The Featured
  // tab is intentionally ordered by tour sequence; "All" reads
  // better as a reference index here.
  const items = Array.from(seen.values())
                     .sort((a, b) => a.name.localeCompare(b.name));

  // Shared row template — used by both sort modes.
  const rowHTML = (it) => {
    return `
      <li class="location-row" role="option"
          data-name="${it.name.toLowerCase()}">
        <div>
          <div class="location-name">${it.name}</div>
        </div>
        <span class="location-chev">›</span>
      </li>
    `;
  };

  let html;

  if (!byDept) {
    html = items.map(rowHTML).join("");
  } else {
    // Department mode: group each building under every
    // department it belongs to. A building with N departments
    // appears in N groups (e.g. Nance Hall under both
    // "Mathematics & Science" and "College of Agriculture") —
    // this matches user expectation when scanning by program.
    //
    // Buildings with NO departments configured are bucketed
    // under "OTHER" at the bottom so they remain reachable from
    // this view rather than disappearing entirely.
    const groups = new Map();       // normalizedKey -> [items]
    const groupLabels = new Map();  // normalizedKey -> displayLabel
    const ensure = (label) => {
      const trimmed = String(label || "").trim();
      const normalized = (trimmed || "Other").toLowerCase();
      if (!groups.has(normalized)) groups.set(normalized, []);
      if (!groupLabels.has(normalized)) {
        groupLabels.set(normalized, trimmed || "Other");
      }
      return groups.get(normalized);
    };

    items.forEach((it) => {
      const depts = getDepartments(it.name);
      if (!depts.length) {
        ensure("Other").push(it);
        return;
      }

      // Keep a building in multiple departments, but never twice
      // in the same department (handles duplicate labels in data).
      const seenDeptKeys = new Map();
      depts.forEach((d) => {
        const label = String(d || "").trim();
        if (!label) return;
        const key = label.toLowerCase();
        if (seenDeptKeys.has(key)) return;
        seenDeptKeys.set(key, true);
        ensure(label).push(it);
      });

      if (!seenDeptKeys.size) {
        ensure("Other").push(it);
      }
    });

    // Sort group names alphabetically, then pin "Other" last so
    // department groups read in a predictable order.
    const groupKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "other") return  1;
      if (b === "other") return -1;
      const aLabel = groupLabels.get(a) || a;
      const bLabel = groupLabels.get(b) || b;
      return aLabel.localeCompare(bLabel);
    });

    html = groupKeys.map((key) => {
      const label = groupLabels.get(key) || key;
      const headerHTML =
        `<li class="locations-group-h" role="presentation">` +
        `${label.toUpperCase()}</li>`;
      const rows = groups.get(key)
                         .sort((a, b) => a.name.localeCompare(b.name))
                         .map(rowHTML).join("");
      return headerHTML + rows;
    }).join("");
  }

  el.allLocationsList.classList.toggle("is-grouped-by-dept", byDept);
  el.allLocationsList.innerHTML = html;

  el.allLocationsList.querySelectorAll(".location-row").forEach((row) => {
    row.addEventListener("click", () => {
      const name = row.dataset.name;
      const item = items.find(
        (i) => i.name.toLowerCase() === name
      );
      if (!item) return;

      // Mobile: close the drawer after the user picks something.
      closeMobileLocations({ silent: true });

      // Most rows are buildings; the handful of tour-stop rows carry
      // kind:"tour" so they select the tour feature (with its tour
      // content) rather than a building.
      selectFeature(item.layer, item.kind || "building", { focus: true });
    });
  });
}

/* Re-render the All list when the user toggles the sort radio.
   Bound once at module load — the inputs may not exist on very
   old saved DOM but the optional-chaining guard keeps this
   harmless if so. */
if (el.locSortAlpha) {
  el.locSortAlpha.addEventListener("change", renderAllLocationsList);
}
if (el.locSortDept) {
  el.locSortDept.addEventListener("change", renderAllLocationsList);
}

/* -----------------------------------------------------------
   14. Mobile locations drawer
   -----------------------------------------------------------
   The drawer slides in from the left, covering ~82% of the
   shell width. The remaining sliver of map behind it is dimmed
   by a backdrop that also tap-closes the drawer.

   Drawer and details are mutually exclusive.
   ----------------------------------------------------------- */
   function openMobileLocations() {
     drawerOpen = true;
     el.locations.classList.add("is-open");
     el.locationsBackdrop.classList.add("is-open");
     el.shell.classList.add("drawer-open");

     // Mutually exclusive with the details bottom sheet, but only
     // when we're in map mode. When the user is in street view, the
     // details panel may still have `is-open` set in the background
     // even though it's not visible — clearing the selection there
     // would also close the street view, which is not what the user
     // intended by tapping the Locations pill. They just want the
     // menu open *on top of* the current view (map or street view).
     if (!streetViewActive && el.details.classList.contains("is-open")) {
       clearSelection();
     }

     scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
   }

function closeMobileLocations(opts = {}) {
  if (!isMobile() && !opts.force) {
    // On desktop the list is permanent; nothing to do.
    return;
  }
  drawerOpen = false;
  el.locations.classList.remove("is-open");
  el.locationsBackdrop.classList.remove("is-open");
  el.shell.classList.remove("drawer-open");

  scheduleMapRefresh({ recenterIfNeeded: false, delay: 260 });
}

el.locationsToggle.addEventListener("click", () => {
  if (drawerOpen) closeMobileLocations();
  else openMobileLocations();
});
el.locationsClose.addEventListener("click", () => closeMobileLocations());
el.locationsBackdrop.addEventListener("click", () => closeMobileLocations());

/* -----------------------------------------------------------
   14a. Mobile details drag/slide
   -----------------------------------------------------------
   Ported from drag.html. The bottom sheet has two "snapped"
   states, "half" and "full", plus a transient "dragging" state
   where JS writes a live transform on the element. On release,
   the direction & distance of the drag decide which state to
   snap back to.
   ----------------------------------------------------------- */
let dragging  = false;
let dragStartY = 0;
let dragCurrY  = 0;
let dragStartMode = "half";

function onDetailsPointerDown(e) {
  if (!isMobile()) return;
  if (detailsMode !== "half" && detailsMode !== "full") return;

  dragging = true;
  dragStartY = e.clientY;
  dragCurrY  = e.clientY;
  dragStartMode = detailsMode;

  el.details.classList.add("is-dragging");
  try { el.detailsHandle.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
}

function onDetailsPointerMove(e) {
  if (!dragging || !isMobile()) return;
  dragCurrY = e.clientY;
  const delta = dragCurrY - dragStartY;

  // We only let the user drag in the "meaningful" direction for the
  // starting state. From "full", you can only pull down (delta>0).
  // From "half", you can either pull up to expand or down to dismiss.
  if (dragStartMode === "full") {
    el.details.style.transform = `translateY(${Math.max(0, delta)}px)`;
  } else if (dragStartMode === "half") {
    // Allow pull-up by up to 140px preview, pull-down unlimited.
    el.details.style.transform = `translateY(${Math.max(-140, delta)}px)`;
  }
}

function onDetailsPointerUp() {
  if (!dragging || !isMobile()) return;
  dragging = false;
  el.details.classList.remove("is-dragging");
  el.details.style.transform = "";

  const delta = dragCurrY - dragStartY;
  const THRESH = 40; // px of drag before we commit to a state change

  if (dragStartMode === "half") {
    if (delta < -THRESH) {
      setDetailsMode("full");
    } else if (delta > THRESH) {
      // Pulled down from half → dismiss entirely.
      clearSelection();
    } else {
      setDetailsMode("half");
    }
  } else if (dragStartMode === "full") {
    if (delta > THRESH) {
      setDetailsMode("half");
    } else {
      setDetailsMode("full");
    }
  }
}

el.detailsHandle.addEventListener("pointerdown", onDetailsPointerDown);
window.addEventListener("pointermove", onDetailsPointerMove);
window.addEventListener("pointerup",   onDetailsPointerUp);
window.addEventListener("pointercancel", onDetailsPointerUp);

/* Handle viewport changes. Switching from mobile → desktop (or vice
   versa) needs to reset panel state so the right CSS rules win. */
function handleViewportChange() {
  if (!isMobile()) {
    // On desktop: clear mobile-only state.
    drawerOpen = false;
    el.locations.classList.remove("is-open");
    el.locationsBackdrop.classList.remove("is-open");
    el.shell.classList.remove("drawer-open", "details-full");
    el.details.classList.remove("is-full", "is-hidden", "is-dragging");
    el.details.style.transform = "";
  } else {
    // On mobile: if details is open, restore the half state.
    if (el.shell.classList.contains("has-details")) {
      setDetailsMode("half");
    }
  }

  scheduleMapRefresh({ delay: 80 });
}
mqMobile.addEventListener?.("change", handleViewportChange);

/* -----------------------------------------------------------
   14b. Mobile search toggle
   ------------------------------------------------------------
   On desktop the search field lives permanently in the header,
   so the SEARCH button just focuses it. On mobile the search
   panel is hidden by default and the SEARCH button slides it
   in from under the header. The "x" button on the right of the
   field has two states:
     • if the input has text → clear the text
     • if empty              → close the whole panel
   ----------------------------------------------------------- */
function updateSearchBtnState() {
  if (!el.searchBtn) return;
  const open = el.metabarSearch.classList.contains("is-open");
  el.searchBtn.classList.toggle("is-active", open);
  el.searchBtn.setAttribute("aria-expanded", String(open));
}

function openSearchPanel() {
  el.metabarSearch.classList.add("is-open");
  // Let the DOM settle before focusing (avoids iOS keyboard flash)
  requestAnimationFrame(() => el.searchInput && el.searchInput.focus());
  updateSearchBtnState();
}

function closeSearchPanel() {
  el.metabarSearch.classList.remove("is-open");
  el.searchInput.value = "";
  el.searchResults.hidden = true;
  el.searchResults.innerHTML = "";
  refreshSearchClear();
  updateSearchBtnState();
}

function refreshSearchClear() {
  if (!el.searchClear) return;
  // Desktop: always hidden (the input behaves like a normal field).
  // Mobile : visible so the user can clear text or close the panel.
  if (isMobile()) {
    el.searchClear.hidden = false;
  } else {
    el.searchClear.hidden = true;
  }
}

if (el.searchBtn) {
  el.searchBtn.addEventListener("click", () => {
    if (isMobile()) {
      if (el.metabarSearch.classList.contains("is-open")) {
        closeSearchPanel();
      } else {
        openSearchPanel();
      }
    } else {
      // Desktop: just focus the field
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
}

if (el.searchClear) {
  el.searchClear.addEventListener("click", () => {
    if (el.searchInput.value) {
      // First click with text → clear it
      el.searchInput.value = "";
      el.searchResults.hidden = true;
      el.searchResults.innerHTML = "";
      el.searchInput.focus();
    } else {
      // Second click with empty input → close the panel (mobile only)
      if (isMobile()) {
        closeSearchPanel();
      }
    }
  });
}

// Keep the clear-button visibility in sync with the viewport
mqMobile.addEventListener?.("change", refreshSearchClear);
refreshSearchClear();

/* -----------------------------------------------------------
   15. Search
   ----------------------------------------------------------- */
   function renderSearch(q) {
     const term = q.trim().toLowerCase();
     if (!term) { el.searchResults.hidden = true; el.searchResults.innerHTML = ""; return; }

     // Two-pass filter: name matches rank above department matches
     // so typing "moss" still surfaces Moss Hall before any building
     // whose department string happens to contain "moss". We record
     // why each row matched so the result row can show the
     // department under the building name when that's what hit.
     const filtered = [];
     for (const x of allFeatures) {
       const n = cleanName(x.props.name).toLowerCase();
       if (!n) continue;

       if (n.includes(term)) {
         filtered.push({ ...x, matchKind: "name", matchedDept: null });
         continue;
       }

       const depts = getDepartments(cleanName(x.props.name));
       const hit = depts.find((d) => d.toLowerCase().includes(term));
       if (hit) {
         filtered.push({ ...x, matchKind: "dept", matchedDept: hit });
       }
     }

     // Sort: name matches first, then department matches. Within
     // each group, preserve the original allFeatures order
     // (which is buildings-then-tours from boot.js, so featured
     // tour stops sort beneath the buildings they live in — same
     // behavior as before for the name-match case).
     filtered.sort((a, b) => {
       if (a.matchKind === b.matchKind) return 0;
       return a.matchKind === "name" ? -1 : 1;
     });

     const byName = new Map();
     for (const m of filtered) {
       const key = cleanName(m.props.name).toLowerCase();
       const existing = byName.get(key);
       if (!existing) {
         byName.set(key, m);
         continue;
       }
       // Name match beats dept match for the same building.
       if (existing.matchKind === "dept" && m.matchKind === "name") {
         byName.set(key, m);
         continue;
       }
       // Tour beats building when names collide.
       if (existing.kind !== "tour" && m.kind === "tour" &&
           existing.matchKind === m.matchKind) {
         byName.set(key, m);
       }
     }

     const matches = Array.from(byName.values()).slice(0, 12);

     if (!matches.length) {
       el.searchResults.hidden = false;
       el.searchResults.innerHTML =
         `<div class="search-empty">No matches for "${q}".</div>`;
       return;
     }

     el.searchResults.hidden = false;
     el.searchResults.innerHTML = matches.map((m, i) => {
       // When the hit was on a department, show that department
       // under the building name as a small subtitle so the user
       // sees why this result appeared.
       const subtitle = m.matchKind === "dept" && m.matchedDept
         ? `<div class="search-result-sub">${escapeHTML(m.matchedDept)}</div>`
         : "";
       return `
         <div class="search-result" data-i="${i}" role="option">
           <div class="search-result-main">
             <span>${cleanName(m.props.name)}</span>
             ${subtitle}
           </div>
           <span class="tag ${m.kind}">${m.kind}</span>
         </div>
       `;
     }).join("");

     el.searchResults.querySelectorAll(".search-result").forEach((node) => {
       node.addEventListener("click", () => {
         const m = matches[Number(node.dataset.i)];
         if (!m) return;
         selectFeature(m.layer, m.kind, { focus: true });
         el.searchInput.value = cleanName(m.props.name);
         el.searchResults.hidden = true;
         // On mobile, tucking the search away after a pick feels right
         if (isMobile()) closeSearchPanel();
       });
     });
   }
