'use client';

import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';

// The WebAssembly renderer is served from our own origin (copied there by
// scripts/copy-lottie-wasm.mjs) rather than the player's default public CDN.
setWasmUrl('/vendor/dotlottie-player.wasm');

export const HERO_ANIMATION_SRC = 'https://lottie.host/4e1a5b9d-030b-4ea6-a004-d452118b2b58/UDgwjBVkWu.lottie';

// Loaded on demand by hero-animation.tsx, which sizes and places the square
// container this fills.
const HeroLottie = () => (
  <DotLottieReact
    src={HERO_ANIMATION_SRC}
    loop
    autoplay
    className="size-full"
  />
);

export default HeroLottie;
