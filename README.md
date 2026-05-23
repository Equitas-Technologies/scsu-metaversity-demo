# SCSU Virtual Campus

An interactive web map of the South Carolina State University campus, pairing a 2D Leaflet map with embedded Treedis 3D street-view tours. The app supports two modes — **Explore** (walk the campus, click buildings, drop into 360° sweeps) and **Learn** (a course catalog that links classroom content to immersive VR experiences). Desktop, tablet, mobile, and WebXR headsets (Meta Quest) are all first-class targets.

---

## Features

- **Interactive Leaflet map** rendered from local tiles (zoom 15–20) over a 2023 RGB aerial of Orangeburg, SC.
- **Building & tour layers** loaded from GeoJSON, with hover previews, tooltips, and a clickable locations sidebar.
- **Treedis 3D sweeps** embedded via iframe — click a building or tour stop to drop into 360° street view at the right sweep ID.
- **Dual Treedis profiles** — separate desktop (`8e4ca3fc`) and VR (`scsu-campus-ade0f346`) models, auto-selected at boot by user-agent inspection and `navigator.xr.isSessionSupported('immersive-vr')`.
- **Off-campus tour stops** — locations physically outside the campus map (currently Olar Farm, ~20 mi southwest) can be added as tour stops via an `off_campus: true` flag. They render with an amber palette and a directional arrow rather than a building footprint, skip the map fly-to, and expose an "Open in Maps" link block so users can navigate there in their preferred map app.
- **Learn mode** — a course catalog (currently `NRM 342 Agronomy & Soils`) that pairs syllabus-style content with deep links into the immersive VR experience.
- **File:// fallback** — the app works without a server: GeoJSON is also shipped as `data/*.js` shims that assign onto `window.SCSU_DATA`, so opening the HTML directly from disk still boots.
- **Splash / progress screen, burger menu, search, and align tools** built in.

---

## Repository layout

The application code lives in three folders — `js/` (13 numbered scripts), `css/` (11 numbered stylesheets), and `data/` (geometry + per-location content) — with `map.html` and `config.js` at the root. See the *Deployment* section below for the full tree.

| File | Purpose |
|------|---------|
| `map.html` | HTML shell — splash screen, app chrome, metabar, sidebar, Leaflet container, Treedis iframe slot, details panel (including the off-campus `addressBlock`). Deploys as `index.html`. |
| `js/` | Main application, split across 13 numbered files (~3,800 lines total) that load in order via plain `<script>` tags. The split is purely organizational — every file shares the same global scope as if they were one file. See *JS file layout* below for what each file owns. |
| `config.js` | Structural settings — brand strings, tile config, map bounds, Treedis SDK plumbing, Leaflet layer styles (including off-campus variants), UI flags. Loaded *after* the data files so it can merge into `window.CAMPUS_CONFIG`. |
| `css/` | All visual styling, split across 11 numbered files (~3,500 lines total) that load in order via `<link>` tags. Order matters because of the CSS cascade — later files override earlier ones, mirroring the original single-file order. |
| `data/buildings.geojson` | Building footprint polygons (EPSG:4326). Source of truth when served over HTTP. |
| `data/tours.geojson` | Tour-stop polygons (EPSG:4326). Each feature carries `name`, `tour_group`, `order_num`, `description`, and optional `off_campus` / `off_campus_distance` properties. |
| `data/locations.js` | Per-location content — `descriptionMap`, `imageMap`, `categoryMap`, `happensHereMap`, `explorableMap`, and `addressMap` (for "Open in Maps" links). Edit this file to change copy without touching app plumbing. |
| `data/treedis-sweeps.js` | Per-location sweep IDs, split into `desktop` and `vr` profile tables. |
| `data/courses.js` | Learn-mode course catalog. |

### JS file layout

The `js/` directory holds 13 numbered files. They are plain `<script>`s (not ES modules), so every top-level `const`, `let`, and `function` is a global shared across files — the split is purely about giving each topic its own file. Loading is strictly in numeric order; see *Loading order* below for why.

| File | Purpose |
|------|---------|
| `01-utils.js` | XR / VR detection, Treedis profile selection, EPSG:3857 → 4326 reprojection, name/category/description/image/explorable/address lookup helpers, `escapeHTML`. |
| `02-state.js` | Creates the Leaflet `map` and its panes, the `el` object of DOM references, the `mqMobile` media query, `isMobile()`, `styleFor()` / `hoverStyleFor()` / `selectedStyleFor()` / `isOffCampusFeature()`, and every module-level `let` of mutable state (selected layer, tour stops, drawer mode, align state, etc.). |
| `03-tour-bridge.js` | `TourBridge` — the `postMessage` wrapper around the Treedis iframe. Handles Ping / Navigate / RequestSweeps outbound and TourReady / PoseChanged / SweepsChanged / Tag* events inbound. |
| `04-street-view.js` | `openStreetView()` / `closeStreetView()`, the loading-veil escalation timers (8s → "slow connection" copy, 25s → Cancel button), pending-sweep queueing while Treedis is still booting, and `navigateStreetViewToLayer()` / `openSubLocationInStreetView()`. |
| `05-map-helpers.js` | `refreshMapConstraints()`, `getCampusCoverZoom()`, `getCampusOffsetCenter()`, `resetCampusView()`, `scheduleMapRefresh()`. |
| `06-details-panel.js` | `renderDetails()` and its sub-renderers (`renderHappensHere`, `renderImage`, `renderExplorable`, `renderAddress`), plus `selectFeature()` / `clearSelection()` and the open/close/mode switching for the right-side panel. `selectFeature()` skips the map fly-to for `off_campus` features so the user stays oriented on campus. |
| `07-layer-builders.js` | `bindEvents()`, `buildLayer()`, `computeImageBounds()`, `buildTourPins()` (with off-campus pin variant), `highlightActivePin()`. |
| `08-tourbar.js` | `updateTourbar()` (adds an ↗ glyph + amber tint when the active stop is off-campus), `goToStop()`, `tourPrevAction()`, `tourNextAction()` — shared between the desktop sidebar footer and the mobile tour bar. |
| `09-sidebar-search.js` | Desktop locations list (with off-campus distance badge), "All buildings" tab, mobile drawer, mobile details drag/slide, mobile search toggle, and the search input + results renderer. This is the first file with top-level event bindings — it requires `el` and `mqMobile` from `02`. |
| `10-event-wiring.js` | Most remaining event listeners: explore CTA, VR button, tour-arrow buttons, fullscreen, help, etc., plus the dev-only image-alignment tool UI (the `alignUI` object, `nudge()`, `scaleBy()`, copy/save handlers). |
| `11-boot.js` | `loadAllData()`, the `preloadImage` / `waitForTreedisReady` / `warmHomeSweep` / `preloadAllAssets` helpers, the `addBaseTileLayer()` helper, and the `boot()` function that wires everything together at startup. |
| `12-start-screen.js` | First-run welcome modal, the 3-step coachmark walkthrough, the "Don't show again" preference plumbing, the navigation-instructions modal, and the burger-panel Settings reset. Ends with `boot().catch(...)` — this is what actually kicks the app off. |
| `13-learn-mode.js` | Self-contained IIFE for the Learn-mode course catalog (list + detail view). Reads `window.SCSU_DATA.courses` and degrades gracefully if `data/courses.js` is missing. |

### CSS file layout

The `css/` directory holds 11 numbered files, loaded in order via `<link>` tags. CSS has no scope, only the cascade — later rules override earlier ones — so order matters and matches the original single-file order.

| File | Purpose |
|------|---------|
| `01-base.css` | CSS custom properties (palette, typography, structural sizes), splash / title screen, top-level app grid. |
| `02-header.css` | Metabar (top header), Explore / Learn mode-toggle pill, burger slide-in panel. |
| `03-sidebar.css` | `.shell` layout, locations sidebar (dark theme), list rows, category headers, off-campus row badge & accents. |
| `04-map-details.css` | Map area, right-side details panel (chips, sub-list, explore CTA, address block, off-campus notice), persistent button bar, tour-arrow buttons, bottom tourbar. |
| `05-leaflet-responsive.css` | Leaflet overrides (including the `.tour-pin.is-offcampus` pill pin), desktop breakpoints, and the full mobile (≤ 880px) layout. |
| `06-align-tool.css` | Image-alignment dev tool (kept as-is; only used when `mapMode !== "tiles"`). |
| `07-streetview-xr.css` | Treedis street-view overlay and XR / VR mode rules (street view takes over the details column on Quest). |
| `08-start-coachmark.css` | First-run start screen, coachmark spotlight + card system, "Don't show again" checkbox styling. |
| `09-burger-settings.css` | Burger panel — Settings group and toggle-switch styling. |
| `10-nav-instructions.css` | 3D street-view onboarding modal. |
| `11-learn-mode.css` | Learn-mode course catalog — list, detail view, action bar, all responsive variants. |

### Loading order

The HTML loads stylesheets and scripts in this order, which matters for both reasons:

- **CSS** — later files override earlier ones via the cascade, so the `css/01..11` order mirrors the original single-file order.
- **JS** — the data files seed `window.CAMPUS_CONFIG` / `window.SCSU_DATA`, `config.js` merges into them, and then the 13 numbered `js/` files load in order. Because they're plain `<script>` tags (not modules), every file shares the same global script scope; each one can call functions and read state defined by any earlier-loaded file.

```
leaflet.css  →  css/01-base.css → … → css/11-learn-mode.css

leaflet.js  →  data/buildings.js, data/tours.js, data/courses.js,
              data/locations.js, data/treedis-sweeps.js
           →  config.js
           →  js/01-utils.js → js/02-state.js → … → js/13-learn-mode.js
```

The `js/01..13` numeric order is not cosmetic — it encodes the dependency chain. For example, `js/09-sidebar-search.js` has top-level `el.locationsToggle.addEventListener(...)` calls; those require `el` from `js/02-state.js` to already exist at parse time. Renumbering or reordering the script tags will break the page.

---

## Data flow

1. **At module load** `js/01-utils.js` inspects the user agent for `OculusBrowser`, `Quest`, or `VR` tokens and tentatively picks a Treedis profile.
2. **At boot** `js/11-boot.js` confirms with `navigator.xr.isSessionSupported('immersive-vr')` and upgrades to the VR profile if WebXR is available. `config.treedis.modelId` and `config.treedis.tourUrl` are rewritten to the active profile; the legacy `treedisMap` alias is repointed to the matching sweep table.
3. **Geometry** is loaded by `fetch()` from `data/buildings.geojson` and `data/tours.geojson`. If `fetch` fails (e.g. `file://` origin), the app falls back to `window.SCSU_DATA.buildings` / `.tours` populated by `data/buildings.js` and `data/tours.js`.
4. **Per-location overrides** — when a feature is selected, the app looks up its `name` (case-insensitively) in `descriptionMap`, `imageMap`, `categoryMap`, `addressMap`, etc. to render the details panel.
5. **3D drop-in** — selecting a location resolves its sweep ID in the active-profile `treedisMaps` and posts a message into the Treedis iframe to move to that sweep. For `off_campus` features the map does NOT fly to the feature; instead it animates back to the full campus view (so the user sees the directional arrow in context), and the user navigates via the Explore button or the address block.

---

## Configuration

All structural settings live in `config.js`. Common edits:

- **Map view** — `tiles.initialCenter`, `tiles.initialZoom`, `tiles.bounds`, `tiles.minZoom` / `maxZoom`.
- **Tile path** — `tiles.url` (default `assets/tiles/{z}/{x}/{y}.png`). Tiles are expected pre-rendered (the comment notes they came from QGIS).
- **Treedis models** — `treedis.profiles.desktop` and `treedis.profiles.vr`. The `origin` (`https://spaces.dtsxr.com`) is shared by both and used for `postMessage` safety.
- **Layer colors** — `styles.buildings`, `styles.tours`, plus `*Hover` and `selected` variants. Off-campus tour stops use the separate `styles.toursOffCampus` / `toursOffCampusHover` / `selectedOffCampus` palette.

Per-location *content* (descriptions, images, sweep IDs, course catalog, addresses) lives in the `data/*.js` files so non-technical editors can change copy without touching app plumbing.

### Adding an off-campus tour stop

Off-campus stops let the tour include a location whose real coordinates are too far away to render on the campus tile map. The on-map polygon becomes a small directional indicator (e.g. an arrow pointing along the highway toward the real site).

To add one:

1. **In QGIS**, draw a small placeholder polygon *inside* the configured campus `tiles.bounds` rectangle — typically an arrow shape near the edge of campus, pointing toward the real-world site.
2. **Set the feature's properties** in the attribute table:
   - `name` — the location's real name (e.g. `Olar Farm`)
   - `tour_group` — usually `mainTour`
   - `order_num` — where in the tour sequence this stop sits
   - `description` — a brief description (can be overridden in `locations.js`)
   - `off_campus` — `true`
   - `off_campus_distance` — optional string shown in the UI badge (e.g. `20 mi from campus`)
3. **Export** as GeoJSON to `data/tours.geojson` (CRS84 / EPSG:4326).
4. **Add content overrides** in `data/locations.js`: a category in `categoryMap`, description in `descriptionMap`, optional chips in `happensHereMap`, an entry in `addressMap` for the "Open in Maps" links, and an image in `imageMap`.
5. **Add the Treedis sweep ID** in `data/treedis-sweeps.js` for both the `desktop` and `vr` profiles.

The off-campus visual treatment (amber polygon, pill-shaped pin with ↗ arrow, "OFF-CAMPUS STOP" details-panel tag, distance badge in the sidebar, "Open in Maps" links in the address block) all kicks in automatically based on the `off_campus` property — no code changes required for new off-campus stops.

---

## Deployment

The repo layout matches the deployed layout (the entry point is conventionally renamed `index.html`). Lay it out like this on the server:

```
/
├── index.html              ← rename of map.html
├── config.js
├── js/
│   ├── 01-utils.js
│   ├── 02-state.js
│   ├── 03-tour-bridge.js
│   ├── 04-street-view.js
│   ├── 05-map-helpers.js
│   ├── 06-details-panel.js
│   ├── 07-layer-builders.js
│   ├── 08-tourbar.js
│   ├── 09-sidebar-search.js
│   ├── 10-event-wiring.js
│   ├── 11-boot.js
│   ├── 12-start-screen.js
│   └── 13-learn-mode.js
├── css/
│   ├── 01-base.css
│   ├── 02-header.css
│   ├── 03-sidebar.css
│   ├── 04-map-details.css
│   ├── 05-leaflet-responsive.css
│   ├── 06-align-tool.css
│   ├── 07-streetview-xr.css
│   ├── 08-start-coachmark.css
│   ├── 09-burger-settings.css
│   ├── 10-nav-instructions.css
│   └── 11-learn-mode.css
├── assets/
│   ├── tiles/…/{z}/{x}/{y}.png…
│   ├── Icons/…
│   ├── Locations/…
│   └── courses/…
└── data/
    ├── buildings.geojson
    ├── tours.geojson
    ├── courses.js
    ├── locations.js
    └── treedis-sweeps.js
```

Any static host (GitHub Pages, Netlify, Cloudflare Pages, S3 + CloudFront, plain nginx) works. Total wire size is roughly the same as before — the split adds ~1 KB of header comments and ~1 KB of HTTP overhead per extra file, which is negligible against the ~140 KB of JS and ~100 KB of CSS being served.

---

## Tech stack

- **Leaflet 1.9.4** (CDN) — base map and vector layers.
- **Treedis SDK** — 3D street-view tours, embedded as an iframe at `https://spaces.dtsxr.com`.
- **WebXR Device API** — VR-profile detection.
- **Vanilla JS + CSS** — no framework, no build pipeline.
- **Fonts** — JetBrains Mono, Inter, EB Garamond (Google Fonts), with a self-hosted Minion Pro / Minion 3 slot via `--serif` in `css/01-base.css`.

---

## Browser support

- Modern Chromium, Firefox, and Safari on desktop and mobile.
- Meta Quest Browser (Quest 2 / 3 / Pro) — auto-routed to the VR Treedis model.

---

## Credits

- Developed by [sroberto27](https://sroberto27.github.io/)
- Campus imagery: SC_2023_RGB WMTS.
- © South Carolina State University.
