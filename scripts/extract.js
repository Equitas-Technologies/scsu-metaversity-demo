#!/usr/bin/env node
/* ============================================================
   SCSU METAVERSITY — shim generator  (JSON  →  data/*.js)
   ------------------------------------------------------------
   The per-location content is stored canonically as JSON
   (data/locations.json, data/treedis-sweeps.json,
   data/courses.json) and loaded at boot by js/00-data-adapter.js
   over http/https.

   The matching data/*.js files are FALLBACK SHIMS for the
   file:// origin (where fetch() is blocked), and they must hold
   the same content. This script regenerates those shims from
   the JSON so you never hand-sync them: edit the .json, then run

       node scripts/extract.js            # regenerate the shims
       node scripts/extract.js --check    # verify only (CI-friendly)

   HOW IT GUARANTEES FIDELITY
   --------------------------
   Rather than re-implement the JSON→maps flattening (which could
   drift from the adapter), this script LOADS js/00-data-adapter.js
   in a sandbox and runs its real apply*JSON() functions on the
   JSON — the identical transform the browser does over http. The
   resulting globals are serialized into the shims. It then reloads
   each generated shim and deep-compares it back to that canonical
   result, aborting on any mismatch.

   --check exits non-zero if the shims on disk no longer match the
   JSON (i.e. someone edited the JSON without regenerating). Wire
   it into a pre-commit hook or CI if you want enforced sync.
   ============================================================ */

"use strict";

const fs     = require("fs");
const path   = require("path");
const vm     = require("vm");

const ROOT       = path.resolve(__dirname, "..");
const DATA_DIR   = path.join(ROOT, "data");
const ADAPTER_JS = path.join(ROOT, "js", "00-data-adapter.js");

const CHECK_ONLY = process.argv.includes("--check");

/* ---- helpers ------------------------------------------------ */

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

/* Run the real adapter against the JSON payloads in a sandbox and
   return the { CAMPUS_CONFIG, SCSU_DATA } globals it produces —
   exactly what the browser ends up with over http. */
function canonicalGlobals(payloads) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ADAPTER_JS, "utf8"), sandbox, {
    filename: "00-data-adapter.js"
  });
  if (payloads.locations) sandbox.applyLocationsJSON(payloads.locations);
  if (payloads.sweeps)    sandbox.applyTreedisSweepsJSON(payloads.sweeps);
  if (payloads.courses)   sandbox.applyCoursesJSON(payloads.courses);
  return sandbox.window;
}

/* Load a shim's SOURCE TEXT in a sandbox and return the globals it
   sets — used to verify generated (or on-disk) shims match the
   canonical result. */
function loadShimSource(src, filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename });
  return sandbox.window;
}

/* Pretty-print a value as a JS literal (2-space indent). JSON is a
   valid subset of JS object/array literals, so this round-trips
   cleanly and produces double-quoted keys like the existing shims. */
function literal(value) {
  return JSON.stringify(value, null, 2);
}

function banner(title, sourceJSON) {
  return `/* ============================================================
   ${title}
   ------------------------------------------------------------
   ⚠️  AUTO-GENERATED — DO NOT EDIT BY HAND.
   Source of truth: data/${sourceJSON}
   Regenerate with:  node scripts/extract.js

   This is the file:// fallback shim. It seeds the same globals
   that js/00-data-adapter.js builds from the JSON at boot; over
   http/https the adapter re-fetches the JSON and overwrites
   these values, so edits here are ignored in production.
   ============================================================ */
`;
}

/* ---- shim builders ----------------------------------------- */

const LOCATION_MAPS = [
  "categoryMap", "descriptionMap", "imageMap", "happensHereMap",
  "departmentMap", "addressMap", "explorableMap", "linksMap"
];

function buildLocationsShim(cfg) {
  let out = banner("SCSU METAVERSITY — Per-location content (FALLBACK SHIM)",
                   "locations.json");
  out += "\nwindow.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};\n";
  for (const map of LOCATION_MAPS) {
    out += `\nwindow.CAMPUS_CONFIG.${map} = ${literal(cfg[map] || {})};\n`;
  }
  return out;
}

function buildSweepsShim(cfg) {
  let out = banner("SCSU METAVERSITY — Treedis sweep maps (FALLBACK SHIM)",
                   "treedis-sweeps.json");
  out += "\nwindow.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};\n";
  out += `\nwindow.CAMPUS_CONFIG.treedisMaps = ${literal(cfg.treedisMaps || {})};\n`;
  // `treedisMap` (singular) is the legacy alias to the desktop
  // profile; kept as a live reference so applyTreedisProfile() can
  // repoint it to the vr profile at boot, same as the JSON path.
  out += "window.CAMPUS_CONFIG.treedisMap = window.CAMPUS_CONFIG.treedisMaps.desktop;\n";
  return out;
}

function buildCoursesShim(data) {
  let out = banner("SCSU METAVERSITY — Course catalog / Learn mode (FALLBACK SHIM)",
                   "courses.json");
  out += "\nwindow.SCSU_DATA = window.SCSU_DATA || {};\n";
  out += `\nwindow.SCSU_DATA.courses = ${literal((data && data.courses) || [])};\n`;
  return out;
}

/* ---- verification ------------------------------------------ */

/* Canonical stringify: recursively sorts object keys so the
   comparison ignores property order, and (because it's plain JSON)
   ignores which vm realm the objects came from. Arrays keep order. */
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort()
      .map((k) => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function deepEqual(actual, expected, label, errors) {
  if (stable(actual) !== stable(expected)) errors.push(label);
}

/* Compare the globals a shim sets against the canonical globals. */
function diffShim(shimGlobals, canonical, kind) {
  const errors = [];
  if (kind === "locations") {
    for (const map of LOCATION_MAPS) {
      deepEqual((shimGlobals.CAMPUS_CONFIG || {})[map],
                (canonical.CAMPUS_CONFIG || {})[map], map, errors);
    }
  } else if (kind === "sweeps") {
    deepEqual((shimGlobals.CAMPUS_CONFIG || {}).treedisMaps,
              (canonical.CAMPUS_CONFIG || {}).treedisMaps, "treedisMaps", errors);
    deepEqual((shimGlobals.CAMPUS_CONFIG || {}).treedisMap,
              (canonical.CAMPUS_CONFIG || {}).treedisMap, "treedisMap", errors);
  } else if (kind === "courses") {
    deepEqual((shimGlobals.SCSU_DATA || {}).courses,
              (canonical.SCSU_DATA || {}).courses, "courses", errors);
  }
  return errors;
}

/* ---- main --------------------------------------------------- */

function main() {
  const payloads = {
    locations: readJSON("locations.json"),
    sweeps:    readJSON("treedis-sweeps.json"),
    courses:   readJSON("courses.json")
  };

  const canonical = canonicalGlobals(payloads);

  const targets = [
    { file: "locations.js",      kind: "locations", build: () => buildLocationsShim(canonical.CAMPUS_CONFIG) },
    { file: "treedis-sweeps.js", kind: "sweeps",    build: () => buildSweepsShim(canonical.CAMPUS_CONFIG) },
    { file: "courses.js",        kind: "courses",   build: () => buildCoursesShim(canonical.SCSU_DATA) }
  ];

  let drift = false;

  for (const t of targets) {
    const abs = path.join(DATA_DIR, t.file);

    if (CHECK_ONLY) {
      // Verify the shim ALREADY on disk matches the JSON.
      const onDisk = loadShimSource(fs.readFileSync(abs, "utf8"), t.file);
      const errors = diffShim(onDisk, canonical, t.kind);
      if (errors.length) {
        drift = true;
        console.error(`✗ data/${t.file} is OUT OF SYNC with the JSON (${errors.join(", ")})`);
      } else {
        console.log(`✓ data/${t.file} is in sync`);
      }
      continue;
    }

    // Generate, self-verify by reloading, then write.
    const src = t.build();
    const reloaded = loadShimSource(src, t.file);
    const errors = diffShim(reloaded, canonical, t.kind);
    if (errors.length) {
      console.error(`✗ refused to write data/${t.file}: generated shim ` +
                    `does not round-trip (${errors.join(", ")})`);
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(abs, src);
    console.log(`✓ wrote data/${t.file}`);
  }

  if (CHECK_ONLY && drift) {
    console.error("\nShims are stale. Run: node scripts/extract.js");
    process.exitCode = 1;
  }
}

main();
