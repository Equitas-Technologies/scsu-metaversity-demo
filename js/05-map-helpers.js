/* === SCSU app — Part 5: Map constraints + refresh helpers === */
/* -----------------------------------------------------------
   6a. Map constraints + refresh helpers
   ----------------------------------------------------------- */
function getCampusCoverZoom() {
  if (!imageBounds) return 15;
  return Math.min(map.getMaxZoom(), map.getBoundsZoom(imageBounds, true));
}

function refreshMapConstraints({ recenterIfNeeded = true } = {}) {
  if (!imageBounds) return;

  map.invalidateSize({ pan: false });

  const coverZoom = getCampusCoverZoom();
  const extraZoomOut =
  config.mapMode === "tiles"
    ? ((config.tiles && config.tiles.zoomOutExtra) ?? 0.75)
    : 0.75;

  const minAllowedZoom = Math.max(0, coverZoom - extraZoomOut);

  map.setMaxBounds(imageBounds);
  map.setMinZoom(minAllowedZoom);

  if (!recenterIfNeeded) return;

  if (map.getZoom() < minAllowedZoom) {
    map.setView(imageBounds.getCenter(), minAllowedZoom, { animate: false });
  } else {
    map.panInsideBounds(imageBounds, { animate: false });
  }
}

function getCampusOffsetCenter(zoom, offsetXPx = 0, offsetYPx = 60) {
  if (!imageBounds) return null;

  const baseCenter = imageBounds.getCenter();
  const projected = map.project(baseCenter, zoom);

  // Negative Y here makes the image appear lower on screen.
  const shifted = L.point(projected.x + offsetXPx, projected.y - offsetYPx);

  return map.unproject(shifted, zoom);
}

function resetCampusView(animate = false) {
  if (!imageBounds) return;

  refreshMapConstraints({ recenterIfNeeded: false });

  // Tile mode: fit to the campus/vector bounds, not to a fake image box.
  if (config.mapMode === "tiles") {
    const opts = {
      padding: [24, 24],
      animate
    };

    if (config.tiles && config.tiles.initialZoom) {
      opts.maxZoom = config.tiles.initialZoom;
    }

    map.fitBounds(imageBounds, opts);
    return;
  }

  // Legacy single-image mode.
  const zoom = getCampusCoverZoom();
  const center = getCampusOffsetCenter(zoom, 0, -230);

  map.setView(center, zoom, { animate });
}

function scheduleMapRefresh({ recenterIfNeeded = true, delay = 0 } = {}) {
  clearTimeout(scheduleMapRefresh._t);
  scheduleMapRefresh._t = setTimeout(() => {
    refreshMapConstraints({ recenterIfNeeded });
  }, delay);
}

