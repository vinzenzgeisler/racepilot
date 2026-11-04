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
  const authStatuses: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path === '/admin/events') eventStatuses.push(response.status());
    if (path.startsWith('/auth/') || path.includes('/protocol/openid-connect/'))
      authStatuses.push(`${path}:${response.status()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) =>
    pageErrors.push(
      `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    ),
  );
  const eventsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/admin/events' &&
      response.status() === 200,
    { timeout: 15_000 },
  );
  await page.locator('#kc-login').click();
  try {
    await eventsResponse;
  } catch {
    const location = new URL(page.url());
    const message = (await page.locator('body').innerText()).slice(0, 300);
    throw new Error(
      `Admin API did not authorize after login: path=${location.pathname}, responses=${eventStatuses.join(',')}, auth=${authStatuses.join(',')}, pageErrors=${pageErrors.join('; ')}, page=${message}`,
    );
  }
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Nennungen' })).toBeVisible();
  // CI keeps these reference captures with the run for design review.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/alpha/admin-entries-1440.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/alpha/admin-entries-390.png',
    fullPage: true,
  });
});

// The community stack is started by .github/workflows/ci.yml. These cases
// document missing user-facing capabilities; API setup is not a substitute
// for those user journeys.
test.fixme('admin creates an event, classes and registration fields, then opens registration', async () => {
  // Observed in AppShell/AdminModules: no event-creation screen, class
  // management screen, or event registration-open control is rendered.
});

test.fixme('participant uploads a supporting document during registration', async () => {
  // Observed in Registration.tsx and the public API routes: registration has
  // no document input/storage endpoint. A configured field of type=file is
  // accepted by the contract but not rendered or persisted by this UI flow.
});

test.fixme('admin reviews uploaded documents and records payment in the entry detail', async () => {
  // AdminEntries.tsx explicitly renders “Echte Nennungsunterlagen und
  // Upload-Zähler sind noch nicht verfügbar.” No payment-entry control is
  // present in the detail UI. Acceptance transitions/history are implemented.
});

test.fixme('admin starts CSV export from the Nennungen screen', async () => {
  // GET /admin/events/:eventId/entries.csv exists, but the Nennungen UI has
  // no export control. The API creates an asynchronous artifact job.
});
