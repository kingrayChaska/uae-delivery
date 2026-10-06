import { expect, test } from '@playwright/test';

import { CUSTOMER, PASSWORD, PLACES, expectedPrice, pickAddress, sql } from '../helpers';

test.describe.serial('Customer journey: landing -> register -> book -> track', () => {
  test('visitor lands on the marketing site, not a login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Same-day and next-day courier service/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a delivery' }).first()).toBeVisible();
  });

  test('signed-out visitor is sent to login when opening a dashboard', async ({ page }) => {
    await page.goto('/dashboard/manager');
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard%2Fmanager/);
  });

  test('customer registers, chooses Individual, and lands on their dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill(CUSTOMER.name);
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Phone number').fill(CUSTOMER.phone);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();

    // New accounts answer "How will you use ParcelLink?" first.
    await expect(page).toHaveURL(/\/dashboard\/customer\/onboarding$/);
    await page.getByRole('button', { name: 'Continue as Individual' }).click();
    await expect(page).toHaveURL(/\/dashboard\/customer$/);
    await expect(page.getByRole('heading', { name: `Welcome, ${CUSTOMER.name.split(' ')[0]}` })).toBeVisible();
    expect(sql(`select account_type || ' ' || (account_type_selected_at is not null) from profiles where email = '${CUSTOMER.email}'`)).toBe('individual true');
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
    await pickAddress(page, 'Pickup location', PLACES.marina.query, PLACES.marina.suggestion);
    await page.locator('#pickup-contactName').fill(CUSTOMER.name);
    await page.locator('#pickup-contactPhone').fill(CUSTOMER.phone);
    await page.getByRole('button', { name: 'Continue' }).click();

    await pickAddress(page, 'Delivery location', PLACES.marina.query, PLACES.marina.suggestion);
    await page.getByLabel('Recipient name').fill('Sara Recipient');
    await page.locator('#dropoff-contactPhone').fill('0507654321');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Pickup and delivery are the same place')).toBeVisible();

    await pickAddress(page, 'Delivery location', PLACES.burj.query, PLACES.burj.suggestion);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Package step: same-day is preselected; the recipient has prepaid.
    // No delivery fee is shown before the delivery type is chosen — only on review.
    await expect(page.locator('label:has(input[name="deliveryType"])')).toHaveCount(2);
    await expect(page.locator('label:has(input[name="deliveryType"])').filter({ hasText: 'AED' })).toHaveCount(0);
    await page.getByLabel('What are you sending?').fill('Documents');
    await page.getByRole('button', { name: 'Add to booking' }).click();
    // Review: pay the delivery fee in cash.
    await page.getByText('Cash', { exact: true }).click();

    const price = expectedPrice(PLACES.marina, PLACES.burj);
    await expect(page.getByText(`AED ${price}`).first()).toBeVisible();

    // Double-click on purpose: must still produce exactly one shipment.
    await page.getByRole('button', { name: /Confirm & book/ }).dblclick();
    await page.waitForURL(/\/dashboard\/customer\/deliveries\/[0-9a-f-]{36}\?booked=1$/);

    // Short, customer-facing tracking ID (migration 0022), with a copy button.
    const tracking = sql(`select s.tracking_number from shipments s join profiles p on p.id = s.customer_id where p.email = '${CUSTOMER.email}' order by s.created_at desc limit 1`);
    expect(tracking).toMatch(/^[23456789A-HJKMNP-Z]{8}$/);
    await expect(page.getByText(tracking).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy tracking ID/ })).toBeVisible();
    expect(sql(`select count(*) from shipments s join profiles p on p.id = s.customer_id where p.email = '${CUSTOMER.email}'`)).toBe('1');
    expect(sql(`select price || ' ' || status from shipments where tracking_number = '${tracking}'`)).toBe(`${price} confirmed`);
    test.info().annotations.push({ type: 'tracking', description: tracking });
  });

  test('anyone can track the shipment publicly by tracking number', async ({ page }) => {
    const tracking = sql(`select tracking_number from shipments order by created_at desc limit 1`);
    await page.goto('/tracking');
    // Tracking IDs are case-insensitive.
    await page.getByPlaceholder(/Tracking ID/).fill(tracking.toLowerCase());
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page.getByText(tracking).first()).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
  });
});
