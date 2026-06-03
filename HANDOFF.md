# Session Hand-off — SCSU Virtual Campus

_Last updated: 2026-06-03_

This document brings a fresh Claude Code session up to speed on the **SCSU Virtual
Campus** app after a long working session. Read `README.md` first for the full
architecture; this file covers **how to work here**, **what recently changed**, and
**gotchas worth knowing before you touch the map layer**.

---

## 1. What this is (1-paragraph version)

An interactive web map of South Carolina State University: a 2D Leaflet map paired
with embedded Treedis 360° tours, with **Explore** and **Learn** modes. Plain
`<script>`/`<link>` files — **no build step, no bundler, no framework**. The `js/`
files (`00`–`13`) load in numeric order and **share one global scope** (a top-level
`const`/`function` in `01` is visible in `11`). Same idea for `css/` (`01`–`11`),
where load order = cascade order. `map.html` is the shell; `config.js` holds tunable
settings. See `README.md` for the per-file breakdown.

---

## 2. How to work here (read this before editing)

- **This IS a git repo, but commit/push happens in GitHub Desktop — not the CLI.**
  A CLI `git push` fails (`could not read Username for https://github.com` — no
  stored creds). Make edits; the user commits & pushes them in GitHub Desktop. Do
  **not** run `git commit`/`git push` yourself unless asked, and never assume you can
  push. (You may run read-only git: `status`, `log`, `diff`.)
- **Working tree is currently clean** and in sync with `origin/main`
  (HEAD = `47fc252 Updated satellite map tile source`). All session work below is
  committed.
- **Editing data/labels — JSON is now canonical.** Per-location copy
  (descriptions, images, categories, departments, addresses, links) lives in
  **`data/locations.json`** (likewise `treedis-sweeps.json`, `courses.json`).
  At boot, **`js/00-data-adapter.js`** fetches the JSON and flattens it into the
  legacy `descriptionMap` / `imageMap` / … maps the app reads. The `data/*.js`
  files (`locations.js`, etc.) are now **`file://` fallback shims** — they seed
  the same maps at parse time so disk loads work, but **the JSON overwrites them
  over http/https, so edits to the `.js` are ignored in production.** Edit the
  **`.json`**; keep the `.js` shim in sync (or regenerate it). Building/tour
  *geometry* + `name` still come from `data/*.geojson` (no `.js` shim for those —
  edit the geojson directly). `data/Originalbuildings.geojson` and
  `data/Originlocations.js` are **backups — leave them alone.**
  - **Regenerate the shims, never hand-edit them:** edit the `.json`, then run
    `node scripts/extract.js` (and `--check` to verify). The generator loads the
    real adapter and runs its exact JSON→maps transform, so the shims it writes
    can't drift from production; it self-verifies before writing. See section 4.
  - One subtlety: the adapter only rebuilds the maps it knows about. A *new*
    content type needs two edits — a `locations.json` document field and a line
    in `applyLocationsJSON()` (`00-data-adapter.js`) — then `extract.js` flows it
    into the shim automatically (it reuses the adapter). `linksMap` (external
    links) was wired this way — see below.
- **No automated tests / no run command was used this session.** Verification has
  been "user reloads in the browser (served via Local by Flywheel) and eyeballs it."
  When changing the map, expect to ask the user to **hard-refresh** (Cmd+Shift+R) —
  normal refresh re-runs cached `map.html`/JS and hides your changes.

---

## 3. What changed this session (most recent first)

All committed. Grouped by area with file references.

### 2026-06-03 batch (cosmetic + content)

**SCSU logo on the map + removed the "fullscreen" icon.** Bottom-right map corner:
- Removed `#fitBtn` (the four-corners fit-to-view button — read as "fullscreen",
  client called it redundant). Also removed its now-dangling JS refs:
  `el.fitBtn.addEventListener` in `js/10-event-wiring.js` (was **unguarded** — would
  null-throw and break all wiring below it) and the `el.fitBtn` lookup in `js/02-state.js`.
- Added a bare transparent-PNG logo `<img class="map-logo" src="assets/Icons/logo.png">`
  (`map.html`), **44×44**, sitting on the map with no frame (per branding). CSS in
  `css/04-map-details.css` (+ mobile in `05-leaflet-responsive.css`); added `.map-logo` to
  the `.map-action` hide rules in `07-streetview-xr.css` / `11-learn-mode.css`. Satellite
  toggle nudged up (`bottom: 80px` desktop / `74px` mobile) to sit centered above the logo.

**Removed the numbered circles on the 5 tour-stop buildings (client request).**
`js/07-layer-builders.js` `buildTourPins()`: on-campus stops no longer build a pin marker
(`marker = null`); **only off-campus stops keep a pin** (the amber ↗ arrow). `highlightActivePin()`
guarded against null markers. Tour nav still works (it uses feature/layer, not pins). The
old non-offcampus `.tour-pin` CSS is now unused but left in place.

**SCSU Bookstore link on the Crawford-Zimmerman panel.** New `linksMap` content type, wired
end-to-end: `links` array in the `crawford-zimmerman building` doc in `data/locations.json`
(+ matching `linksMap` in the `locations.js` shim), a `links` line in `applyLocationsJSON()`
(`00-data-adapter.js`), `getLinks()` in `01-utils.js`, `el.linksBlock`/`el.detailsLinks` in
`02-state.js`, `#linksBlock` at the bottom of `.details-extra` in `map.html`, `renderLinks()`
in `06-details-panel.js` (book glyph + label + trailing "opens in new tab" ↗ glyph), and
`.details-link*` styles in `04-map-details.css`. Renders only for locations that have `links`.

**Added the shim generator `scripts/extract.js` (JSON → `data/*.js`).** The `.js` data
files were already documented as regenerated by this script, but it didn't exist — sync was
manual. The new script loads `js/00-data-adapter.js` in a Node `vm` and runs its real
`apply*JSON()` transform, then serializes the result into the shims, so the shims **cannot
drift** from what the app produces over http. It self-verifies (reloads its own output,
deep-compares) before writing; `--check` validates the on-disk shims without writing
(CI/pre-commit friendly). Running it regenerated all three shims (one-time reformat:
`locations.js` 1100→657 lines; the old hand-authored section comments + the rich
`treedis-sweeps.js` header docs are gone — see flagged item in §5).

**Fixed pre-existing `departmentMap` drift.** `extract.js --check` surfaced that the
`locations.js` shim and `locations.json` disagreed on department labels for ~13 locations
(the shim held stale pre-JSON values; production already served the JSON). Resolution: trust
the JSON (the versioned source), regenerate the shim to match. Also deduped one real JSON
bug — Oliver C. Dawson Stadium was `["Athletics","Athletics"]` → `["Athletics"]`. NOT done:
resurrecting the shim's older, more-specific labels (e.g. "Athletics – Football/Soccer") into
the JSON — that's a deliberate content call for the SCSU team if they want it.

### Earlier batch

**Satellite-view toggle (on-map button).** New `.map-action` button `#satelliteBtn`
(globe icon) stacked above the fit-to-view button, bottom-right of the map.
- `js/11-boot.js`: `getSatelliteLayer()` (lazy raster `L.tileLayer` in `imagePane`,
  added **on top** of the vector base so its opaque tiles cover it) + `setSatelliteView(on)`
  (toggles the layer, the button's `.is-active`/`aria-pressed`, and a `.satellite-mode`
  class on the map container as a styling hook). `js/10-event-wiring.js` wires the click.
- `config.js` `tiles`: `satelliteUrl` + `satelliteAttribution` (+ optional `satelliteBounds`).
  **Source is now Stadia Alidade Satellite** (global; uses the shared Stadia `api_key`).
  The local 2023 aerial (`assets/tiles/{z}/{x}/{y}.png`, ~514 MB, zoom 15–20) is kept as a
  **commented fallback** — uncomment those lines + set `satelliteBounds: true` to use it.
  `satelliteBounds` clips the layer to the campus rectangle (right for the local aerial;
  left **off** for the global Stadia source so it fills the viewport).
- **Not persisted** — resets to map view on reload (by design, for now).

**Building-labels toggle (burger menu).** New switch `#burgerShowBuildingLabels` at the
top of the Settings group. Unlike the other two burger switches (which apply on next
load), this one applies **live**: it toggles `.campus-labels-off` on the map container.
- `js/12-start-screen.js`: pref key `scsu:showBuildingLabels` (default on),
  `applyBuildingLabelsPref()`, wired into `syncPrefControls()` + a change listener.
- `css/05-leaflet-responsive.css`: `.campus-labels-off .campus-label-permanent {display:none}`
  — independent of the zoom-gate `.campus-labels-hidden`; either class hides labels.

**Layer color semantics: blue = tour stop, green = selected.** `config.js` `styles`:
- `tours`/`toursHover` recolored green → **blue** (`#BFDBFE`/`#93C5FD` fill, `#60A5FA`/`#3B82F6`
  stroke) with a subtle darker-blue border (was black `#111111`).
- `selected` border softened black → **subtle darker green** `#4ADE80` (fill unchanged `#86EFAC`).
- Net effect: a tour stop is **blue at rest** and **turns green when selected** (selection uses
  the shared `selected` style via `selectedStyleFor`). Off-campus stops keep amber; tour **pins**
  stay red (`--brand-red`).

**Brand text restructure (top-left header).** `map.html`: the single `.brand-product` span is
now two independently-styleable lines inside `.brand-text` — `.brand-university` (serif/Minion,
"South Carolina State University") above `.brand-product`. `css/02-header.css` has `.brand-text`
(flex column), `.brand-university` (uses `var(--serif)`), and `.brand-product` (nudged down with
`margin-top`). NOTE: the user has since edited the exact sizes/weights/colors and the product
string — treat those values as theirs, don't normalize them.

### Map basemap → Stadia **Outdoors vector** via MapLibre GL
The big one. We iterated through raster styles (local tiles → Alidade Smooth →
Outdoors → Stamen Terrain Background) and learned **raster labels can't be removed
selectively** (they're baked into the tile bitmaps). Final solution = vector:
- `map.html`: added MapLibre GL CSS + JS + the `maplibre-gl-leaflet` plugin
  (`L.maplibreGL`) from unpkg, **after** `leaflet.js`, **before** the app scripts.
- `config.js` (`tiles` block): `vectorStyleUrl` (Stadia Outdoors style JSON, with
  `api_key`), `hideLabelSourceLayers: ["poi"]`, a raster `url` kept as graceful
  fallback, and `attribution` = "© Stadia Maps © OpenMapTiles © OpenStreetMap
  contributors".
- `js/11-boot.js` `addBaseTileLayer()`: builds the GL layer in pane `imagePane`
  (below buildings/tours/pins) and **hides only the `poi` symbol layers** so
  building/POI names disappear while streets + place names stay for orientation.

### Permanent building labels + zoom gate
- `config.js` `ui`: `permanentLabels: true`, `permanentLabelMinZoom: 18`.
- `js/07-layer-builders.js` `bindEvents()`: binds tooltips as `permanent` (centered),
  and skips the hover open/close logic when permanent.
- `js/11-boot.js`: a `zoomend` listener toggles `.campus-labels-hidden` on the map
  container below the min-zoom; `css/05-leaflet-responsive.css` has the
  `.campus-label-permanent` style (translucent, `#777777` text, no arrow,
  `pointer-events:none`) and the zoom-gate hide rule.

### Building footprint styling
- `config.js` `styles`: building stroke softened to `#AEBAC8` (default) / `#828FA3`
  (hover) — "a shade darker than the fill". `selected` + tour styles left bold/green.
- `css/04-map-details.css`: removed the browser's blue focus rectangle on clicked
  vectors (`.leaflet-interactive:focus { outline:none }`, keeping a `:focus-visible`
  ring for keyboard users).

### Tour-stop / building **de-duplication**
The 5 on-campus tour stops (Crawford-Zimmerman, Nance Hall, SHM Memorial Square,
Oliver C. Dawson Stadium, Kirkland W. Green Student Center) had **identical
footprints in both `buildings.geojson` and `tours.geojson`** → double vectors + double
labels. Fix:
- `js/11-boot.js` `boot()`: filters those footprints out of the buildings **map
  layer** (matched by name against tour-stop names).
- `js/09-sidebar-search.js` `renderAllLocationsList()`: re-adds them to the **All**
  list sourced from the tour layer (rows now carry a `kind`; tour rows select with
  `kind:"tour"`). So they stay listed and searchable, drawn once.

### Data hygiene
- `data/buildings.geojson`: normalized 3 parking-name spelling variants to the
  canonical `Faculty / Staff Parking` (now 22 consistent entries).

### Learn mode + sidebar tweaks (earlier in session)
- Learn course-detail template (`map.html` + `css/11-learn-mode.css`): single
  capped-width reading column (`max-width:1100px`), image in-flow under the intro,
  full-width image when `.has-image` (panel framing removed), curriculum stacked
  below overview. Learn sidebar header now mirrors Explore ("IMMERSIVE LEARNING" +
  serif "Available Courses").
- Sidebar **ALL** tab: removed the per-row category line and the
  "N locations to explore." count (FEATURED keeps both).
- Coachmark step 2 ("Experience Toggle"): now targets `.mode-toggle-header` (the
  Explore/Learn pill) instead of the full `.metabar`.
- Map "Open in Maps" address links (`js/06-details-panel.js`): emoji icons removed.

---

## 4. Gotchas & learnings (save yourself the debugging)

- **MapLibre label hiding is timing-sensitive.** `L.maplibreGL(...).getMaplibreMap()`
  returns **null right after `.addTo(map)`** — the plugin's `onAdd` (which creates the
  GL map) is **deferred by Leaflet until the map has a view** (`setView`), and in
  `boot()` the layer is added before the view is set. So label-hiding is wired on the
  Leaflet layer's **`add` event**, then on the GL map's `load`/`styledata`. There's a
  visibility guard so `setLayoutProperty` → `styledata` doesn't infinite-loop.
- **The redundant building names came from the `poi` source-layer** of the Stadia
  Outdoors style. Confirmed by fetching the style JSON and listing symbol layers.
  Street names = `transportation_name`, place names = `place` (both kept). If more
  labels need hiding later, add their source-layer to `hideLabelSourceLayers`.
- **Raster basemaps = all-or-nothing labels.** Don't try to CSS/JS away basemap
  labels on a raster style; switch styles or go vector.
- **Vector removes the high-zoom tile worry** (it scales to any zoom); the
  `maxNativeZoom: 20` concern from the raster era no longer applies.
- **Panes / z-index** (in `js/02-state.js`): imagePane 200 (basemap) <
  buildingsPane 420 < toursPane 430 < pinsPane 500. Tours draw above buildings —
  which is *why* the duplicate footprints showed as green-over-gray.
- **Translucent vector fills composite with the basemap beneath them.** The tour fill
  is only `fillOpacity: 0.35`, so the color you SEE = blend of the fill + whatever the
  basemap draws under it. This surfaced as a "bug": **SHM Memorial Square looked green
  while the other (blue) tour stops looked blue.** It's not a data bug — SHM is the only
  tour stop sitting over **green parkland** on the Outdoors basemap (it's a landscaped
  square), so 35% blue over green reads green; the others sit over gray buildings/pavement.
  Verified the dedup correctly removes SHM's building copy and there's no stray green vector.
  If uniform fills are ever wanted, raise `tours.fillOpacity` (~0.55) so blue dominates.
- **Selecting a tour stop turns it green**, because `selectedStyleFor()` returns the shared
  `selected` (green) style for both buildings and on-campus tours. Intended: blue = at rest,
  green = selected. There is no separate `selectedTour` style.
- **Satellite layer sits in `imagePane` on top of the vector base** (added later = higher
  within the pane). Buildings/tours/pins panes are above it regardless. Don't remove/re-add
  the MapLibre GL vector layer to switch — just add/remove the satellite layer over it
  (avoids re-running the label-hiding wiring).
- **Changes have been lost once** earlier when the repo was first initialized
  (uncommitted edits wiped by a checkout). Encourage committing in GitHub Desktop
  after meaningful batches.

---

## 5. Open / flagged items (not done — user's call)

- **"Moss Hall" ×2 in `buildings.geojson`** — two features at *different* locations
  (~150m apart) sharing a name. Not a geometry duplicate (left as-is); flag if it
  turns out one is a mislabel.
- **Stadia attribution as plain text.** Stadia's guidelines technically want the
  credits as clickable links; currently plain text. Offer to wrap in anchors if
  compliance matters.
- **MapLibre GL is now a real dependency** (~hundreds of KB, WebGL). Fine for modern
  browsers + Quest; just be aware of the footprint.
- **Permanent-label clutter / overlap.** Leaflet has no label collision detection;
  the zoom gate (z18+) is the current mitigation. If overlap is reported, consider a
  higher threshold or tours-only labels.
- **Satellite source = Stadia (quota) vs local aerial (free).** Now on Stadia Alidade
  Satellite, which counts against the API plan and loads over the network. The local 2023
  aerial is kept commented in `config.js` and may be **sharper over campus** at z19–20 —
  worth an A/B if data usage or fidelity matters.
- **Footprint/label contrast over satellite imagery.** Building strokes (`#AEBAC8`) and the
  translucent `#777` labels were tuned for the *light* Outdoors basemap and may read faint
  over darker imagery. The `.satellite-mode` container class exists as a hook but has **no
  CSS yet** — add contrast rules there if needed.
- **Minion may not be self-hosted.** `.brand-university` uses `var(--serif)` (Minion stack);
  if no `@font-face` for Minion is wired up it falls back to EB Garamond/Georgia. Confirm /
  add the font if true-Minion rendering is required.
- **Shim header docs were relocated to `data/README.md`** (DONE). Regenerating the shims
  discarded their rich hand-authored headers — the `locations.js` content provenance +
  feature-mapping quirks (Turner Hall → 3 wings, Queens Village → 7, the Davis Hall #7-vs-#23
  ambiguity), the `treedis-sweeps.js` profile/`parentName`/`rotation` (pitch=x, yaw=y)
  semantics, and the `courses.js` entry shape. All recovered from git HEAD and consolidated
  into `data/README.md` (safe from `extract.js`, unlike the shims).
- **`extract.js` sync is manual by design — no git hook.** Decided *against* a pre-commit
  hook: git hooks live in `.git/hooks` (not version-controlled), so one wouldn't propagate to
  other clones, and it cuts against the repo's no-tooling / GitHub-Desktop workflow. The
  contract is: edit JSON → `node scripts/extract.js` → commit both. If CI is ever added,
  `extract.js --check` is the enforcement hook (exits non-zero on stale shims).

---

## 6. Quick verification checklist (after any map change)

1. Hard-refresh the browser (Cmd+Shift+R).
2. Explore mode: basemap = Outdoors look, **no business/POI labels on buildings**,
   street names present. Building outlines subtle (not black). No blue box on click.
3. Zoom out past ~17 → permanent labels disappear; zoom in → they return. The burger
   **"Show building labels"** switch hides/shows them live.
4. The 5 tour stops render **once**, **blue** at rest, and turn **green when selected**;
   they still appear in the sidebar **All** list and in search.
5. Satellite button (bottom-right, above fit-to-view) swaps to imagery and back; button
   shows an active (dark) state when on.
6. Learn mode: single centered column, image under the intro, curriculum below
   overview.
