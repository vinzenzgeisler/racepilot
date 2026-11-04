import { expect, test } from '@playwright/test';

test('first Community admin can log in and load the protected event list', async ({
  page,
}) => {
  const email = process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local';
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password)
    throw new Error('COMMUNITY_ADMIN_PASSWORD is required for the smoke test');
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  const eventStatuses: number[] = [];
  const pageErrors: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/admin/events')
      eventStatuses.push(response.status());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const eventsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/admin/events' &&
      response.status() === 200,
  );
  await page.locator('#kc-login').click();
  try {
    await eventsResponse;
  } catch {
    const location = new URL(page.url());
    const message = (await page.locator('body').innerText()).slice(0, 300);
    throw new Error(
      `Admin API did not authorize after login: path=${location.pathname}, responses=${eventStatuses.join(',')}, pageErrors=${pageErrors.join('; ')}, page=${message}`,
    );
  }
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('NENNBOX').first()).toBeVisible();
});
