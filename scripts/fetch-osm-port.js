/** 查询北仑港区码头相关 OSM 数据 */
const query = `[out:json][timeout:90];
(
  nwr["name"~"北仑",i]["name"~"港",i](29.82,121.82,29.98,122.08);
  way["landuse"="port"](29.82,121.82,29.98,122.08);
  way["industrial"="port"](29.82,121.82,29.98,122.08);
  relation["landuse"="port"](29.82,121.82,29.98,122.08);
  way["harbour"="yes"](29.82,121.82,29.98,122.08);
  way["natural"="water"]["name"~"港",i](29.82,121.82,29.98,122.08);
  way["natural"="water"]["name"~"北仑",i](29.82,121.82,29.98,122.08);
  way["waterway"="dock"](29.82,121.82,29.98,122.08);
  way["man_made"="pier"](29.82,121.82,29.98,122.08);
  way["natural"="water"](29.82,121.82,29.98,122.08);
  relation["natural"="water"](29.82,121.82,29.98,122.08);
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
    const fs = await import('fs');
    fs.writeFileSync('tmp-osm-port.json', t);
    const data = JSON.parse(t);
    const named = data.elements.filter((e) => e.tags?.name);
    console.log('total elements:', data.elements.length, 'named:', named.length);
    named.forEach((e) =>
      console.log(
        e.type,
        e.tags.name,
        e.tags.natural || e.tags.landuse || e.tags.man_made || e.tags.waterway || e.tags.industrial || ''
      )
    );
  })
  .catch(console.error);
