// Generates the PWA / app icon set from a single inline SVG, using sharp.
// This is a PLACEHOLDER brand: a monochrome flashcard-deck mark on the app's
// dark theme background (#0a0a0a). Drawn from pure SVG shapes (no font/glyph)
// so it rasterizes identically everywhere. Replace assets/icon.svg or this
// markup with real branding and re-run `node scripts/generate-icons.mjs`.
//
// Outputs:
//   public/icons/pwa-{192,512}.png            (manifest, purpose "any")
//   public/icons/pwa-maskable-{192,512}.png   (manifest, purpose "maskable")
//   public/apple-touch-icon.png               (iOS home screen, 180)
//   public/favicon-32.png, public/favicon.svg (browser tab)
//   assets/icon.svg, assets/icon.png          (1024 source for @capacitor/assets)

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BG = '#0a0a0a';

/** The mark, drawn in a 1024×1024 viewBox. `scale` shrinks the content toward
 *  the center for maskable variants (keeps it inside the ~80% safe zone). */
function iconSvg({ scale = 1 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <g transform="rotate(-12 512 512) translate(-46 -34)">
      <rect x="362" y="312" width="300" height="400" rx="34" fill="#52525b"/>
    </g>
    <g transform="rotate(8 512 512) translate(46 34)">
      <rect x="362" y="312" width="300" height="400" rx="38" fill="#fafafa"/>
      <rect x="412" y="427" width="200" height="30" rx="15" fill="#18181b"/>
      <rect x="412" y="497" width="200" height="28" rx="14" fill="#71717a"/>
      <rect x="412" y="565" width="132" height="28" rx="14" fill="#71717a"/>
    </g>
  </g>
</svg>`;
}

async function render(svg, size, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
}

const pub = path.resolve('public');
const icons = path.join(pub, 'icons');
const assets = path.resolve('assets');

const any = iconSvg({ scale: 1 });
const maskable = iconSvg({ scale: 0.78 });

await render(any, 192, path.join(icons, 'pwa-192.png'));
await render(any, 512, path.join(icons, 'pwa-512.png'));
await render(maskable, 192, path.join(icons, 'pwa-maskable-192.png'));
await render(maskable, 512, path.join(icons, 'pwa-maskable-512.png'));
await render(any, 180, path.join(pub, 'apple-touch-icon.png'));
await render(any, 32, path.join(pub, 'favicon-32.png'));
await render(any, 1024, path.join(assets, 'icon.png'));
await mkdir(pub, { recursive: true });
await writeFile(path.join(pub, 'favicon.svg'), any);
await mkdir(assets, { recursive: true });
await writeFile(path.join(assets, 'icon.svg'), any);

console.log('Generated PWA/app icons into public/ and assets/.');
