#!/usr/bin/env node
// Scans the working tree for credentials before they can be committed.
// Run manually (`npm run security:secrets`) and in CI; add it as a
// pre-commit hook if you use one. Exits 1 if anything is found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// Generated / git-ignored folders (the e2e stack writes throwaway local
// config and a self-signed TLS key into e2e/.logs at runtime).
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', '.vercel', '.logs', '.bin', '.results']);
const SKIP_FILES = new Set(['package-lock.json']);
const MAX_BYTES = 1_000_000;

const PATTERNS = [
  { name: 'JWT (Supabase anon/service-role key)', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'Mapbox secret token', regex: /\bsk\.eyJ[A-Za-z0-9_.-]{20,}/ },
  { name: 'Cloudflare Turnstile secret', regex: /\b0x4AAAAAAA[A-Za-z0-9_-]{16,}/ },
  { name: 'Stripe secret key', regex: /\b(sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { name: 'Private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // A literal password in a URL — but not a $VARIABLE reference, which is
  // how scripts should build connection strings.
  { name: 'Postgres URL with password', regex: /postgres(ql)?:\/\/[^:\s/]+:(?!\$)[^@\s]{6,}@/ },
];

// Cloudflare's documented always-pass TEST keys are fine to commit.
const ALLOWED = [/1x0000000000000000000000000000000AA/, /1x00000000000000000000AA/];

const findings = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path);
      continue;
    }
    // Real env files are git-ignored; only the template is ever committed.
    if ((entry.startsWith('.env') && entry !== '.env.example') || SKIP_FILES.has(entry) || stat.size > MAX_BYTES) continue;

    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (ALLOWED.some((allowed) => allowed.test(line))) return;
      for (const { name, regex } of PATTERNS) {
        if (regex.test(line)) findings.push(`${relative(ROOT, path)}:${index + 1}  ${name}`);
      }
    });
  }
};

walk(ROOT);

if (findings.length > 0) {
  console.error(`Possible secrets found (${findings.length}):`);
  findings.forEach((finding) => console.error(`  ${finding}`));
  console.error('\nMove these into .env.local (git-ignored). If one was ever committed, rotate it — deleting it is not enough.');
  process.exit(1);
}
console.log('No secrets found.');
