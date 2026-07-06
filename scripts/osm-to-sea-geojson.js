/**
 * ?? Overpass OSM ???????????? GeoJSON
 * - ??????????????¦¶????????????????????????????
 * - ??????????????¦²????? + ??????
 */
import fs from 'fs';

const BOUNDS = { south: 29.78, west: 121.95, north: 29.98, east: 122.25 };
const MIN_OPEN_SEA_AREA = 0.000005;
const MIN_HARBOR_AREA = 0.000006;
const INPUT = 'tmp-osm.json';
const OUTPUT = 'public/data/beilun-sea.geojson';

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

function wayToRing(way) {
  const src = way.geometry;
  if (!src || src.length < 3) return null;
  const ring = src.map((g) => [g.lon, g.lat]);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([...ring[0]]);
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

function inBounds([lon, lat]) {
  return lon >= BOUNDS.west && lon <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north;
}

function isReservoir(tags) {
  const t = `${tags.name || ''}${tags.designation || ''}${tags.water || ''}`;
  return t.includes('???') || tags.landuse === 'reservoir';
}

function ptKey(p) {
  return `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
}

function stitchCoastlineSegments(segments) {
  const unused = segments.map((s) => s.slice());
  const chains = [];

  while (unused.length) {
    let chain = unused.pop();
    let extended = true;
    while (extended) {
      extended = false;
      const headK = ptKey(chain[0]);
      const tailK = ptKey(chain[chain.length - 1]);
      for (let i = unused.length - 1; i >= 0; i--) {
        const seg = unused[i];
        const sk = ptKey(seg[0]);
        const ek = ptKey(seg[seg.length - 1]);
        if (tailK === sk) {
          chain.push(...seg.slice(1));
          unused.splice(i, 1);
          extended = true;
          break;
        }
        if (tailK === ek) {
          chain.push(...seg.slice(0, -1).reverse());
          unused.splice(i, 1);
          extended = true;
          break;
        }
        if (headK === ek) {
          chain.unshift(...seg.slice(0, -1));
          unused.splice(i, 1);
          extended = true;
          break;
        }
        if (headK === sk) {
          chain.unshift(...seg.slice(1).reverse());
          unused.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** ????? bbox ????¦Â???????§Þ??????????????? */
function trimPolylineToBounds(line) {
  if (line.length < 2) return line;
  let first = 0;
  let last = line.length - 1;
  while (first < line.length && !inBounds(line[first])) first++;
  while (last > first && !inBounds(line[last])) last--;
  if (first >= last) return [];
  return line.slice(first, last + 1);
}

function chainOverlapsBounds(chain) {
  return chain.some(inBounds);
}

function chainLatSpan(chain) {
  const lats = chain.map((p) => p[1]);
  return Math.max(...lats) - Math.min(...lats);
}

function buildOpenSeaRing(coastChain) {
  const coast = trimPolylineToBounds(coastChain);
  if (coast.length < 2) return null;

  if (coast[0][1] < coast[coast.length - 1][1]) {
    coast.reverse();
  }

  const north = coast[0];
  const south = coast[coast.length - 1];

  if (north[1] - south[1] < 0.008) return null;

  const ring = ensureCounterClockwise([
    ...coast,
    [BOUNDS.east, south[1]],
    [BOUNDS.east, north[1]],
    [...north],
  ]);
  return ringArea(ring) >= MIN_OPEN_SEA_AREA ? ring : null;
}

const features = [];

// 1. ?????????????????????????????????
const coastSegments = [];
for (const el of raw.elements) {
  if (el.type !== 'way' || (el.tags || {}).natural !== 'coastline') continue;
  if (!el.geometry || el.geometry.length < 2) continue;
  coastSegments.push(el.geometry.map((g) => [g.lon, g.lat]));
}

const chains = stitchCoastlineSegments(coastSegments)
  .filter((c) => c.length >= 80 && chainOverlapsBounds(c))
  .sort((a, b) => b.length - a.length);

for (const chain of chains) {
  const openSea = buildOpenSeaRing(chain);
  if (!openSea) continue;
  features.push({
    type: 'Feature',
    properties: { source: 'coastline-sea', name: '??' },
    geometry: { type: 'Polygon', coordinates: [openSea] },
  });
}

// 2. ??????/?????OSM ????????????
for (const el of raw.elements) {
  if (el.type !== 'way') continue;
  const tags = el.tags || {};
  if (tags.natural !== 'water' && tags.natural !== 'bay') continue;
  if (isReservoir(tags)) continue;

  const ring = wayToRing(el);
  if (!ring || ringArea(ring) < MIN_HARBOR_AREA) continue;
  if (!ring.some(inBounds)) continue;

  features.push({
    type: 'Feature',
    properties: {
      source: 'osm-water',
      name: tags.name || tags.designation || '',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [ensureCounterClockwise(ring)],
    },
  });
}

const geojson = { type: 'FeatureCollection', features };
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(geojson));
console.log(`§Õ?? ${OUTPUT}???? ${features.filter((f) => f.properties.source === 'coastline-sea').length}?????? ${features.filter((f) => f.properties.source === 'osm-water').length}`);
