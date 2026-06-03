/* === SCSU app — Part 7: Layer builders, bounds, tour pins === */
/* -----------------------------------------------------------
   9. Layer builders
   ----------------------------------------------------------- */
function bindEvents(feature, layer, kind) {
  const props = feature.properties || {};
  const label = cleanName(props.name);
  if (!label) return;

  // Permanent labels stay drawn on the map at all times; otherwise
  // the tooltip behaves as a hover label (the default).
  const permanent = !!config.ui.permanentLabels;

  if (config.ui.showBuildingTooltips || kind === "tour") {
    layer.bindTooltip(label, {
      direction: permanent ? "center" : "top",
      className: permanent ? "campus-label campus-label-permanent"
                           : "campus-label",
      permanent: permanent,
      sticky: false,
      opacity: 1
    });
  }

  let isHovered = false;

  layer.on({
    mouseover: () => {
      isHovered = true;
      if (selectedLayer === layer) return;
      if (!config.ui.enableHoverPreview) return;
      layer.setStyle(hoverStyleFor(kind, feature));
      if (layer.bringToFront) layer.bringToFront();
    },
    mouseout: () => {
      isHovered = false;
      if (selectedLayer === layer) return;
      resetLayerStyle(layer, kind);
      // Don't dismiss permanent labels on mouse-out — they stay drawn.
      if (!permanent && layer.closeTooltip) layer.closeTooltip();
    },
    // Safety net: if Leaflet opens the tooltip AFTER the cursor
    // has already left (fast-hover race), close it immediately.
    // Skipped for permanent labels, which should remain open.
    tooltipopen: () => {
      if (!permanent && !isHovered && layer.closeTooltip) layer.closeTooltip();
    },
    click: (e) => {
      L.DomEvent.stopPropagation(e);
      selectFeature(layer, kind, { focus: true });
    }
  });
}

function buildLayer(data, kind, paneName) {
  return L.geoJSON(data, {
    pane: paneName,
    style: (feature) => styleFor(kind, feature),
    onEachFeature: (f, l) => bindEvents(f, l, kind)
  });
}

/* -----------------------------------------------------------
   10. Image-bounds computation
   ----------------------------------------------------------- */
function computeImageBounds(b, imgPxW, imgPxH, padPct, align) {
  const s = b.getSouth(), n = b.getNorth();
  const w = b.getWest(),  e = b.getEast();
  const latC = (s + n) / 2;
  const lngC = (w + e) / 2;

  let heightDeg = n - s;
  let widthDeg  = e - w;

  const latScale = Math.cos((latC * Math.PI) / 180);
  const dataAspect = (widthDeg * latScale) / heightDeg;
  const imgAspect  = imgPxW / imgPxH;

  if (imgAspect > dataAspect) {
    widthDeg = (heightDeg * imgAspect) / latScale;
  } else {
    heightDeg = (widthDeg * latScale) / imgAspect;
  }

  widthDeg  *= 1 + padPct;
  heightDeg *= 1 + padPct;

  // Apply user-tunable alignment offsets + independent X/Y scale
  const a = align || {};
  const offLat = Number(a.offsetLat) || 0;
  const offLng = Number(a.offsetLng) || 0;
  const sx = Number.isFinite(a.scaleX) && a.scaleX > 0 ? a.scaleX : 1;
  const sy = Number.isFinite(a.scaleY) && a.scaleY > 0 ? a.scaleY : 1;

  widthDeg  *= sx;
  heightDeg *= sy;

  const cLat = latC + offLat;
  const cLng = lngC + offLng;

  return L.latLngBounds(
    [cLat - heightDeg / 2, cLng - widthDeg / 2],
    [cLat + heightDeg / 2, cLng + widthDeg / 2]
  );
}

/* -----------------------------------------------------------
   11. Tour pins (numbered circles over stops)
   ----------------------------------------------------------- */
function buildTourPins() {
  tourStops = [];

  toursLayer.eachLayer((layer) => {
    const f = layer.feature;
    const props = f.properties || {};
    const order = Number(props.order_num);
    if (!Number.isFinite(order)) return;

    let center;
    try { center = layer.getBounds().getCenter(); }
    catch (e) { return; }

    // Off-campus tour stops (e.g. Olar Farm) get a distinct
    // amber pin with a small arrow glyph so the user can see
    // at a glance that the shape on the map is a directional
    // indicator rather than a real building footprint.
    // On-campus stops no longer show a numbered pin (client request) —
    // only off-campus stops keep a pin, an amber directional arrow that
    // tells the user the on-map shape is an indicator, not a real
    // footprint. On-campus stops are still navigable via the tour bar /
    // sidebar; they just have no marker.
    const offCampus = !!props.off_campus;
    let marker = null;
    if (offCampus) {
      const icon = L.divIcon({
        className: "tour-pin-wrap is-offcampus",
        html:
          `<div class="tour-pin is-offcampus" data-order="${order}" ` +
          `title="Off-campus location — click for details">` +
          `${order}<span class="tour-pin-arrow" aria-hidden="true">↗</span></div>`,
        iconSize: [34, 26],
        iconAnchor: [17, 13]
      });

      marker = L.marker(center, {
        icon,
        pane: "pinsPane",
        interactive: false,
        keyboard: false
      });
      tourPinsLayer.addLayer(marker);
    }

    tourStops.push({ feature: f, layer, marker, order });
  });

  tourStops.sort((a, b) => a.order - b.order);
  setText(el.tourTotal,       tourStops.length);
  setText(el.tourTotalMobile, tourStops.length);
  setText(el.tourCurrent,       0);
  setText(el.tourCurrentMobile, 0);
  updateTourbar();
}

function highlightActivePin() {
  document.querySelectorAll(".tour-pin.is-active")
          .forEach((n) => n.classList.remove("is-active"));
  const stop = tourStops[tourIndex];
  if (!stop || !stop.marker) return;          // on-campus stops have no pin
  const node = stop.marker.getElement()?.querySelector(".tour-pin");
  if (node) node.classList.add("is-active");
}
