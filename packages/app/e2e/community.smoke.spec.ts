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
});

// The shell, API and worker are started by .github/workflows/ci.yml before
// Playwright. The browser journey below records the remaining product gaps;
// these are intentionally fixme (rather than API/DB shortcuts) until the
// corresponding user-facing screens exist.
test.fixme('admin creates an event, classes and registration fields, then opens registration', async () => {
  // The current admin navigation only exposes Nennungen, Module and form
  // settings for an already-existing event. There is no event-creation or
  // class-management screen, nor a registration-open control.
});

test.fixme('participant submits an open registration, verifies email from Mailpit and uploads a document', async () => {
  // The public form supports submission/verification/upload only when a
  // configured open event and its classes/form fields exist. Step 3 cannot
  // create that prerequisite through the browser; do not seed via DB/API.
});

test.fixme('admin reviews submitted documents, sets acceptance and payment, and sees history', async () => {
  // The admin list/detail workflow requires a real submitted registration;
  // step 4 is blocked. The detail UI also explicitly reports that real
  // documents and upload counts are not yet available.
});

test.fixme('admin exports the entry list as CSV', async () => {
  // The current Nennungen screen has no export action or export endpoint.
});
