import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'public/textures');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const list = [
  { name: 'earth-dark.jpg', url: 'https://unpkg.com/three-globe/example/img/earth-dark.jpg' },
  { name: 'earth-day.jpg', url: 'https://unpkg.com/three-globe/example/img/earth-day.jpg' },
  { name: 'earth-night.jpg', url: 'https://unpkg.com/three-globe/example/img/earth-night.jpg' },
  { name: 'night-sky.png', url: 'https://unpkg.com/three-globe/example/img/night-sky.png' },
  // NASA SVS CGI Moon Kit (LRO colour mosaic, public domain), 1024×512
  {
    name: 'moon.jpg',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg',
  },
];

async function download() {
  for (const item of list) {
    const dest = path.join(outDir, item.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log('✓ Already cached:', item.name);
      continue;
    }
    console.log('↓ Downloading', item.name, '...');
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log('✓ Saved', item.name, `${(buf.length / 1024).toFixed(1)} KB`);
  }

  const maskDest = path.join(outDir, 'water-mask.png');
  if (!fs.existsSync(maskDest) || fs.statSync(maskDest).size === 0) {
    console.log('⚙ Generating water-mask.png from Natural Earth polygons...');
    const { generateWaterMask } = await import('./textures/generateWaterMask.js');
    generateWaterMask({ outputPath: maskDest });
  } else {
    console.log('✓ Already cached: water-mask.png');
  }
}

download().catch(err => {
  console.error(err);
  process.exit(1);
});
