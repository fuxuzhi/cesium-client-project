const query = `[out:json][timeout:60];
(
  way["natural"="water"](29.78,121.95,29.98,122.25);
  relation["natural"="water"](29.78,121.95,29.98,122.25);
  way["natural"="bay"](29.78,121.95,29.98,122.25);
  way["natural"="coastline"](29.78,121.95,29.98,122.25);
);
out geom;`;

const body = 'data=' + encodeURIComponent(query);

fetch('https://overpass.kumi.systems/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'gis-project-demo/1.0',
  },
  body,
})
  .then((r) => r.text())
  .then(async (t) => {
    console.log('length:', t.length);
    console.log(t.slice(0, 300));
    const fs = await import('fs');
    fs.writeFileSync('tmp-osm.json', t);
  })
  .catch(console.error);
