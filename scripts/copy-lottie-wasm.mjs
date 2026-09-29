// Copies the DotLottie WebAssembly renderer from node_modules into
// public/vendor, so it's served from our own origin instead of a public CDN
// (the player's default). Runs before `next dev` and `next build`, which
// keeps the file in step with whatever version of the package is installed.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@lottiefiles', 'dotlottie-web', 'dist', 'dotlottie-player.wasm');
const target = join(root, 'public', 'vendor', 'dotlottie-player.wasm');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('Copied dotlottie-player.wasm to public/vendor');
