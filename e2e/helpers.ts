import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

export const PASSWORD = 'Passw0rd!2026';

export const MANAGER = { email: 'manager@wasla.test', name: 'Mariam Manager' };
export const CUSTOMER = { email: 'customer@wasla.test', name: 'Omar Customer', phone: '0501112233' };
export const OPERATOR = { email: 'operator@wasla.test', name: 'Layla Operator', phone: '0502223344', employeeId: 'OPS-001' };
export const DRIVER = { email: 'driver@wasla.test', name: 'Ahmed Driver', phone: '0503334455', driverCode: 'DRV-001' };
export const INVITED_OPERATOR = { email: 'invited@wasla.test', name: 'Noor Invited', phone: '0504445566', employeeId: 'OPS-002' };

// Direct SQL, as the postgres superuser, for things only an operator of the
// platform would do (e.g. creating the first manager, per the README) and
// for asserting database state the UI doesn't show.
export const sql = (query: string): string =>
  execFileSync('su', ['postgres', '-c', `psql -d ${process.env.E2E_DB ?? 'uae_e2e'} -tAX -c "${query.replace(/"/g, '\\"')}"`], {
    encoding: 'utf8',
  }).trim();

// The suite signs in far more often than the login rate limit allows from
// one IP (20 / 15 min). Clearing the counters here keeps the journeys
// independent; the limiter itself has its own dedicated test in 04.
export const resetRateLimits = () => sql('delete from rate_limits');

export const login = async (page: Page, email: string, password = PASSWORD) => {
  resetRateLimits();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard\//);
};

export const pickAddress = async (page: Page, label: string, query: string, suggestion: RegExp) => {
  await page.getByLabel(label).fill(query);
  await page.getByRole('button', { name: suggestion }).click();
};

// Emails the Auth server sent, captured by e2e/stack/smtp-sink.py.
export const latestEmailLink = (to: string): string => {
  const dir = join(__dirname, '.logs', 'mail');
  const file = readdirSync(dir).filter((name) => name.endsWith(`_${to}.eml`)).sort().pop();
  expect(file, `an email to ${to}`).toBeTruthy();
  const body = readFileSync(join(dir, file as string), 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = body.match(/href="([^"]+\/auth\/confirm[^"]+)"/);
  expect(match, 'a /auth/confirm link in the email').toBeTruthy();
  return (match as RegExpMatchArray)[1].replace(/&amp;/g, '&');
};

// Same pricing formula the app uses, computed independently from the fake
// Mapbox's route model (haversine x 1.3) — so the test checks the app's
// price rather than echoing it back.
export const expectedPrice = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  rule = { baseKm: 5, basePrice: 12, perKm: 1 },
) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  const roadKm = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.3;
  // Billed on the 2-decimal distance that gets stored (see lib/pricing/calculate.ts).
  const billedKm = Math.round(roadKm * 100) / 100;
  // Exact decimal arithmetic in hundredths, half-up — the same result
  // Postgres's numeric math gives. (Plain floats round 10.425 down to 10.42.)
  const extraHundredths = Math.max(0, Math.round(billedKm * 100) - Math.round(rule.baseKm * 100));
  const additionalFils = Math.floor((extraHundredths * Math.round(rule.perKm * 100) + 50) / 100);
  return ((Math.round(rule.basePrice * 100) + additionalFils) / 100).toFixed(2);
};

export const PLACES = {
  marina: { query: 'Dubai Marina', suggestion: /Dubai Marina Mall/, lat: 25.0768, lng: 55.1398 },
  burj: { query: 'Burj', suggestion: /Burj Khalifa/, lat: 25.1972, lng: 55.2744 },
  moe: { query: 'Mall of the', suggestion: /Mall of the Emirates/, lat: 25.1181, lng: 55.2006 },
};
