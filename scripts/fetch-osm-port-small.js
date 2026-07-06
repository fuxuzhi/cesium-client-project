const query = `[out:json][timeout:40];
(
  nwr["name"~"北仑",i](29.90,121.82,29.97,121.98);
  nwr["name"~"集装箱",i](29.75,121.98,29.82,122.02);
  nwr["name"~"码头",i](29.75,121.82,29.97,122.02);
  way["natural"="water"](29.87,121.79,29.95,121.92);
  way["natural"="water"](29.75,121.98,29.82,122.02);
  way["landuse"="industrial"]["name"~"码头",i](29.75,121.82,29.97,122.02);
);
out geom;`;

const body = 'data=' + encodeURIComponent(query);
const fs = await import('fs');

const t = await fetch('https://overpass.kumi.systems/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'gis-project-demo/1.0',
  },
  body,
}).then((r) => r.text());

fs.writeFileSync('tmp-osm-port.json', t);
const d = JSON.parse(t);
console.log('elements', d.elements.length);
d.elements
  .filter((e) => e.tags?.name)
  .forEach((e) => console.log(e.type, e.tags.name, e.tags.natural || e.tags.landuse || e.tags.industrial || ''));
