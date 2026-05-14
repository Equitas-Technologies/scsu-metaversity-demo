# SCSU Virtual Campus

An interactive web map of the South Carolina State University campus, pairing a 2D Leaflet map with embedded Treedis 3D street-view tours. The app supports two modes — **Explore** (walk the campus, click buildings, drop into 360° sweeps) and **Learn** (a course catalog that links classroom content to immersive VR experiences). Desktop, tablet, mobile, and WebXR headsets (Meta Quest) are all first-class targets.

\---

## Features

* **Interactive Leaflet map** rendered from local tiles (zoom 15–20) over a 2023 RGB aerial of Orangeburg, SC.
* **Building \& tour layers** loaded from GeoJSON, with hover previews, tooltips, and a clickable locations sidebar.
* **Treedis 3D sweeps** embedded via iframe — click a building or tour stop to drop into 360° street view at the right sweep ID.
* **Dual Treedis profiles** — separate desktop (`8e4ca3fc`) and VR (`scsu-campus-ade0f346`) models, auto-selected at boot by user-agent inspection and `navigator.xr.isSessionSupported('immersive-vr')`.
* **Learn mode** — a course catalog (currently `NRM 342 Agronomy \\\& Soils`) that pairs syllabus-style content with deep links into the immersive VR experience.
* **File:// fallback** — the app works without a server: GeoJSON is also shipped as `data/\\\*.js` shims that assign onto `window.SCSU\\\_DATA`, so opening the HTML directly from disk still boots.
* **Splash / progress screen, burger menu, search, and align tools** built in.

\---

## Repository layout

The repo is flat, but the app expects the data files under `data/` and the entry point named `index.html` when deployed. See the *Deployment* section below.

|File|Purpose|
|-|-|
|`map.html`|HTML shell — splash screen, app chrome, metabar, sidebar, Leaflet container, Treedis iframe slot. Deploys as `index.html`.|
|`app.js`|Main application (\~3,800 lines). Boots the map, wires sidebar interactions, manages Treedis postMessage bridging, handles XR detection, runs the Learn-mode UI.|
|`config.js`|Structural settings — brand strings, tile config, map bounds, Treedis SDK plumbing, Leaflet layer styles, UI flags. Loaded *after* the data files so it can merge into `window.CAMPUS\\\_CONFIG`.|
|`mapstyles.css`|All visual styling.|
|`buildings.geojson`|Building footprint polygons (EPSG:4326). Source of truth when served over HTTP.|
|`tours.geojson`|Tour-stop polygons (EPSG:4326).|
|`locations.js`|Per-location content — `descriptionMap`, `imageMap`, `categoryMap`, `happensHereMap`, `explorableMap`. Edit this file to change copy without touching app plumbing.|
|`treedis-sweeps.js`|Per-location sweep IDs, split into `desktop` and `vr` profile tables.|
|`courses.js`|Learn-mode course catalog.|

### Loading order

The HTML loads scripts in this order, which matters because the data files seed `window.CAMPUS\\\_CONFIG` / `window.SCSU\\\_DATA` before `config.js` merges into them and `app.js` reads the result:

```
leaflet.js  →  data/buildings.js, data/tours.js, data/courses.js,
              data/locations.js, data/treedis-sweeps.js
           →  config.js
           →  app.js
```

\---

## Data flow

1. **At module load** `app.js` inspects the user agent for `OculusBrowser`, `Quest`, or `VR` tokens and tentatively picks a Treedis profile.
2. **At boot** it confirms with `navigator.xr.isSessionSupported('immersive-vr')` and upgrades to the VR profile if WebXR is available. `config.treedis.modelId` and `config.treedis.tourUrl` are rewritten to the active profile; the legacy `treedisMap` alias is repointed to the matching sweep table.
3. **Geometry** is loaded by `fetch()` from `data/buildings.geojson` and `data/tours.geojson`. If `fetch` fails (e.g. `file://` origin), the app falls back to `window.SCSU\\\_DATA.buildings` / `.tours` populated by `data/buildings.js` and `data/tours.js`.
4. **Per-location overrides** — when a feature is selected, the app looks up its `name` (case-insensitively) in `descriptionMap`, `imageMap`, `categoryMap`, etc. to render the details panel.
5. **3D drop-in** — selecting a location resolves its sweep ID in the active-profile `treedisMaps` and posts a message into the Treedis iframe to move to that sweep.

\---

## Configuration

All structural settings live in `config.js`. Common edits:

* **Map view** — `tiles.initialCenter`, `tiles.initialZoom`, `tiles.bounds`, `tiles.minZoom` / `maxZoom`.
* **Tile path** — `tiles.url` (default `assets/tiles/{z}/{x}/{y}.png`). Tiles are expected pre-rendered (the comment notes they came from QGIS).
* **Treedis models** — `treedis.profiles.desktop` and `treedis.profiles.vr`. The `origin` (`https://spaces.dtsxr.com`) is shared by both and used for `postMessage` safety.
* **Layer colors** — `styles.buildings`, `styles.tours`, plus `\\\*Hover` and `selected` variants.

Per-location *content* (descriptions, images, sweep IDs, course catalog) lives in the `data/\\\*.js` files so non-technical editors can change copy without touching app plumbing.

\---

## Deployment

The repo is flat for ease of editing, but the HTML references everything under `data/` and the entry point is conventionally `index.html`. Lay it out like this on the server:

```
/
├── index.html              ← rename of map.html
├── app.js
├── config.js
├── mapstyles.css
├── assets/
│   ├── tiles/#.../{z}/{x}/{y}.png...
│   └── Icons/…
│   └── Locations/…
│   └── courses/…
└── data/
    ├── buildings.geojson
    ├── tours.geojson
    ├── courses.js
    ├── locations.js
    └── treedis-sweeps.js
```

Any static host (GitHub Pages, Netlify, Cloudflare Pages, S3 + CloudFront, plain nginx) works.

\---

## Tech stack

* **Leaflet 1.9.4** (CDN) — base map and vector layers.
* **Treedis SDK** — 3D street-view tours, embedded as an iframe at `https://spaces.dtsxr.com`.
* **WebXR Device API** — VR-profile detection.
* **Vanilla JS + CSS** — no framework, no build pipeline.
* **Fonts** — JetBrains Mono, Inter, EB Garamond (Google Fonts), with a self-hosted Minion Pro / Minion 3 slot via `--serif` in `mapstyles.css`.

\---

## Browser support

* Modern Chromium, Firefox, and Safari on desktop and mobile.
* Meta Quest Browser (Quest 2 / 3 / Pro) — auto-routed to the VR Treedis model.


\---

## Credits

* Developed by [sroberto27](https://sroberto27.github.io/)
* Campus imagery: SC\_2023\_RGB WMTS.
* © South Carolina State University.
