# `data/` — content & geometry reference

This folder holds the app's data. Most of it is **editable content**; some is
**geometry**. This file documents the per-dataset shapes, conventions, and the
domain quirks worth knowing before you edit.

> These notes used to live in the header comments of the `data/*.js` shim files.
> Those shims are now **auto-generated** (see below), so the prose moved here
> where it survives regeneration.

## How content loads (canonical JSON + file:// shim)

Per-location content has two representations of the *same data*:

- **`*.json`** — the **canonical source of truth** (`locations.json`,
  `treedis-sweeps.json`, `courses.json`). Loaded at boot by
  `js/00-data-adapter.js` via `fetch()`, which works over **http/https**.
- **`*.js`** — **`file://` fallback shims**. Plain `<script>`s that seed the
  same globals at parse time, so the page still boots when opened directly off
  disk (where `fetch` is blocked). Over http the adapter re-fetches the JSON and
  **overwrites** these, so edits to the `.js` are ignored in production.

**Editing workflow:** edit the `.json`, then regenerate the shims:

```
node scripts/extract.js          # rebuild data/*.js from the JSON
node scripts/extract.js --check  # verify shims match the JSON (non-zero if stale)
```

`extract.js` runs the *real* adapter transform, so the shims can't drift from
production. **Don't hand-edit the `.js` files** — your changes will be lost on
the next regenerate. See the repo `README.md` for the full architecture.

Geometry (`buildings.geojson`, `tours.geojson`) is edited directly (in QGIS) —
there's no JSON-vs-shim split for it. `Original*.geojson` / `Originlocations.js`
are **backups — leave them alone.**

---

## `locations.json` — per-location content

An array of per-location "documents", each keyed by a lowercase `key` that
matches the feature `name` in the GeoJSON (case-insensitive). The adapter
flattens these into the lookup maps the app reads (`categoryMap`,
`descriptionMap`, `imageMap`, `happensHereMap`, `departmentMap`, `addressMap`,
`explorableMap`, `linksMap`).

Per-document fields (all optional except `key`/`name`):

| Field | Type | Drives |
|-------|------|--------|
| `key` | string (lowercase) | Match against GeoJSON `name`. **Keep lowercase** regardless of display caps. |
| `name` | string | Display name (the GeoJSON `name` is the real title source; this mirrors it). |
| `category` | string | Kicker tag / sidebar label (e.g. `ACADEMICS`). |
| `description` | string | Details-panel paragraph. |
| `image` | string | Hero image path (e.g. `assets/locations/…webp`). |
| `happensHere` | string[] | "What happens here?" chips. |
| `departments` | string[] | Subtitle under the building name. |
| `explorable` | string[] | "Explorable locations" sub-list. |
| `address` | string | Address block + "Open in Maps" links. |
| `links` | `{label,url,icon?}[]` | External-link rows at the bottom of the panel. `icon: "book"` is the only built-in glyph today. |

**Content provenance & feature-mapping quirks** (from `2026-05-20-SCSU-Locations.xlsx`,
a 36-entry confirmed-locations sheet):

- **One sheet entry can map to several GeoJSON features.** The same narrative is
  applied to each until per-feature copy exists:
  - Sheet "Bethea Hall" → feature `Engineering & Computer Science Complex / Bethea Hall`.
  - Sheet "Turner Hall" → **3** features: `Turner Hall Wing A/B/D`.
  - Sheet "Queens Village" → **7** features: `Queens Village A`–`G`.
- **Buildings absent from the sheet** (parking lots, Felton Lab, H-D Theatre, …)
  get a `category` only; their
  description falls through to the generic "…more information coming soon" string
  in `getDescription()` (`js/01-utils.js`).
- **Davis Hall ambiguity.** The sheet had two Davis Hall entries: #7 =
  "Leroy Davis Sr. Science and Research Complex" (2011, extension of Hodge Hall),
  #23 = a separate older classroom building. The GeoJSON has only one
  `Davis Hall` feature; we used **#23's** narrative on the assumption the polygon
  is the older classroom building. If it's actually the Leroy Davis Sr. Complex,
  swap to #7's copy.

---

## `treedis-sweeps.json` — 360° sweep IDs

Maps locations (and sub-locations) to Treedis sweep IDs, **per device profile**.
The adapter flattens this into `CAMPUS_CONFIG.treedisMaps.{desktop,vr}` plus a
legacy `treedisMap` alias.

**Why two profiles.** The campus exists as two separate Treedis models:

- Desktop / tablet / mobile → model `8e4ca3fc`
- XR / VR headset browsers → model `scsu-campus-ade0f346`

Sweep IDs are **scoped per model** — a desktop sweep id won't resolve in the VR
model and vice versa, so the two tables are kept completely separate. The app
picks one at boot via `navigator.xr.isSessionSupported(...)` plus a UA-token
check (`OculusBrowser` / `Quest` / ` VR ` / `Pico`). The matching `modelId` /
`tourUrl` plumbing is in `config.js`.

**Per-document shape:** `{ key, name, parentName, desktop, vr }`, where each of
`desktop`/`vr` is `{ sweepId, transitionTime?, rotation? }`.

- **`parentName`** — for sub-locations (rooms, floors). It's matched
  case-insensitively against the **tour-stop name** in `tours.geojson`
  (`cleanName(name).toLowerCase()`), so when a sub-location's sweep becomes
  active the tour bar shows the right building title. It MUST be the exact
  tour-stop name (e.g. `Crawford-Zimmerman Building`, not `Crawford-Zimmerman`),
  or the tour bar won't update.
- **`rotation`** — forwarded to Treedis's `Navigate` command as `{ x, y }`
  (**x = pitch, y = yaw**). Sourced from the `&x=…&y=…` params in the SCSU_Links
  spreadsheet — camera heading/tilt captured per location. **Per-profile**,
  because the same physical viewpoint resolves differently across the two models.
  When present, the camera lands facing that direction instead of Treedis's default.
- **`sweepId: null`** — a deliberate placeholder; the app degrades gracefully and
  logs a warning rather than breaking.
- **`treedisMap` (singular)** is a backward-compat alias to the desktop profile;
  the app repoints it to the VR profile at boot when XR is detected.

**v2 GeoJSON name changes** the keys/parentNames already reflect:
`Crawford Zimmerman` → `Crawford-Zimmerman Building`;
`S-H-M Memorial Square` → `SHM Memorial Square`.

---

## `courses.json` — Learn-mode catalog

An array of course documents under `SCSU_DATA.courses`. Shape of one entry:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable slug, used as DOM key. |
| `code` | string | Course code shown above the title (e.g. `NRM 342`). |
| `title` | string | Shown in list & detail header. |
| `image` | string | Hero image (e.g. `assets/courses/…webp`). |
| `credits` | string | Free-form so `"3 Course Credits"` / `"TBD"` both work. |
| `lastUpdated` | string | Free-form; rendered verbatim. |
| `lede` | string | 1–2 sentence dek under the title. |
| `overview` | string | Long-form paragraph. |
| `curriculum` | string[] | Bullets in the right column. |
| `eon` | `{desktopUrl, vrUrl}` | EON Reality launch targets — "Begin Course" hands off to whichever matches the device; EON's own login wall catches the user. Omit/null if no EON build yet (button shows disabled). |
| `immersive` | `{note}` | Optional VR-Enabled chip + tooltip copy. Independent of `eon`. |
