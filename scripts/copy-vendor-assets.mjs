// Copies browser assets from node_modules into public/vendor, so they're
// served from our own origin instead of a public CDN. Runs before
// `next dev` and `next build`, which keeps each file in step with whatever
// version of its package is installed.
//
// - dotlottie-player.wasm: the hero animation's WebAssembly renderer.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = [
  ['@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm', 'dotlottie-player.wasm'],
];

mkdirSync(join(root, 'public', 'vendor'), { recursive: true });
for (const [source, name] of ASSETS) {
  copyFileSync(join(root, 'node_modules', ...source.split('/')), join(root, 'public', 'vendor', name));
  console.log(`Copied ${name} to public/vendor`);
}
