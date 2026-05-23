# SCSU Virtual Campus — Data → JSON migration 

This migration converts the three editorial-content data files
from JavaScript shims (`data/locations.js`, `data/treedis-sweeps.js`,
`data/courses.js`) to canonical JSON files
(`data/locations.json`, `data/treedis-sweeps.json`,
`data/courses.json`) consumed at boot through a small adapter
(`js/00-data-adapter.js`).

The JS shims are still in the repo and still loaded by
`map.html`, but they now serve as a `file://` fallback. In any
http(s) deployment the adapter fetches the JSON files and
overwrites whatever the shims set, so the JSON is the source of
truth in production.

This is the first half of the future CMS integration: any
CMS (Sanity, Leon's mini-CMS, or anything else) that returns
JSON in this shape can be swapped in by repointing the URLs in
`config.dataFiles.{locations,treedisSweeps,courses}` — the
adapter is the only place that knows the shape.

---

## JSON shape

### `data/locations.json`

```json
{
  "$schema": "scsu-locations-v1",
  "generatedAt": "2026-05-21",
  "locations": [
    {
      "id":          "nance-hall",          // slug, stable across renames
      "key":         "nance hall",          // lowercase lookup key
                                            // (matches GeoJSON `name`)
      "name":        "Nance Hall",          // pretty display name
      "category":    "ACADEMICS",
      "description": "Home to the College of Agriculture and the...",
      "image":       "assets/locations/nance-hall.webp",
      "address":     null,                  // omitted entirely when null
      "happensHere": ["NRM Labs", "USDA Research", ...],
      "departments": ["Mathematics & Science", "College of Agriculture"],
      "explorable":  ["Room 110", "Lecture Room", "Room 100"]
    },
    ...
  ]
}
```

One document per location. The seven optional fields are present
only when the location actually has that data — same convention
as the legacy maps where only the keys that mattered got an entry.

A CMS schema for this is straightforward: one document type
("Location") with seven optional fields.

### `data/treedis-sweeps.json`

```json
{
  "$schema": "scsu-treedis-sweeps-v1",
  "generatedAt": "2026-05-21",
  "models": {
    "desktop": "8e4ca3fc",
    "vr":      "scsu-campus-ade0f346"
  },
  "sweeps": [
    {
      "id":         "nance-hall",
      "key":        "nance hall",
      "name":       "Nance Hall",
      "parentName": null,                  // null for top-level entries,
                                            // building name for sub-locations
      "desktop": {
        "sweepId":        "tha74gz4z0hsxqh6e1ziudqpd",
        "transitionTime": null,
        "rotation":       { "x": 6.575815542193622, "y": -95.18049943080082 }
      },
      "vr": {
        "sweepId":        "tha74gz4z0hsxqh6e1ziudqpd",
        "transitionTime": null,
        "rotation":       { "x": 5.556788914278276, "y": -76.99676497350086 }
      }
    },
    ...
  ]
}
```

One document per sweep entry. `parentName` lives at the document
level (same in both profiles), `sweepId` and `rotation` are
per-profile. Sub-locations (rooms, floors, etc.) carry the parent
building's name in `parentName` so the street-view UI can show
the right title.

### `data/courses.json`

```json
{
  "$schema": "scsu-courses-v1",
  "generatedAt": "2026-05-21",
  "courses": [
    {
      "id":          "nrm-342",
      "code":        "NRM 342",
      "title":       "Agronomy & Soils",
      "image":       "assets/courses/nrm-342.webp",
      "credits":     "3 Course Credits",
      "lastUpdated": "1 OCTOBER, 2026",
      "lede":        "Soil is the living foundation of...",
      "overview":    "Beginning with soil-forming processes...",
      "curriculum":  ["Soil formation, horizon development...", ...],
      "eon": {
        "desktopUrl": "https://...",
        "vrUrl":      "https://..."
      },
      "immersive": {
        "note": "In your headset, sign in to..."
      }
    },
    ...
  ]
}
```

Pure format change — the course shape was already document-shaped.

---

## Loading sequence

1. **`<script>` parse time** — legacy `data/*.js` shims load and
   populate `window.CAMPUS_CONFIG` (categoryMap, descriptionMap,
   …, treedisMaps) and `window.SCSU_DATA.courses`. If a script
   404s (e.g. it was removed for a JSON-only deployment), the
   `onerror="this.remove()"` handler swallows the error.
2. **`config.js`** merges structural plumbing on top of whatever
   the shims set.
3. **`js/00-data-adapter.js`** loads and defines `loadDataJSON()`
   plus the four `apply*JSON()` helpers. No side effects yet.
4. **`js/01-utils.js`** runs `resolveTreedisProfile()` against
   whatever sweep data is currently in place (shim, at this
   point) — sets `config.treedisMap` and `config.treedis.tourUrl`
   for the iframe preload.
5. **`boot()`** runs in `js/11-boot.js`:
   - `maybeUpgradeToVRProfile()` — possibly flip to VR profile.
   - `preloadTreedisIframe()` — uses `config.treedis.tourUrl`.
   - `loadAllData()` — fetches the two `.geojson` files **and**
     calls `loadDataJSON()` in parallel. When the JSON fetches
     succeed, the adapter overwrites the shim-populated maps
     with the JSON-loaded versions and re-runs
     `applyTreedisProfile(activeTreedisProfile)` so the iframe's
     tourUrl/modelId stay in sync.
6. **All subsequent reads** — `getCategory()`, `getDescription()`,
   `getTreedisEntry()`, etc. in `js/01-utils.js` — read the
   freshly-populated `config.*` maps as before. No consumer code
   knew the data came from JSON.

If the JSON fetches fail (file:// origin, network error,
malformed JSON), the shim-populated state is what stays, and the
page works exactly as it did before this migration.

---

## CMS integration path

When a CMS lands:

1. The CMS returns JSON in one of the three shapes above
   (or in a slightly different shape — only the adapter has to
   change to match).
2. Point `config.dataFiles.locations`, `.treedisSweeps`, and
   `.courses` at the CMS API URLs (e.g.
   `https://api.scsu-cms.example.com/v1/locations`).
3. Done. No app code changes needed.

For Sanity specifically, a GROQ query like
`*[_type == "location"]{...}` returns an array of documents
matching the `locations` array shape; wrap it in `{locations: ...}`
in a small middleware (or a Sanity edge function) and the adapter
consumes it unchanged. Sweeps and courses follow the same pattern.

---

## Scripts

Two helper scripts live in `scripts/`:

### `scripts/extract.js`
Reads the legacy `data/*.js` shims (by executing them in a Node
VM context, not by parsing), and writes the canonical
`data/*.json` files. Used to bootstrap this migration. Safe to
re-run, but the JSON is now the source of truth — running this
after editing JSON would overwrite the JSON from the (now-stale)
shims. Don't.

### `scripts/regen-shims.js`
The inverse: reads `data/*.json` and writes refreshed
`data/*.js` shims. Use this after editing JSON to keep the
`file://` fallback in sync. **This script destroys the
hand-written editorial comments in the original shims** — those
comments should be migrated to per-document `notes` fields in
the JSON before running it for the first time, otherwise they
are lost.

### `scripts/verify.js`
Equivalence test. Loads the legacy shims and the JSON-via-adapter
path side by side and reports any divergence in
`window.CAMPUS_CONFIG` / `window.SCSU_DATA`. Currently reports
all 275 entries across 10 maps as identical.

---

## File summary

| Path                               | Status                                |
|------------------------------------|---------------------------------------|
| `data/locations.json`              | **NEW** — source of truth             |
| `data/treedis-sweeps.json`         | **NEW** — source of truth             |
| `data/courses.json`                | **NEW** — source of truth             |
| `data/locations.js`                | Now file:// fallback (header updated) |
| `data/treedis-sweeps.js`           | Now file:// fallback (header updated) |
| `data/courses.js`                  | Now file:// fallback (header updated) |
| `js/00-data-adapter.js`            | **NEW** — JSON ↔ legacy-map adapter   |
| `js/11-boot.js`                    | Updated `loadAllData()`                |
| `config.js`                        | Added `dataFiles.{locations,treedisSweeps,courses}` |
| `map.html`                         | Added `<script>` for the adapter       |
| `scripts/extract.js`               | **NEW** — JS→JSON one-time bootstrap   |
| `scripts/regen-shims.js`           | **NEW** — JSON→JS refresh tool         |
| `scripts/verify.js`                | **NEW** — equivalence test             |
