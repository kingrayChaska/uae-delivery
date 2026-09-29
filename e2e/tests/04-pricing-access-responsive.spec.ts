import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { CUSTOMER, DRIVER, MANAGER, OPERATOR, PLACES, expectedPrice, login, pickAddress, resetRateLimits, sql } from '../helpers';

test.describe.serial('Manager pricing, account deactivation, responsive layouts', () => {
  test('manager changes pricing; the next customer quote uses the new rule', async ({ page, browser }) => {
    await login(page, MANAGER.email);
    await page.goto('/dashboard/manager/pricing');
    await page.getByLabel('Rule name').fill('Premium 2027');
    // "Applies to" defaults to individual customers, same-day.
    await page.getByLabel('Included km').fill('3');
    await page.getByLabel('Base price (AED)').fill('15');
    await page.getByLabel('Per extra km').fill('1.5');
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect
      .poll(() => sql(`select name from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'`))
      .toBe('Premium 2027');
    expect(sql(`select count(*) from audit_logs where action = 'pricing.create_and_activate'`)).toBe('1');

    const customer = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await login(customer, CUSTOMER.email);
    await customer.goto('/dashboard/customer/book');
    await pickAddress(customer, 'Pickup location', PLACES.marina.query, PLACES.marina.suggestion);
    await customer.locator('#pickup-contactName').fill(CUSTOMER.name);
    await customer.locator('#pickup-contactPhone').fill(CUSTOMER.phone);
    await customer.getByRole('button', { name: 'Continue' }).click();
    await pickAddress(customer, 'Delivery location', PLACES.moe.query, PLACES.moe.suggestion);
    await customer.getByLabel('Recipient name').fill('Sara Recipient');
    await customer.locator('#dropoff-contactPhone').fill('0507654321');
    await customer.getByRole('button', { name: 'Continue' }).click();
    await customer.getByLabel('What are you sending?').fill('Shoes');
    await customer.getByRole('button', { name: 'Add to booking' }).click();
    await customer.getByText('Cash', { exact: true }).click();

    const price = expectedPrice(PLACES.marina, PLACES.moe, { baseKm: 3, basePrice: 15, perKm: 1.5 });
    await expect(customer.getByText(`AED ${price}`).first()).toBeVisible();
    await customer.getByRole('button', { name: /Confirm & book/ }).click();
    await customer.waitForURL(/\/deliveries\/[0-9a-f-]{36}\?booked=1$/);
    // Accepted by the database's price re-check under the NEW rule.
    expect(sql(`select s.price || ' ' || r.name from shipments s join pricing_rules r on r.id = s.pricing_rule_id order by s.created_at desc limit 1`)).toBe(`${price} Premium 2027`);
  });

  test('deactivated driver is locked out, with no redirect loop (Phase 13 regression)', async ({ page, browser }) => {
    const driver = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await login(driver, DRIVER.email);
    await expect(driver).toHaveURL(/\/dashboard\/driver/);

    await login(page, MANAGER.email);
    const driverId = sql(`select id from profiles where email = '${DRIVER.email}'`);
    await page.goto(`/dashboard/manager/drivers/${driverId}`);
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect.poll(() => sql(`select active from profiles where id = '${driverId}'`)).toBe('f');

    // The driver's session is still valid for a moment — the page must
    // settle on the login screen instead of bouncing between redirects.
    await driver.goto('/dashboard/driver');
    await expect(driver).toHaveURL(/\/login/);
    await expect(driver.getByRole('button', { name: 'Sign In' })).toBeVisible();

    // And they can't sign back in.
    await driver.getByLabel('Email').fill(DRIVER.email);
    await driver.getByLabel('Password', { exact: true }).fill('Passw0rd!2026');
    await driver.getByRole('button', { name: 'Sign In' }).click();
    await expect(driver).toHaveURL(/\/login/);
  });

  test('login is rate limited per account: the 6th wrong password in a row is refused', async ({ page }) => {
    resetRateLimits();
    await page.goto('/login');
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await page.getByLabel('Email').fill(CUSTOMER.email);
      await page.getByLabel('Password', { exact: true }).fill(`wrong-password-${attempt}`);
      await page.getByRole('button', { name: 'Sign In' }).click();
      const expected = attempt <= 5 ? 'Incorrect email or password' : 'Too many attempts';
      await expect(page.getByText(expected)).toBeVisible();
    }
    // Even the CORRECT password is refused while the account is locked out.
    await page.getByLabel('Password', { exact: true }).fill('Passw0rd!2026');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Too many attempts')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    resetRateLimits();
  });

  // Spec section 37: works on mobile, tablet and desktop. Fails if any page
  // scrolls sideways; also saves screenshots for visual review.
  const VIEWPORTS = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];
  const PAGES: { who: string; email: string | null; path: string }[] = [
    { who: 'public', email: null, path: '/' },
    { who: 'public', email: null, path: '/tracking' },
    { who: 'customer', email: CUSTOMER.email, path: '/dashboard/customer' },
    { who: 'customer', email: CUSTOMER.email, path: '/dashboard/customer/book' },
    { who: 'customer', email: CUSTOMER.email, path: '/dashboard/customer/track' },
    { who: 'customer', email: CUSTOMER.email, path: '/dashboard/customer/merchant/apply' },
    { who: 'manager', email: MANAGER.email, path: '/dashboard/manager/merchants' },
    { who: 'manager', email: MANAGER.email, path: '/dashboard/manager/pricing' },
    { who: 'operator', email: OPERATOR.email, path: '/dashboard/operator' },
    { who: 'manager', email: MANAGER.email, path: '/dashboard/manager/reports' },
    { who: 'manager', email: MANAGER.email, path: '/dashboard/manager/drivers' },
  ];

  test('no page scrolls horizontally on mobile, tablet or desktop', async ({ browser }) => {
    const dir = join(__dirname, '..', '.results', 'screens');
    mkdirSync(dir, { recursive: true });
    const overflows: string[] = [];

    for (const viewport of VIEWPORTS) {
      const sessions = new Map<string, Awaited<ReturnType<typeof browser.newContext>>>();
      for (const target of PAGES) {
        let context = sessions.get(target.who);
        if (!context) {
          context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: viewport.width, height: viewport.height } });
          if (target.email) await login(await context.newPage(), target.email);
          sessions.set(target.who, context);
        }
        const page = await context.newPage();
        await page.goto(target.path, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) overflows.push(`${viewport.name} ${target.path}: ${overflow}px too wide`);
        await page.screenshot({ path: join(dir, `${viewport.name}${target.path.replace(/\//g, '_') || '_home'}.png`), fullPage: true });
        await page.close();
      }
      for (const context of sessions.values()) await context.close();
    }

    expect(overflows, overflows.join('\n')).toEqual([]);
  });
});
