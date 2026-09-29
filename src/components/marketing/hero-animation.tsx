'use client';

import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';

// The player (and its WebAssembly renderer) loads after the hero has
// rendered, so the headline and buttons never wait for a decoration.
const HeroLottie = dynamic(() => import('@/components/marketing/hero-lottie'), { ssr: false });

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

// Decorative delivery-truck loop along the bottom edge of the hero.
//
// Layering: above the hero's background glows, below its content (z-10).
// It's absolutely positioned (never affects layout), never receives clicks,
// and the hero's own overflow-hidden crops anything past its edges.
//
// Placement: the animation is a square in which the truck fills only the
// middle third vertically, so the square is sized from the hero's height and
// pushed down by a third of itself — the empty space under the truck is
// cropped off and the wheels sit on the hero's bottom edge. On wide screens
// it drives in under the route illustration (right); on phones and tablets,
// where that illustration fills the lower hero, it sits bottom-left, clear
// of the route and the text.
//
// Reduced-motion users get neither the animation nor its download: the CSS
// hides the layer immediately, and the player is never mounted.
const HeroAnimation = () => {
  const allowMotion = useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(REDUCED_MOTION).matches,
    // Server render: nothing — the player is client-only anyway.
    () => false,
  );

  return (
    <div aria-hidden="true" className="parcellink-hero-animation pointer-events-none absolute inset-0 z-1 overflow-hidden motion-reduce:hidden">
      <div className="absolute bottom-0 left-[2%] aspect-square h-[22%] translate-y-[30%] opacity-70 sm:h-[24%] lg:left-auto lg:right-[9%] lg:h-[38%]">
        {allowMotion ? <HeroLottie /> : null}
      </div>
    </div>
  );
};

export default HeroAnimation;
