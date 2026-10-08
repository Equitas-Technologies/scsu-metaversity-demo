/* Regression checks for SCSU's confirmed names and description behavior.
   Run with: node scripts/check-location-feedback.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const payload = JSON.parse(read('data/locations.json'));
const locations = payload.locations;
const features = ['buildings', 'tours'].flatMap(kind =>
  JSON.parse(read(`data/${kind}.geojson`)).features);
const byKey = new Map(locations.map(loc => [loc.key, loc]));
assert.equal(byKey.size, locations.length, 'Unique location keys');
assert.equal(new Set(locations.map(loc => loc.id)).size, locations.length, 'Unique IDs');
for (const f of features) {
  const name = (f.properties.name || '').trim();
  if (name && name.toLowerCase() !== 'none') {
    assert.ok(byKey.has(name.toLowerCase()), `Missing content: ${name}`);
  }
}
for (const removed of ['Alumni House', 'Athletics Department I', 'Athletics Department II']) {
  assert.ok(!byKey.has(removed.toLowerCase()));
  assert.ok(!features.some(f => f.properties.name === removed));
}
assert.equal(locations.filter(loc => loc.name === 'Nix Hall').length, 1);
const nixFeatures = features.filter(f => f.properties.name === 'Nix Hall');
assert.equal(nixFeatures.length, 1);
assert.equal(nixFeatures[0].geometry.type, 'MultiPolygon');
assert.equal(nixFeatures[0].geometry.coordinates.length, 2);
assert.equal(locations.filter(loc => loc.id === 'davis-hall').length, 1);
const entranceNames = ['1', '1A', '1B', '2', '3', '4', '5'].map(n => `Entrance ${n}`);
const entrances = features.filter(f => f.properties.location_type === 'entrance');
assert.deepEqual(entrances.map(f => f.properties.name).sort(), [...entranceNames].sort());
for (const entrance of entrances) {
  assert.equal(entrance.geometry.type, 'Point');
  const [lng, lat] = entrance.geometry.coordinates;
  assert.ok(lng > -80.86 && lng < -80.84 && lat > 33.49 && lat < 33.51, 'Entrance within campus area');
  assert.equal(byKey.get(entrance.properties.name.toLowerCase()).mappingStatus, 'mapped-approximate');
}
assert.ok(!byKey.get('leroy davis sr. science and research complex').description.includes('Not to be confused'));

for (const mode of ['json', 'shim']) {
  const context = vm.createContext({window: {}, console: {info() {}, warn() {}}, navigator: {}});
  if (mode === 'json') {
    vm.runInContext(read('js/00-data-adapter.js'), context);
    context.applyLocationsJSON(payload);
  } else {
    vm.runInContext(read('data/locations.js'), context);
  }
  vm.runInContext(read('js/01-utils.js'), context);
  for (const name of ['Adult Continuing Education', 'Nix Hall', 'Rowe Hall']) {
    assert.equal(context.getDescription(name), '', `${mode}: ${name} is name-only`);
  }
  for (const name of ['Faculty / Staff Parking', 'Off Campus Student Parking',
    'On Campus / Off Campus Student Parking', 'On Campus Student Parking']) {
    assert.match(context.getDescription(name), /more information.*coming soon/);
  }
  assert.ok(context.matchesLocationName('Leroy Davis Sr. Science and Research Complex', 'davis hall'));
  assert.ok(context.matchesLocationName('Clyburn Research Building', 'clyburn center'));
  assert.ok(context.matchesLocationName('Entrance 2', 'gate 2'));
  assert.match(context.getDescription('Entrance 2'), /Russell Street.*Will Call/);
  assert.ok(context.matchesLocationName('Ko W.G. Donma Administration Building', 'administration building'));
  assert.match(context.getDescription('Clyburn Research Building'), /Transportation Center/);
  assert.match(context.getDescription('James E. Clyburn Engineering and Computer Science Complex'), /STEM/);
}
console.log('Location integrity, canonical search aliases, name-only descriptions and parking fallbacks passed (JSON + shim).');
