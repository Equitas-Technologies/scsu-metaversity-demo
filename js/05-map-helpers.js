/* === SCSU app — Mapbox GL camera and bounds helpers === */
class CampusBounds {
  constructor(sw, ne) {
    this.west = Infinity; this.south = Infinity;
    this.east = -Infinity; this.north = -Infinity;
    if (sw) this.extend(sw);
    if (ne) this.extend(ne);
  }
  extend(value) {
    if (value instanceof CampusBounds) {
      if (value.isValid()) {
        this.extend([value.south, value.west]);
        this.extend([value.north, value.east]);
      }
      return this;
    }
    const [lat, lng] = value;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.west = Math.min(this.west, lng); this.east = Math.max(this.east, lng);
      this.south = Math.min(this.south, lat); this.north = Math.max(this.north, lat);
    }
    return this;
  }
  isValid() { return this.west <= this.east && this.south <= this.north; }
  getSouth() { return this.south; }
  getNorth() { return this.north; }
  getWest() { return this.west; }
  getEast() { return this.east; }
  getCenter() { return { lat: (this.south + this.north) / 2, lng: (this.west + this.east) / 2 }; }
  pad(ratio) {
    const dy = (this.north - this.south) * ratio;
    const dx = (this.east - this.west) * ratio;
    return new CampusBounds([this.south - dy, this.west - dx], [this.north + dy, this.east + dx]);
  }
  toGL() { return [[this.west, this.south], [this.east, this.north]]; }
}

function getCampusCoverZoom() {
  if (!imageBounds) return 15;
  const camera = map.cameraForBounds(imageBounds.toGL(), { padding: 0 });
  return Math.min(map.getMaxZoom(), camera?.zoom ?? 15);
}

function refreshMapConstraints({ recenterIfNeeded = true } = {}) {
  if (!imageBounds) return;
  map.resize();
  const extraZoomOut = (config.tiles && config.tiles.zoomOutExtra) ?? 0.75;
  const minAllowedZoom = Math.max(0, getCampusCoverZoom() - extraZoomOut);
  map.setMaxBounds(imageBounds.toGL());
  map.setMinZoom(minAllowedZoom);
  if (recenterIfNeeded && map.getZoom() < minAllowedZoom) {
    const center = imageBounds.getCenter();
    map.jumpTo({ center: [center.lng, center.lat], zoom: minAllowedZoom });
  }
}

function resetCampusView(animate = false) {
  if (!imageBounds) return;
  refreshMapConstraints({ recenterIfNeeded: false });
  map.fitBounds(imageBounds.toGL(), {
    padding: 24,
    maxZoom: config.tiles?.initialZoom || 20,
    duration: animate ? 550 : 0
  });
}

function scheduleMapRefresh({ recenterIfNeeded = true, delay = 0 } = {}) {
  clearTimeout(scheduleMapRefresh._t);
  scheduleMapRefresh._t = setTimeout(() => refreshMapConstraints({ recenterIfNeeded }), delay);
}
