/**
 * ?? OSM ???????????????? ?? GeoJSON
 */
import fs from 'fs';

const PORT_BOUNDS = { south: 29.87, west: 121.79, north: 29.95, east: 121.92 };
const MIN_AREA = 0.000002;
const INPUT = 'tmp-osm-port.json';
const OUTPUT = 'public/data/beilun-port.geojson';
const META_OUTPUT = 'public/data/beilun-port-meta.json';

const MODEL_SITE = {
  lng: 121.88985586166383,
  lat: 29.93291533901135,
  buffer: 0.003, // ? 300m ????
};

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

function wayToRing(way) {
  const src = way.geometry;
  if (!src || src.length < 3) return null;
  const ring = src.map((g) => [g.lon, g.lat]);
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
    ring.push([...ring[0]]);
  }
  return ring;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

function ensureCounterClockwise(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a < 0 ? ring.slice().reverse() : ring.slice();
}

function inPortBounds([lon, lat]) {
  return (
    lon >= PORT_BOUNDS.west &&
    lon <= PORT_BOUNDS.east &&
    lat >= PORT_BOUNDS.south &&
    lat <= PORT_BOUNDS.north
  );
}

const features = [];

for (const el of raw.elements) {
  if (el.type !== 'way') continue;
  const tags = el.tags || {};
  if (tags.natural !== 'water') continue;

  const ring = wayToRing(el);
  if (!ring || ringArea(ring) < MIN_AREA) continue;
  if (!ring.some(inPortBounds)) continue;

  features.push({
    type: 'Feature',
    properties: { source: 'osm-port-water', name: tags.name || '???????' },
    geometry: { type: 'Polygon', coordinates: [ensureCounterClockwise(ring)] },
  });
}

if (features.length === 0) {
  console.error('未找到港区水域，请先运行 fetch-osm-port-small.js');
  process.exit(1);
}

const modelInWater = features.some((f) =>
  pointInRing([MODEL_SITE.lng, MODEL_SITE.lat], f.geometry.coordinates[0])
);
if (!modelInWater) {
  const d = MODEL_SITE.buffer;
  const { lng, lat } = MODEL_SITE;
  features.push({
    type: 'Feature',
    properties: { source: 'model-site', name: '模型码头水域' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lng - d, lat - d * 0.75],
        [lng + d, lat - d * 0.75],
        [lng + d, lat + d * 0.75],
        [lng - d, lat + d * 0.75],
        [lng - d, lat - d * 0.75],
      ]],
    },
  });
}

let west = Infinity;
let east = -Infinity;
let south = Infinity;
let north = -Infinity;

for (const f of features) {
  for (const [lon, lat] of f.geometry.coordinates[0]) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
}

const meta = {
  name: '??????????',
  modelLng: MODEL_SITE.lng,
  modelLat: MODEL_SITE.lat,
  centerLng: MODEL_SITE.lng,
  centerLat: MODEL_SITE.lat,
  west,
  south,
  east,
  north,
  waterHeight: 0,
  polygonCount: features.length,
};

const geojson = { type: 'FeatureCollection', features };
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(geojson));
fs.writeFileSync(META_OUTPUT, JSON.stringify(meta, null, 2));
console.log(`???? ${OUTPUT}????????? ${features.length} ??`);
console.log('????:', meta.centerLng.toFixed(5), meta.centerLat.toFixed(5));
