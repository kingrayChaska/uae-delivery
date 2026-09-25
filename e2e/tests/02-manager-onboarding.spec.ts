import { expect, test } from '@playwright/test';

import { DRIVER, INVITED_OPERATOR, MANAGER, OPERATOR, PASSWORD, latestEmailLink, login, sql } from '../helpers';

test.describe.serial('Manager journey: onboard operators and drivers', () => {
  test('the manager created per the README can sign in and lands on the manager dashboard', async ({ page }) => {
    await login(page, MANAGER.email);
    await expect(page).toHaveURL(/\/dashboard\/manager$/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('manager creates an operator with a temporary password', async ({ page }) => {
    await login(page, MANAGER.email);
    await page.goto('/dashboard/manager/operators/new');
    await page.locator('#fullName').fill(OPERATOR.name);
    await page.locator('#email').fill(OPERATOR.email);
    await page.locator('#phone').fill(OPERATOR.phone);
    await page.locator('#employeeId').fill(OPERATOR.employeeId);
    await page.getByText('Temporary password', { exact: true }).click();
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create operator' }).click();

    await expect(page).toHaveURL(/\/dashboard\/manager\/operators\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: OPERATOR.name })).toBeVisible();
    expect(sql(`select role || ' ' || s.employee_id from profiles p join staff_profiles s on s.profile_id = p.id where email = '${OPERATOR.email}'`)).toBe('operator OPS-001');
    expect(sql(`select count(*) from audit_logs where action = 'staff.create_operator'`)).toBe('1');
  });

  test('manager creates a driver with a temporary password', async ({ page }) => {
    await login(page, MANAGER.email);
    await page.goto('/dashboard/manager/drivers/new');
    await page.locator('#fullName').fill(DRIVER.name);
    await page.locator('#email').fill(DRIVER.email);
    await page.locator('#phone').fill(DRIVER.phone);
    await page.locator('#driverCode').fill(DRIVER.driverCode);
    await page.locator('#licenseNumber').fill('UAE-LIC-12345');
    await page.getByText('Temporary password', { exact: true }).click();
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create driver' }).click();

    await expect(page).toHaveURL(/\/dashboard\/manager\/drivers\/[0-9a-f-]{36}$/);
    expect(sql(`select p.role || ' ' || d.driver_code from profiles p join driver_profiles d on d.profile_id = p.id where email = '${DRIVER.email}'`)).toBe('driver DRV-001');
  });

  test('a duplicate employee ID is refused with a friendly message and no half-created account', async ({ page }) => {
    await login(page, MANAGER.email);
    await page.goto('/dashboard/manager/operators/new');
    await page.locator('#fullName').fill('Duplicate Person');
    await page.locator('#email').fill('duplicate@wasla.test');
    await page.locator('#phone').fill('0509998877');
    await page.locator('#employeeId').fill(OPERATOR.employeeId);
    await page.getByText('Temporary password', { exact: true }).click();
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create operator' }).click();

    await expect(page.getByText('That employee ID is already in use')).toBeVisible();
    // Rollback: the auth user created before the failing step must be gone.
    expect(sql(`select count(*) from auth.users where email = 'duplicate@wasla.test'`)).toBe('0');
  });

  test('email invitation: the invite link from the real email sets a password and signs the operator in', async ({ page, browser }) => {
    await login(page, MANAGER.email);
    await page.goto('/dashboard/manager/operators/new');
    await page.locator('#fullName').fill(INVITED_OPERATOR.name);
    await page.locator('#email').fill(INVITED_OPERATOR.email);
    await page.locator('#phone').fill(INVITED_OPERATOR.phone);
    await page.locator('#employeeId').fill(INVITED_OPERATOR.employeeId);
    // Email invitation is the default method.
    await page.getByRole('button', { name: 'Create operator' }).click();
    await expect(page).toHaveURL(/\/dashboard\/manager\/operators\/[0-9a-f-]{36}$/);

    const link = latestEmailLink(INVITED_OPERATOR.email);
    expect(link).toContain('/auth/confirm?token_hash=');

    const invitee = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await invitee.goto(link);
    await expect(invitee).toHaveURL(/\/reset-password$/);
    await invitee.getByLabel('New password', { exact: true }).fill(PASSWORD);
    await invitee.getByLabel('Confirm new password').fill(PASSWORD);
    await invitee.getByRole('button', { name: 'Update Password' }).click();
    await expect(invitee).toHaveURL(/\/dashboard\/operator$/);

    // And the new password works for a normal sign-in.
    const fresh = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await login(fresh, INVITED_OPERATOR.email);
    await expect(fresh).toHaveURL(/\/dashboard\/operator$/);
  });
});
