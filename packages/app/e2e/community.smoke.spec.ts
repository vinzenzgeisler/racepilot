import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';

// The payment test continues with the entry that the lifecycle test registered.
test.describe.configure({ mode: 'serial' });
const apiBaseUrl = process.env.RACEPILOT_API_URL ?? 'http://127.0.0.1:3000';
const mailpitUrl = process.env.RACEPILOT_MAILPIT_URL ?? 'http://127.0.0.1:8025';
const shared: { eventId: string; participant: string } = {
  eventId: '',
  participant: '',
};
const adminPassword = () => {
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');
  return password;
};

test('Community registration and admin lifecycle with API setup', async ({
  page,
  request,
}) => {
  // Includes SMTP/job polling and desktop/mobile evidence for the whole lifecycle.
  test.setTimeout(120_000);
  const email = process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local';
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  let token = '';
  page.on('request', (req) => {
    const auth = req.headers().authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  });
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Nennungen' })).toBeVisible();
  await expect.poll(() => token).not.toBe('');

  // Labelled test setup via the logged-in admin API.
  const api = (
    path: string,
    method = 'GET',
    data?: unknown,
    headers: Record<string, string> = {},
  ) =>
    request.fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: ['Bearer', token].join(' '),
        ...headers,
        ...(data ? { 'content-type': 'application/json' } : {}),
      },
      ...(data ? { data } : {}),
    });
  const call = async (
    path: string,
    method: string,
    data: unknown,
    status = 200,
  ) => {
    const response = await api(path, method, data);
    expect(
      response.status(),
      `test setup ${method} ${path}: ${await response.text()}`,
    ).toBe(status);
    return response.json();
  };
  const slug = `alpha-${randomUUID().slice(0, 8)}`;
  const event = await call(
    '/admin/events',
    'POST',
    {
      slug,
      name: 'Alpha E2E Event',
      startsOn: '2027-06-01',
      endsOn: '2027-06-02',
    },
    201,
  );
  const cls = await call(
    `/admin/events/${event.id}/classes`,
    'POST',
    {
      name: 'Alpha Class',
      code: 'A',
      vehicleType: 'car',
      sortOrder: 0,
      maxParticipants: null,
      closed: false,
    },
    201,
  );
  await call(
    `/admin/events/${event.id}/classes`,
    'POST',
    {
      name: 'Beta Class',
      code: 'B',
      vehicleType: 'car',
      sortOrder: 1,
      maxParticipants: null,
      closed: false,
    },
    201,
  );
  await call(`/admin/events/${event.id}/pricing/${cls.id}`, 'PUT', {
    baseCents: 1000,
    additionalEntryAdjustmentCents: 0,
    earlyBirdDeadline: null,
    earlyBirdDiscountCents: 0,
  });
  await call(`/admin/events/${event.id}/registration-form-config`, 'PUT', {
    welcomeText: 'Alpha E2E registration',
    customFields: [
      {
        key: 'vehicle_photo',
        type: 'file',
        required: true,
        label: { de: 'Fahrzeugfoto', en: 'Vehicle photo' },
      },
    ],
  });
  const consent = 'I accept the Alpha E2E participation terms.';
  await call(`/admin/events/${event.id}/consents`, 'PUT', {
    terms: [
      {
        key: 'participation',
        version: '1',
        language: 'de',
        text: consent,
        hash: createHash('sha256').update(consent).digest('hex'),
        required: true,
      },
    ],
  });
  await call(`/admin/events/${event.id}/transitions`, 'POST', {
    status: 'open',
  });

  const participant = `alpha-${randomUUID().slice(0, 8)}@example.test`;
  shared.eventId = event.id;
  shared.participant = participant;
  mkdirSync('packages/app/test-results/alpha', { recursive: true });
  const shots = async (name: string) => {
    const viewport = page.viewportSize();
    try {
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.screenshot({
          path: `packages/app/test-results/alpha/${name}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      if (viewport) await page.setViewportSize(viewport);
    }
  };
  await page.goto(`/events/${slug}/register`);
  await expect(page.getByRole('heading', { name: event.name })).toBeVisible();
  await page.getByLabel('Vorname').fill('Ada');
  await page.getByLabel('Nachname').fill('Lovelace');
  await page.getByLabel('Kontakt-E-Mail').fill(participant);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  const uploadedPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pVQAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByLabel('Fahrzeugfoto').setInputFiles({
    name: 'vehicle.png',
    mimeType: 'image/png',
    buffer: uploadedPng,
  });
  await expect(page.getByRole('status')).toContainText('vehicle.png');
  await shots('public-driver-step');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Klasse').selectOption(cls.id);
  await page.getByLabel('Hersteller').fill('Lotus');
  await page.getByLabel('Modell').fill('Seven');
  await shots('public-vehicle-step');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText(consent)).toBeVisible();
  await page.getByRole('checkbox').check();
  await shots('public-consent-step');
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  await expect(page.getByRole('status')).toContainText('Bitte bestätige');
  let mail: { ID: string };
  await expect
    .poll(
      async () => {
        const res = await request.get(`${mailpitUrl}/api/v1/messages`);
        if (!res.ok()) return false;
        const body = (await res.json()) as {
          messages?: Array<{ ID: string; To?: unknown }>;
        };
        mail = body.messages?.find((message) =>
          JSON.stringify(message).includes(participant),
        );
        return Boolean(mail);
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const fullMailResponse = await request.get(
    `${mailpitUrl}/api/v1/message/${mail.ID}`,
  );
  expect(
    fullMailResponse.ok(),
    'read verification message from Mailpit',
  ).toBeTruthy();
  const fullMail = await fullMailResponse.json();
  const text = `${fullMail.Text ?? ''}\n${fullMail.HTML ?? ''}`;
  const link = text.match(/https?:\/\/[^\s"<>]+/)?.[0];
  expect(link, 'verification link from Mailpit').toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole('status')).toContainText(
    /E-Mail bestätigt|Email verified/i,
  );
  await shots('public-confirmation');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(event.id);
  const row = page.getByRole('row').filter({ hasText: 'Ada Lovelace' });
  await expect(row).toBeVisible();
  await shots('admin-populated-list');
  await row.getByRole('button', { name: 'Ada Lovelace Lotus Seven' }).click();
  const preview = page.getByRole('complementary', { name: 'Nennungsvorschau' });
  await expect(preview).toContainText('Ada Lovelace');
  await preview.getByRole('button', { name: 'Zulassen' }).click();
  await expect(preview).toContainText('Angenommen');
  await preview.getByRole('button', { name: 'Vollständig öffnen' }).click();
  const entryDetail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(entryDetail).toBeVisible();
  await expect(entryDetail).toContainText(participant);
  const fileDownload = page.getByRole('link', { name: 'Datei herunterladen' });
  await expect(fileDownload).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    fileDownload.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^registration-upload-/);
  expect(readFileSync(await download.path()!)).toEqual(uploadedPng);
  await shots('admin-entry-detail');
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    /zugelassen|angenommen/i,
  );
  await expect(entryDetail).toContainText('Angenommen');
  await expect(
    entryDetail.getByRole('button', { name: 'Zulassen' }),
  ).toHaveCount(0);

  const csvRequest = await api(
    `/admin/events/${event.id}/entries.csv`,
    'GET',
    undefined,
    { 'Idempotency-Key': randomUUID() },
  );
  expect(csvRequest.status(), 'request CSV artifact through admin API').toBe(
    202,
  );
  const job = await csvRequest.json();
  let csv = '';
  await expect
    .poll(
      async () => {
        const res = await api(`/admin/artifact-jobs/${job.jobId}`);
        if (res.status() === 200) csv = await res.text();
        return res.status();
      },
      { timeout: 30000 },
    )
    .toBe(200);
  expect(csv).toContain('Ada Lovelace');
  expect(csv).toContain('Lotus Seven');
});

test.fixme('participant uploads a PDF supporting document during registration', async () => {
  /* Image custom-field uploads (PNG/JPEG/WebP) work; PDF documents are not accepted. */
});
test.fixme('admin reviews each uploaded document from entry detail', async () => {
  /* Uploaded images are downloadable from entry detail; per-document review status is absent. */
});
test('admin records payment from entry detail UI', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  let token = '';
  page.on('request', (req) => {
    const auth = req.headers().authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page
    .locator('#username')
    .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
  await page.locator('#password').fill(adminPassword());
  await page.locator('#kc-login').click();
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(shared.eventId);
  await page
    .getByRole('row')
    .filter({ hasText: 'Ada Lovelace' })
    .locator('button[data-entry-action]')
    .click();
  await expect(page.locator('button[data-selected-entry]')).toBeVisible();
  await page.keyboard.press('Enter');
  const entryDetail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(entryDetail).toContainText(shared.participant);

  // The invoice is open until the payment is recorded in the UI.
  await expect(entryDetail).toContainText('Startgeld');
  await entryDetail
    .getByRole('button', { name: 'Zahlung erfassen' })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Betrag/)).toHaveValue('10,00');
  await dialog
    .getByLabel('Begründung (für das Protokoll erforderlich)')
    .fill('Alpha E2E payment');
  await dialog.getByRole('button', { name: 'Zahlung erfassen' }).click();

  await expect(entryDetail.locator('.nb-detail-labels')).toContainText(
    /Zahlung · Bezahlt/i,
  );
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Zahlung eingegangen',
  );
  await expect(
    entryDetail.getByRole('button', { name: 'Zahlung erfassen' }),
  ).toHaveCount(0);
  expect(token, 'bearer token captured from admin requests').not.toBe('');
  const detail = await request.fetch(
    `${apiBaseUrl}/admin/entries?eventId=${shared.eventId}`,
    { headers: { authorization: ['Bearer', token].join(' ') } },
  );
  expect(await detail.text()).toMatch(/"paidCents":1000/);
});
test.fixme('admin starts CSV export from Nennungen screen', async () => {
  /* API/worker exist; export control absent. */
});
test.fixme('admin creates event/classes/form and opens registration in UI', async () => {
  /* Setup endpoints exist; setup controls absent. */
});
