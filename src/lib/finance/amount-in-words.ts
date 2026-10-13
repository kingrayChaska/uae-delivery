// "AED 8,150.00" → "Eight Thousand One Hundred Fifty UAE Dirhams Only".
//
// Works on whole fils (integers), never on floating-point arithmetic, so
// the words always say exactly what the rounded figure says: the amount is
// first rounded to 2 decimal places as text (half away from zero), then
// split into dirhams and fils.

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

// Largest amount spelled out: just under one quadrillion dirhams, well
// within the integers a JavaScript number holds exactly.
export const MAX_AMOUNT_IN_WORDS = 999_999_999_999_999;

const underThousand = (n: number): string => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20) parts.push(rest % 10 ? `${TENS[Math.floor(rest / 10)]}-${ONES[rest % 10]}` : TENS[Math.floor(rest / 10)]);
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(' ');
};

export const integerInWords = (value: number): string => {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError(`Cannot spell out ${value}`);
  }
  if (value === 0) return ONES[0];
  const groups: string[] = [];
  let rest = value;
  for (let scale = 0; rest > 0; scale += 1) {
    const group = rest % 1000;
    if (group) groups.unshift(SCALES[scale] ? `${underThousand(group)} ${SCALES[scale]}` : underThousand(group));
    rest = Math.floor(rest / 1000);
  }
  return groups.join(' ');
};

// "-8150.005" → { negative: true, dirhams: 8150, fils: 1 }. Accepts the
// numeric text the database returns or a JavaScript number.
export const splitAmount = (amount: number | string): { negative: boolean; dirhams: number; fils: number } => {
  const text = typeof amount === 'number' ? amount.toFixed(6) : amount.trim();
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`Not an amount: ${amount}`);
  const [, sign, whole, fraction = ''] = match;
  let dirhams = Number(whole);
  let fils = Number((fraction + '00').slice(0, 2));
  // Round half away from zero on the third decimal.
  if (Number(fraction[2] ?? '0') >= 5) fils += 1;
  if (fils === 100) {
    dirhams += 1;
    fils = 0;
  }
  if (!Number.isSafeInteger(dirhams)) throw new RangeError(`Cannot spell out ${amount}`);
  return { negative: sign === '-' && (dirhams > 0 || fils > 0), dirhams, fils };
};

export const amountInWords = (amount: number | string): string => {
  const { negative, dirhams, fils } = splitAmount(amount);
  const dirhamWords = `${integerInWords(dirhams)} UAE ${dirhams === 1 ? 'Dirham' : 'Dirhams'}`;
  const filsWords = fils ? ` and ${integerInWords(fils)} Fils` : '';
  return `${negative ? 'Minus ' : ''}${dirhamWords}${filsWords} Only`;
};
