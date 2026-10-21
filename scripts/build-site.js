// Package only the files used by the public campus site. In particular, the
// 500 MB QGIS tile archive and source data stay out of staging deployments.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const destination = path.resolve(process.argv[2] || "output/staging-site");
const token = String(process.env.MAPBOX_PUBLIC_TOKEN || "").trim();
if (token && !/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
  throw new Error("MAPBOX_PUBLIC_TOKEN must be a public pk. token");
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

for (const file of ["index.html", "map.html", "config.js"]) copy(file);
for (const entry of fs.readdirSync(path.join(root, "assets"), { withFileTypes: true })) {
  if (entry.isFile()) copy(`assets/${entry.name}`);
}
for (const directory of ["css", "js", "assets/Icons", "assets/locations", "assets/courses"]) {
  fs.cpSync(path.join(root, directory), path.join(destination, directory), { recursive: true });
}
for (const file of [
  "buildings.geojson", "tours.geojson",
  "courses.json", "courses.js", "locations.json", "locations.js",
  "treedis-sweeps.json", "treedis-sweeps.js"
]) copy(`data/${file}`);
if (fs.existsSync(path.join(root, "data/map-flags.json"))) copy("data/map-flags.json");

// The deployment branch still uses the pre-Mapbox site. Once the Mapbox
// branch is integrated, supply a URL-restricted public token per environment.
if (token) {
  fs.writeFileSync(path.join(destination, "mapbox-token.local.js"),
    `window.MAPBOX_PUBLIC_TOKEN = ${JSON.stringify(token)};\n`);
} else {
  fs.rmSync(path.join(destination, "mapbox-token.local.js"), { force: true });
}
console.log(`Site packaged in ${path.relative(root, destination)}`);
