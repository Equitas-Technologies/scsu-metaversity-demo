/* === SCSU app — GeoJSON overlays, interactions and tour pins === */
const geoCollections = [];
const interactiveLayerIds = [];
let hoveredGeoLayer = null;
let featureTooltip = null;
let overlayStyleReady = mapEnabledAtBoot && map.isStyleLoaded();

function featureBounds(feature) {
  const bounds = new CampusBounds();
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") bounds.extend([coords[1], coords[0]]);
    else coords.forEach(walk);
  };
  walk(feature?.geometry?.coordinates);
  return bounds;
}

function paintFor(style) {
  return {
    color: style.color || "#ffffff",
    weight: Number(style.weight || 1),
    fillColor: style.fillColor || style.color || "#ffffff",
    fillOpacity: Number(style.fillOpacity ?? 0.5),
    radius: Number(style.radius || 7)
  };
}

function buildLayer(data, kind) {
  const sourceId = `campus-${kind}s`;
  const layers = (data.features || []).map((feature, index) => {
    const id = index + 1;
    const original = styleFor(kind, feature);
    const bounds = featureBounds(feature);
    const layer = {
      feature,
      id,
      sourceId,
      kind: isEntranceFeature(feature) ? "entrance" : kind,
      style: original,
      getBounds: () => bounds,
      getLatLng: () => bounds.getCenter(),
      setStyle(style) {
        this.style = style;
        if (map.getSource(sourceId)) map.setFeatureState(
          { source: sourceId, id }, paintFor(style)
        );
      },
      bringToFront() {},
      openTooltip() {
        if (config.ui.permanentLabels) return;
        const name = cleanName(feature.properties?.name);
        if (!name) return;
        if (featureTooltip) featureTooltip.remove();
        const center = bounds.getCenter();
        featureTooltip = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: "campus-popup" })
          .setLngLat([center.lng, center.lat]).setText(name).addTo(map);
      },
      closeTooltip() {
        if (featureTooltip) { featureTooltip.remove(); featureTooltip = null; }
      }
    };
    return layer;
  });
  const collection = {
    sourceId, kind, layers,
    eachLayer(fn) { layers.forEach(fn); },
    getLayers() { return layers; },
    getBounds() {
      const bounds = new CampusBounds();
      layers.forEach((layer) => bounds.extend(layer.getBounds()));
      return bounds;
    },
    addTo() { installGeoLayers(); return this; }
  };
  geoCollections.push(collection);
  return collection;
}

function stateValue(key, fallback) {
  return ["coalesce", ["feature-state", key], ["get", fallback]];
}

function installGeoLayers() {
  if (!mapEnabledAtBoot || !overlayStyleReady) return;
  interactiveLayerIds.length = 0;
  for (const collection of geoCollections) {
    const { sourceId, kind, layers } = collection;
    const data = {
      type: "FeatureCollection",
      features: layers.map((layer) => ({
        ...layer.feature,
        id: layer.id,
        properties: {
          ...layer.feature.properties,
          displayName: cleanName(layer.feature.properties?.name || ""),
          ...Object.fromEntries(Object.entries(paintFor(styleFor(kind, layer.feature)))
            .map(([key, value]) => [`base${key[0].toUpperCase()}${key.slice(1)}`, value]))
        }
      }))
    };
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "geojson", data });
    const fillId = `${sourceId}-fill`;
    const lineId = `${sourceId}-line`;
    const pointId = `${sourceId}-point`;
    if (!map.getLayer(fillId)) map.addLayer({
      id: fillId, type: "fill", source: sourceId,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": stateValue("fillColor", "baseFillColor"),
        "fill-opacity": stateValue("fillOpacity", "baseFillOpacity") }
    });
    if (!map.getLayer(lineId)) map.addLayer({
      id: lineId, type: "line", source: sourceId,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "line-color": stateValue("color", "baseColor"),
        "line-width": stateValue("weight", "baseWeight") }
    });
    if (!map.getLayer(pointId)) map.addLayer({
      id: pointId, type: "circle", source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": stateValue("fillColor", "baseFillColor"),
        "circle-opacity": stateValue("fillOpacity", "baseFillOpacity"),
        "circle-radius": stateValue("radius", "baseRadius"),
        "circle-stroke-color": stateValue("color", "baseColor"),
        "circle-stroke-width": stateValue("weight", "baseWeight") }
    });
    interactiveLayerIds.push(fillId, pointId);
    if (config.ui.permanentLabels && !map.getLayer(`${sourceId}-labels`)) {
      map.addLayer({
        id: `${sourceId}-labels`, type: "symbol", source: sourceId,
        minzoom: config.ui.permanentLabelMinZoom ?? 18,
        layout: {
          "text-field": ["get", "displayName"],
          "text-size": 11,
          "text-max-width": 12,
          "text-allow-overlap": false
        },
        paint: { "text-color": "#f4f7fb", "text-halo-color": "#18202c", "text-halo-width": 1.4 }
      });
    }
    layers.forEach((layer) => layer.setStyle(layer.style));
  }
  updateCampusLabelVisibility();
}
map.on("style.load", () => {
  overlayStyleReady = true;
  installGeoLayers();
});

function updateCampusLabelVisibility() {
  const visible = !map.getContainer().classList.contains("campus-labels-off");
  for (const collection of geoCollections) {
    const id = `${collection.sourceId}-labels`;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
  // The same preference controls whether Standard should display its POIs.
  // This function may run before the boot script defining the sync helper.
  if (typeof syncMapboxPoiLabels === "function") syncMapboxPoiLabels();
}

function featureAtPoint(point) {
  if (!interactiveLayerIds.length) return null;
  const features = map.queryRenderedFeatures(point, { layers: interactiveLayerIds });
  for (const feature of features) {
    const collection = geoCollections.find((item) => item.sourceId === feature.source);
    const layer = collection?.layers[Number(feature.id) - 1];
    if (layer) return layer;
  }
  return null;
}

map.on("mousemove", (event) => {
  const layer = featureAtPoint(event.point);
  map.getCanvas().style.cursor = layer ? "pointer" : "";
  if (layer === hoveredGeoLayer) return;
  if (hoveredGeoLayer && hoveredGeoLayer !== selectedLayer) {
    hoveredGeoLayer.setStyle(styleFor(hoveredGeoLayer.kind, hoveredGeoLayer.feature));
    hoveredGeoLayer.closeTooltip();
  }
  hoveredGeoLayer = layer;
  if (layer && layer !== selectedLayer && config.ui.enableHoverPreview) {
    layer.setStyle(hoverStyleFor(layer.kind, layer.feature));
    layer.openTooltip();
  }
});
map.on("mouseleave", () => {
  map.getCanvas().style.cursor = "";
  if (hoveredGeoLayer && hoveredGeoLayer !== selectedLayer) {
    hoveredGeoLayer.setStyle(styleFor(hoveredGeoLayer.kind, hoveredGeoLayer.feature));
    hoveredGeoLayer.closeTooltip();
  }
  hoveredGeoLayer = null;
});

function buildTourPins() {
  tourStops = [];
  tourPinsLayer.forEach((marker) => marker.remove());
  tourPinsLayer = [];
  toursLayer.eachLayer((layer) => {
    const feature = layer.feature;
    const props = feature.properties || {};
    const order = Number(props.order_num);
    if (!Number.isFinite(order)) return;
    let marker = null;
    if (props.off_campus && mapEnabledAtBoot) {
      const center = layer.getBounds().getCenter();
      const wrap = document.createElement("div");
      wrap.className = "tour-pin-wrap is-offcampus";
      const pin = document.createElement("div");
      pin.className = "tour-pin is-offcampus";
      pin.dataset.order = String(order);
      pin.title = "Off-campus location — click for details";
      pin.textContent = String(order);
      const arrow = document.createElement("span");
      arrow.className = "tour-pin-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      pin.appendChild(arrow);
      wrap.appendChild(pin);
      marker = new mapboxgl.Marker({ element: wrap, anchor: "center" })
        .setLngLat([center.lng, center.lat]).addTo(map);
      tourPinsLayer.push(marker);
    }
    tourStops.push({ feature, layer, marker, order });
  });
  tourStops.sort((a, b) => a.order - b.order);
  setText(el.tourTotal, tourStops.length);
  setText(el.tourTotalMobile, tourStops.length);
  setText(el.tourCurrent, 0);
  setText(el.tourCurrentMobile, 0);
  updateTourbar();
}

function highlightActivePin() {
  document.querySelectorAll(".tour-pin.is-active").forEach((node) => node.classList.remove("is-active"));
  const stop = tourStops[tourIndex];
  stop?.marker?.getElement()?.querySelector(".tour-pin")?.classList.add("is-active");
}
