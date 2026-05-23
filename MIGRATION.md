# SCSU Virtual Campus — File split migration

This refactor splits the monolithic `app.js` (3,882 lines) and `mapstyles.css` (3,583 lines) into smaller, topic-focused files **without changing any code**. Every byte of the original is preserved; only the file boundaries changed.

## Layout after the split

```
/
├── map.html                          ← updated: 1 stylesheet → 11, 1 script → 13
├── config.js                         ← unchanged
├── README.md                         ← unchanged (still references "app.js")
├── css/
│   ├── 01-base.css                   ← variables, splash, app grid
│   ├── 02-header.css                 ← metabar, mode toggle, burger panel
│   ├── 03-sidebar.css                ← shell + locations sidebar
│   ├── 04-map-details.css            ← map area, details panel, tour arrow, tourbar
│   ├── 05-leaflet-responsive.css     ← Leaflet overrides + media queries
│   ├── 06-align-tool.css             ← image-alignment dev tool
│   ├── 07-streetview-xr.css          ← Treedis overlay + XR mode
│   ├── 08-start-coachmark.css        ← start screen + coachmark walkthrough
│   ├── 09-burger-settings.css        ← burger panel Settings group
│   ├── 10-nav-instructions.css       ← 3D nav instructions modal
│   └── 11-learn-mode.css             ← Learn-mode catalog UI
└── js/
    ├── 01-utils.js                   ← reprojection + helpers (sections 1, 1.bis, 2)
    ├── 02-state.js                   ← Leaflet map, DOM refs, all state (sec 3-6)
    ├── 03-tour-bridge.js             ← Treedis postMessage bridge (sec 6.5)
    ├── 04-street-view.js             ← street-view controller (sec 6.6)
    ├── 05-map-helpers.js             ← map constraints + refresh (sec 6a)
    ├── 06-details-panel.js           ← right-panel + selection (sec 7, 8)
    ├── 07-layer-builders.js          ← Leaflet layers, bounds, tour pins (sec 9-11)
    ├── 08-tourbar.js                 ← tour navigation arrows (sec 12)
    ├── 09-sidebar-search.js          ← sidebar, mobile drawer, search (sec 13-15)
    ├── 10-event-wiring.js            ← top-level event bindings + align tool (sec 16)
    ├── 11-boot.js                    ← preload + boot() (sec 17)
    ├── 12-start-screen.js            ← start screen + coachmarks (also invokes boot())
    └── 13-learn-mode.js              ← Learn mode IIFE (self-contained)
```

## What changed

- `app.js` → 13 files in `js/`, loaded in numeric order via `<script>` tags.
- `mapstyles.css` → 11 files in `css/`, loaded in numeric order via `<link>` tags.
- `map.html` → the single `<link>` and single `<script>` line were each replaced with the corresponding multi-line block. Nothing else in the HTML was touched.

## What did NOT change

- **No code was rewritten.** The split is purely lexical — each new file is a contiguous slice of the original. Concatenating them in load order reproduces the original byte-for-byte (this was verified programmatically with a round-trip test).
- **No ES modules.** Each file still executes at global scope via a plain `<script>` tag, exactly like the original. No `import`/`export` statements were introduced, so cross-file references (`el`, `config`, `map`, `TourBridge`, helper functions, etc.) work unchanged.
- **No build step.** The site still works as static files; no bundler, no transpiler.
- **`config.js`, the data files in `data/`, and all assets are untouched.**
- **`README.md` was not updated** — it still refers to "app.js". If you want it updated to describe the split, that's a separate small edit.

## Load order — why it matters and why this order is safe

With `<script>` tags (no ES modules), every file executes when it parses. Any top-level statement that references a name from another file requires that other file to have already loaded.

The split order respects the original code's dependency chain:

- `01-utils.js` declares `config` and pure helper functions; no cross-file deps.
- `02-state.js` initializes the Leaflet `map`, the `el` DOM refs, and module state. Needs Leaflet (already in `<head>`).
- `03..05` declare more helpers (Treedis bridge, street-view controller, map-refresh helpers). All function declarations; their bodies reference state from 02 but aren't called at parse time.
- `06..08` (details, layers, tourbar) declare more functions.
- `09-sidebar-search.js` is the first file with top-level event bindings (`el.locationsToggle.addEventListener(...)`). By the time it parses, `el` from 02 exists.
- `10-event-wiring.js` binds tour-prev/next handlers — needs `tourPrevAction` from 08 — and runs the align-tool toggle setup. Both deps already loaded.
- `11-boot.js` defines `boot()` plus the preload helpers.
- `12-start-screen.js` ends with `boot().catch(...)`, kicking off the app. `boot` is from 11.
- `13-learn-mode.js` is a self-contained IIFE; no order constraints other than coming after `el` (sec 02) which it doesn't touch anyway.


## Possible next steps (not done in this pass)

These are *future* maintainability improvements, intentionally left out to keep this refactor purely structural:

- **Adopt ES modules.** Change every `<script>` to `<script type="module">` and add `export`/`import` statements. Lets the dependency graph be explicit instead of order-of-tags-implicit.
- **Add a linter.** Drop in `eslint` + a basic config; the lack of build tooling was flagged in the May 13 review.
- **Gate the `console.log/warn/error` calls** behind a `DEBUG` flag (also from the May 13 review).
- **Lift duplicated magic numbers** like `max-width: 1100px` into CSS variables.

None of these affect runtime behavior; all of them make the code easier to evolve.
