// Package only the files used by the public campus site. In particular, the
// 500 MB QGIS tile archive and source data stay out of staging deployments.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const destination = path.resolve(process.argv[2] || "output/staging-site");
const token = String(process.env.MAPBOX_PUBLIC_TOKEN || "").trim();
if (!/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
  throw new Error("Set MAPBOX_PUBLIC_TOKEN to a public pk. token for this deployment");
}
if (destination === root || !destination.startsWith(root + path.sep)) {
  throw new Error("The output directory must be inside the repository");
}

function copy(relative) {
  const source = path.join(root, relative);
  const target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

for (const file of ["index.html", "map.html", "config.js", "assets/mapbox-logo-black.svg"]) copy(file);
for (const directory of ["css", "js", "assets/Icons", "assets/locations", "assets/courses"]) {
  fs.cpSync(path.join(root, directory), path.join(destination, directory), { recursive: true });
}
for (const file of [
  "buildings.geojson", "tours.geojson",
  "courses.json", "courses.js", "locations.json", "locations.js",
  "treedis-sweeps.json", "treedis-sweeps.js", "map-flags.json"
]) copy(`data/${file}`);

// The public browser token is baked into the staging artifact, as it must be
// for client-side Mapbox requests. Give staging its own URL-restricted token.
fs.writeFileSync(path.join(destination, "mapbox-token.local.js"),
  `window.MAPBOX_PUBLIC_TOKEN = ${JSON.stringify(token)};\n`);
console.log(`Site packaged in ${path.relative(root, destination)}`);
