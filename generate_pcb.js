const fs = require('fs');

const w = 200;
const h = 200;

let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
svg += `<rect width="${w}" height="${h}" fill="none"/>`;

// Add some traces that tile perfectly
const paths = [
  // Horizontal-ish
  "M0 20 L30 20 L45 35 L80 35 L95 20 L200 20",
  "M0 60 L20 60 L40 80 L60 80 L80 100 L120 100 L140 80 L200 80",
  "M0 140 L40 140 L60 160 L140 160 L160 140 L200 140",
  "M0 180 L20 180 L35 165 L65 165 L80 180 L200 180",
  
  // Vertical-ish
  "M40 0 L40 15 L25 30 L25 70 L40 85 L40 200",
  "M100 0 L100 30 L115 45 L115 85 L100 100 L100 200",
  "M160 0 L160 30 L145 45 L145 115 L160 130 L160 200",
  
  // Intersecting/short ones (tiled via wrap)
  "M0 100 L15 100 L30 115 L30 130", // exits left 100, ends inside
  "M170 130 L170 115 L185 100 L200 100", // matches above on the right
  
  "M80 0 L80 15 L65 30 L65 50", // ends inside
  "M65 150 L65 170 L80 185 L80 200", // matches above on bottom
];

// Add paths
svg += `<g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`;
for (let p of paths) {
  svg += `<path d="${p}" />`;
}
svg += `</g>`;

// Add Vias (pads)
const vias = [
  [30, 20], [80, 35], [20, 60], [60, 80], [120, 100],
  [40, 140], [140, 160], [20, 180], [65, 165],
  [40, 15], [25, 70], [100, 30], [115, 85], [160, 30], [145, 115],
  [30, 130], [170, 130], [65, 50], [65, 150]
];

svg += `<g fill="none" stroke="#000" stroke-width="2">`;
for (let v of vias) {
  svg += `<circle cx="${v[0]}" cy="${v[1]}" r="4.5" />`;
}
svg += `</g>`;

// Add some smaller filled vias for detail
svg += `<g fill="#000">`;
for (let v of vias) {
  svg += `<circle cx="${v[0]}" cy="${v[1]}" r="1.5" />`;
}
// standalone vias
const standalone = [
  [180, 40], [180, 55], [10, 150], [90, 130], [120, 160], [140, 20], [50, 110]
];
for (let v of standalone) {
  svg += `<circle cx="${v[0]}" cy="${v[1]}" r="3" />`;
}
svg += `</g>`;

svg += `</svg>`;

fs.writeFileSync('pcb.svg', svg);
console.log('Done');
