import { calculatePrice } from '/home/claude/uae-delivery/src/lib/pricing/calculate.ts';

// Deterministic PRNG so failures are reproducible.
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (max: number, step: number) => Math.round((rand() * max) / step) * step;

const rows: string[] = [];
for (let i = 0; i < 5000; i++) {
  const rule = {
    id: 'x', name: 'x', currency: 'AED', isActive: true,
    baseDistanceKm: Number(pick(10, 0.1).toFixed(1)),
    basePrice: Number(pick(50, 0.01).toFixed(2)),
    additionalPricePerKm: Number(pick(5, 0.01).toFixed(2)),
  };
  const rawKm = rand() * 300;                        // unrounded "route" distance
  const b = calculatePrice(rawKm, 30, rule);
  rows.push([i, rule.baseDistanceKm, rule.basePrice, rule.additionalPricePerKm, b.distanceKm, b.totalPrice].join('\t'));
}
console.log(rows.join('\n'));
