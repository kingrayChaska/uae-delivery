import { expect, test } from '@playwright/test';

import { CUSTOMER, DRIVER, OPERATOR, login, sql } from '../helpers';

// Uses the COD shipment booked in 01 and the staff created in 02.
test.describe.serial('Operator dispatch -> driver delivery with OTP proof -> customer sees it delivered', () => {
  const tracking = () => sql(`select tracking_number from shipments where status <> 'cancelled' order by created_at limit 1`);

  test('operator assigns the waiting shipment to the driver from the dispatch board', async ({ page }) => {
    await login(page, OPERATOR.email);
    await expect(page).toHaveURL(/\/dashboard\/operator$/);

    const number = tracking();
    await page.getByRole('button', { name: new RegExp(number) }).click();
    const driverRow = page.locator('div.rounded-md.border', { hasText: DRIVER.name });
    await driverRow.getByRole('button', { name: 'Assign' }).click();

    await expect.poll(() => sql(`select status from shipments where tracking_number = '${number}'`)).toBe('assigned');
    expect(sql(`select p.email from shipments s join profiles p on p.id = s.driver_id where s.tracking_number = '${number}'`)).toBe(DRIVER.email);
    expect(sql(`select count(*) from audit_logs where action = 'shipment.assign_driver'`)).toBe('1');
    // The assignment notification fires from the database trigger (0017).
    expect(sql(`select count(*) from notifications n join profiles p on p.id = n.profile_id where p.email = '${DRIVER.email}' and n.type = 'shipment.assigned'`)).toBe('1');
  });

  test('driver works the delivery through every status step', async ({ page }) => {
    await login(page, DRIVER.email);
    await page.goto('/dashboard/driver/current');
    await expect(page).toHaveURL(/\/dashboard\/driver\/deliveries\/[0-9a-f-]{36}$/);

    const steps: [string, string][] = [
      ['Accept Delivery', 'driver_accepted'],
      ['Arrived at Pickup', 'arrived_pickup'],
      ['Confirm Pickup', 'picked_up'],
      ['Start Delivery', 'in_transit'],
      ['Arrived', 'arrived_destination'],
    ];
    for (const [button, status] of steps) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect.poll(() => sql(`select status from shipments where tracking_number = '${tracking()}'`)).toBe(status);
    }
    await expect(page.getByRole('heading', { name: 'Proof of Delivery' })).toBeVisible();
  });

  test('a wrong OTP is refused; the code from the customer\'s own inbox completes the delivery', async ({ page, browser }) => {
    await login(page, DRIVER.email);
    await page.goto('/dashboard/driver/current');

    // A delivery photo is required (migration 0028); no recipient name is
    // asked for. Storage isn't part of the e2e stack, so answer the upload
    // here and record the object the way Storage would, for
    // complete_delivery()'s existence check.
    await page.route('**/storage/v1/object/proof-of-delivery/**', async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.split('/object/proof-of-delivery/')[1]);
      sql(`insert into storage.objects (bucket_id, name) values ('proof-of-delivery', '${path.replace(/'/g, "''")}')`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `proof-of-delivery/${path}` }) });
    });
    await expect(page.locator('#recipientName')).toHaveCount(0);
    await page.locator('#podPhoto').setInputFiles({ name: 'pod.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    await expect(page.getByText('Photo attached')).toBeVisible();
    // A delivery note is required too (migration 0037).
    await page.locator('#podNotes').fill('Handed to the recipient');

    await page.getByText('More proof (optional)').click();
    await page.getByRole('button', { name: 'Send code to customer' }).click();
    await expect(page.getByPlaceholder('4-digit code')).toBeVisible();

    // The OTP is stored only as a bcrypt hash (migration 0018)...
    expect(sql(`select left(delivery_otp, 3) from shipment_secrets ss join shipments s on s.id = ss.shipment_id where s.tracking_number = '${tracking()}'`)).toBe('$2a');

    // ...so the real way to get it is from the customer's notifications.
    const customer = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await login(customer, CUSTOMER.email);
    await customer.goto('/dashboard/customer/notifications');
    const body = await customer.getByText(/Share this code with your driver/).first().textContent();
    const code = body?.match(/(\d{4})\s*$/)?.[1];
    expect(code, 'OTP in the customer notification').toBeTruthy();

    const wrong = code === '0000' ? '1111' : '0000';
    await page.getByPlaceholder('4-digit code').fill(wrong);
    await page.getByRole('button', { name: 'Complete Delivery' }).click();
    await expect(page.getByText('Incorrect code')).toBeVisible();
    expect(sql(`select status from shipments where tracking_number = '${tracking()}'`)).toBe('arrived_destination');

    await page.getByPlaceholder('4-digit code').fill(code as string);
    await page.getByRole('button', { name: 'Complete Delivery' }).click();
    await expect.poll(() => sql(`select status from shipments where tracking_number = '${tracking()}'`)).toBe('delivered');
    expect(sql(`select recipient_otp_verified from proof_of_delivery pod join shipments s on s.id = pod.shipment_id where s.tracking_number = '${tracking()}'`)).toBe('t');
    expect(sql(`select notes from proof_of_delivery pod join shipments s on s.id = pod.shipment_id where s.tracking_number = '${tracking()}'`)).toBe('Handed to the recipient');
  });

  test('customer sees the delivery as delivered, with the full notification trail', async ({ page }) => {
    await login(page, CUSTOMER.email);
    await page.goto('/dashboard/customer/deliveries');
    await expect(page.getByText('Delivered').first()).toBeVisible();

    const types = sql(`select string_agg(n.type, ',' order by n.created_at) from notifications n join profiles p on p.id = n.profile_id where p.email = '${CUSTOMER.email}'`);
    for (const expected of ['shipment.booked', 'shipment.driver_arriving', 'shipment.picked_up', 'shipment.in_transit', 'delivery.otp', 'shipment.delivered']) {
      expect(types).toContain(expected);
    }
  });
});
