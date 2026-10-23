/* Read the cost-control file before constructing a billable Mapbox GL map. */
(async function startCampusApp() {
  const disabled = { normalMap: false, satelliteMap: false };
  let flags = disabled;
  if (location.protocol === "file:") {
    flags = { normalMap: true, satelliteMap: true };
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = new URL("data/map-flags.json", document.baseURI);
      url.searchParams.set("checked", String(Date.now()));
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      if (typeof next.normalMap !== "boolean" || typeof next.satelliteMap !== "boolean") {
        throw new Error("invalid map flags");
      }
      flags = { normalMap: next.normalMap, satelliteMap: next.satelliteMap };
    } catch (error) {
      console.warn("[metaversity] map flags unavailable at startup; leaving map disabled", error);
    } finally {
      clearTimeout(timeout);
    }
  }
  window.CAMPUS_PREFLIGHT_FLAGS = flags;

  // These are classic scripts sharing module-level bindings; preserve order.
  const scripts = [
    "02-state", "03-tour-bridge", "04-street-view", "05-map-helpers",
    "06-details-panel", "07-layer-builders", "08-tourbar",
    "09-sidebar-search", "10-event-wiring", "11-boot",
    "12-start-screen", "13-learn-mode"
  ];
  try {
    for (const script of scripts) {
      await new Promise((resolve, reject) => {
        const element = document.createElement("script");
        element.src = `js/${script}.js?v=gl6`;
        element.onload = resolve;
        element.onerror = () => reject(new Error(`Could not load ${script}`));
        document.body.appendChild(element);
      });
    }
  } catch (error) {
    console.error("[metaversity] startup script failed", error);
    const splash = document.getElementById("splash");
    if (splash) splash.textContent = "The campus experience could not load. Please refresh the page.";
  }
})();
