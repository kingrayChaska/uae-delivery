import { z } from 'zod';

// Zod v4 probes for eval support with `new Function` to JIT-compile
// validators. The probe's error is caught, but a strict Content-Security-
// Policy (no 'unsafe-eval' — see lib/security/csp.ts) still reports it as a
// violation on every page with a form. jitless skips the probe; validation
// behaves identically. Every schema imports z from here so this runs first.
z.config({ jitless: true });

export { z };
