import { expect, test } from '@playwright/test';

import { CUSTOMER, PASSWORD, PLACES, expectedPrice, pickAddress, sql } from '../helpers';

test.describe.serial('Customer journey: landing -> register -> book -> track', () => {
  test('visitor lands on the marketing site, not a login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Reliable delivery across the UAE/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a Delivery' }).first()).toBeVisible();
  });

  test('signed-out visitor is sent to login when opening a dashboard', async ({ page }) => {
    await page.goto('/dashboard/manager');
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard%2Fmanager/);
  });

  test('customer registers and lands on their dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill(CUSTOMER.name);
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Phone number').fill(CUSTOMER.phone);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/dashboard\/customer$/);
    await expect(page.getByRole('heading', { name: `Welcome, ${CUSTOMER.name}` })).toBeVisible();
    expect(sql(`select role from profiles where email = '${CUSTOMER.email}'`)).toBe('customer');
  });

  test('customer cannot open another role\'s dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/dashboard\/customer/);

    for (const other of ['manager', 'operator', 'driver']) {
      await page.goto(`/dashboard/${other}`);
      await expect(page).toHaveURL(/\/dashboard\/customer$/);
    }
  });

  test('booking: same pickup and destination is rejected, then a real trip is priced and booked', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/dashboard\/customer/);

    await page.goto('/dashboard/customer/book');
    await pickAddress(page, 'Pickup address', PLACES.marina.query, PLACES.marina.suggestion);
    await page.locator('#pickup-contactName').fill(CUSTOMER.name);
    await page.locator('#pickup-contactPhone').fill(CUSTOMER.phone);
    await page.getByRole('button', { name: 'Next' }).click();

    await pickAddress(page, 'Delivery address', PLACES.marina.query, PLACES.marina.suggestion);
    await page.getByLabel('Recipient name').fill('Sara Recipient');
    await page.locator('#dropoff-contactPhone').fill('0507654321');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Pickup and delivery are the same place')).toBeVisible();

    await pickAddress(page, 'Delivery address', PLACES.burj.query, PLACES.burj.suggestion);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByLabel('Description').fill('Documents');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText('Cash on Delivery', { exact: true }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    const price = expectedPrice(PLACES.marina, PLACES.burj);
    await expect(page.getByText(`AED ${price}`)).toBeVisible();

    // Double-click on purpose: must still produce exactly one shipment.
    await page.getByRole('button', { name: 'Confirm & Book' }).dblclick();
    await page.waitForURL(/\/dashboard\/customer\/deliveries\/[0-9a-f-]{36}$/);

    const tracking = (await page.locator('p.font-brand-mono').first().textContent())?.trim() ?? '';
    expect(tracking).toMatch(/^DLV-\d{8}-[23456789A-HJKMNP-Z]{8}$/);
    expect(sql(`select count(*) from shipments s join profiles p on p.id = s.customer_id where p.email = '${CUSTOMER.email}'`)).toBe('1');
    expect(sql(`select price || ' ' || status from shipments where tracking_number = '${tracking}'`)).toBe(`${price} confirmed`);
    test.info().annotations.push({ type: 'tracking', description: tracking });
  });

  test('anyone can track the shipment publicly by tracking number', async ({ page }) => {
    const tracking = sql(`select tracking_number from shipments order by created_at desc limit 1`);
    await page.goto('/tracking');
    await page.getByPlaceholder(/DLV-/).fill(tracking);
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page.getByText(tracking).first()).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
  });
});
