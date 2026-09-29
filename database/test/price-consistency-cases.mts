import { calculateShipmentPrice } from '/home/claude/uae-delivery/src/lib/pricing/calculate.ts';

// Deterministic PRNG so failures are reproducible.
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (max: number, step: number) => Math.round((rand() * max) / step) * step;

const rows: string[] = [];
for (let i = 0; i < 5000; i++) {
  const rule = {
    id: 'x', name: 'x', currency: 'AED', isActive: true,
    deliveryType: rand() < 0.5 ? 'same_day' : 'next_day',
    accountType: 'individual',
    baseDistanceKm: Number(pick(10, 0.1).toFixed(1)),
    basePrice: Number(pick(50, 0.01).toFixed(2)),
    additionalPricePerKm: Number(pick(5, 0.01).toFixed(2)),
    includedWeightKg: Number(pick(30, 0.5).toFixed(2)),
    additionalPricePerKg: Number(pick(3, 0.01).toFixed(2)),
    codFee: Number(pick(10, 0.01).toFixed(2)),
    maxDistanceKm: 300,
  } as const;
  const rawKm = rand() * 300; // unrounded "route" distance
  const weightKg = rand() < 0.2 ? null : rand() * 60;
  const recipientPaymentType = rand() < 0.5 ? 'prepaid' : 'postpaid';
  const b = calculateShipmentPrice({ rule, distanceKm: rawKm, durationMinutes: 30, weightKg, recipientPaymentType });
  rows.push(
    [
      i, rule.deliveryType, rule.baseDistanceKm, rule.basePrice, rule.additionalPricePerKm,
      rule.includedWeightKg, rule.additionalPricePerKg, rule.codFee,
      b.distanceKm, b.weightKg ?? '\\N', recipientPaymentType,
      b.basePrice, b.distanceCharge, b.weightCharge, b.codCharge, b.totalPrice,
    ].join('\t'),
  );
}
console.log(rows.join('\n'));
