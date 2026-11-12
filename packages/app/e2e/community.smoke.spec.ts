import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';

// The payment test continues with the entry that the lifecycle test registered.
test.describe.configure({ mode: 'serial' });
const shared: {
  eventId: string;
  participant: string;
  participantName: string;
} = {
  eventId: '',
  participant: '',
  participantName: '',
};
const mailpitBaseUrl =
  process.env.RACEPILOT_MAILPIT_URL ??
  process.env.COMMUNITY_MAILPIT_BASE_URL ??
  'http://127.0.0.1:8025';
const apiBaseUrl =
  process.env.RACEPILOT_API_URL ??
  process.env.COMMUNITY_API_BASE_URL ??
  'http://127.0.0.1:3000';
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
  test.setTimeout(180_000);
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
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen' }),
  ).toBeVisible();
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
  const betaClass = await call(
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
  for (const [classId, baseCents] of [
    [cls.id, 1000],
    [betaClass.id, 1500],
  ]) {
    await call(`/admin/events/${event.id}/pricing/${classId}`, 'PUT', {
      baseCents,
      additionalEntryAdjustmentCents: 0,
      earlyBirdDeadline: null,
      earlyBirdDiscountCents: 0,
    });
  }
  await call(`/admin/events/${event.id}/registration-form-config`, 'PUT', {
    welcomeText: 'Alpha E2E registration',
    // The event asks for a phone number, hides the city and requires the engine size.
    fields: {
      phone: { state: 'required' },
      city: { state: 'hidden' },
      displacement: { state: 'required' },
    },
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

  const participantSuffix = randomUUID().slice(0, 8);
  const participant = `alpha-${participantSuffix}@example.test`;
  const participantName = `Ada Lovelace ${participantSuffix}`;
  shared.eventId = event.id;
  shared.participant = participant;
  shared.participantName = participantName;
  mkdirSync('packages/app/test-results/alpha', { recursive: true });
  const shots = async (name: string) => {
    const viewport = page.viewportSize();
    try {
      for (const [width, height] of [
        [1440, 900],
        [1920, 1080],
        [2200, 1080],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: `packages/app/test-results/alpha/${name}-${width}.png`,
        });
      }
    } finally {
      if (viewport) await page.setViewportSize(viewport);
    }
  };
  await page.goto(`/events/${slug}/register`);
  await expect(page.getByRole('heading', { name: event.name })).toBeVisible();
  await page.getByLabel('Vorname').fill('Ada');
  await page.getByLabel('Nachname').fill(`Lovelace ${participantSuffix}`);
  await page.getByLabel('Kontakt-E-Mail').fill(participant);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  // The event hides the city, so there is no such field; the phone number is required.
  await expect(page.getByLabel('Ort', { exact: true })).toHaveCount(0);
  await page.getByLabel('Straße und Hausnummer').fill('Musterweg 1');
  await page.getByLabel('PLZ', { exact: true }).fill('01067');
  await page.getByLabel('Notfallkontakt · Name').fill('Bernd Lovelace');
  await page.getByLabel('Notfallkontakt · Telefon').fill('+49 351 999');
  await page.getByLabel('Veröffentlichung').selectOption('initials');
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
  await page
    .getByRole('button', { name: 'Weiter zu Startmeldungen', exact: true })
    .click();
  // Without the required phone number the form stays on the driver step.
  await expect(page.getByLabel('Telefon', { exact: true })).toBeVisible();
  await page.getByLabel('Telefon', { exact: true }).fill('+49 351 123456');
  await page
    .getByRole('button', { name: 'Weiter zu Startmeldungen', exact: true })
    .click();
  await page.getByLabel('Klasse').selectOption(cls.id);
  await page.getByLabel('Hersteller').fill('Lotus');
  await page.getByLabel('Modell').fill('Seven');
  await page.getByLabel('Hubraum (cm³)').fill('1600');
  await page.getByLabel('Zylinder').fill('4');
  await page.getByLabel('Besitzer').fill('Ada Lovelace');
  await page.getByLabel('Fahrzeughistorie').fill('Neuaufbau 2019');
  await shots('public-vehicle-step');
  await page
    .getByRole('button', { name: 'Weiter zur Prüfung', exact: true })
    .click();
  await expect(page.getByRole('group', { name: 'Bitte prüfen' })).toBeVisible();
  await expect(page.getByText(consent)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveAttribute(
    'aria-required',
    'true',
  );
  await shots('public-consent-step');
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  await expect(page.getByRole('alert')).toContainText('Bitte bestätige');
  await page.getByRole('checkbox').check();
  await shots('public-consent-accepted');
  const submissionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/registration/submissions') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  const submissionResponse = await submissionResponsePromise;
  const submissionBody = await submissionResponse.json();
  expect(submissionResponse.status(), JSON.stringify(submissionBody)).toBe(202);
  let mail: { ID: string };
  await expect
    .poll(
      async () => {
        const res = await request.get(`${mailpitBaseUrl}/api/v1/messages`);
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
    `${mailpitBaseUrl}/api/v1/message/${mail.ID}`,
  );
  expect(
    fullMailResponse.ok(),
    'read verification message from Mailpit',
  ).toBeTruthy();
  const fullMail = await fullMailResponse.json();
  const text = `${fullMail.Text ?? ''}\n${fullMail.HTML ?? ''}`;
  const link = text.match(/https?:\/\/[^\s"<>]+/)?.[0];
  expect(link, 'verification link from Mailpit').toBeTruthy();
  if (!link) throw new Error('verification link from Mailpit is missing');

  // An admin follows the server-supplied warning filter and downloads the same
  // unverified entry as a semicolon-separated Excel CSV.
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(event.id);
  const navigation = page.locator('.nb-admin-nav');
  await navigation.getByRole('button', { name: 'Übersicht' }).click();
  await expect(page.getByRole('region', { name: 'Warnungen' })).toContainText(
    'ohne bestätigte E-Mail-Adresse',
  );
  const filteredRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/admin/entries?') &&
      new URL(request.url()).searchParams.get('verificationStatus') ===
        'unverified' &&
      new URL(request.url()).searchParams.get('eventId') === event.id,
  );
  await page.getByRole('button', { name: 'Nennungen anzeigen' }).click();
  await filteredRequest;
  await expect(
    page.getByRole('row').filter({ hasText: participantName }),
  ).toBeVisible();
  await navigation.getByRole('button', { name: 'Exporte' }).click();
  await page
    .getByRole('combobox', { name: 'E-Mail-Prüfung' })
    .selectOption('unverified');
  await expect(
    page.getByRole('combobox', { name: 'Trennzeichen' }),
  ).toHaveValue(';');
  await page.getByRole('button', { name: 'CSV-Export erstellen' }).click();
  const downloadButton = page
    .getByRole('button', { name: 'CSV herunterladen' })
    .first();
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  const csvPath = await csvDownload.path();
  expect(csvPath).toBeTruthy();
  if (!csvPath) throw new Error('CSV download path is missing');
  const csvBytes = readFileSync(csvPath);
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csvText = csvBytes.toString('utf8');
  expect(csvText).toContain(participantName);
  expect(csvText.split('\r\n')[0]).toContain('";"');

  await page.goto(link);
  await expect(page.getByRole('status')).toContainText(
    /E-Mail bestätigt|Email verified/i,
  );
  await shots('public-confirmation');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(event.id);
  const row = page.getByRole('row').filter({ hasText: participantName });
  await expect(row).toBeVisible();
  await shots('admin-populated-list');
  await row
    .getByRole('button', { name: `${participantName} Lotus Seven` })
    .click();
  const preview = page.getByRole('complementary', { name: 'Nennungsvorschau' });
  await expect(preview).toContainText('Ada Lovelace');
  await shots('admin-entry-preview');
  const nextActionButton = preview
    .locator('.nb-preview-actions > button')
    .first();
  await expect(nextActionButton).toBeVisible();
  await nextActionButton.click();
  await expect(preview).toContainText('Angenommen');
  await preview.getByRole('button', { name: 'Vollständig öffnen' }).click();
  const entryDetail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(entryDetail).toBeVisible();
  await expect(entryDetail).toContainText(participant);
  // What the participant filled in arrives unchanged in the detail.
  for (const value of [
    '+49 351 123456',
    'Musterweg 1, 01067',
    'Bernd Lovelace · +49 351 999',
    'Nur Initialen',
    '1600 cm³',
    'Ada Lovelace',
    'Neuaufbau 2019',
    'Auto',
  ])
    await expect(entryDetail).toContainText(value);
  // The accepted consent is shown from its stored evidence, with the exact wording.
  const consents = entryDetail.getByRole('region', { name: 'Einwilligungen' });
  await expect(consents).toContainText('participation');
  await consents.getByText('Wortlaut anzeigen').click();
  await expect(consents).toContainText(consent);
  const fileDownload = page.getByRole('link', { name: 'Datei herunterladen' });
  await expect(fileDownload).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    fileDownload.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^registration-upload-/);
  const downloadPath = await download.path();
  expect(downloadPath, 'downloaded registration file path').toBeTruthy();
  if (!downloadPath) throw new Error('download path is missing');
  expect(readFileSync(downloadPath)).toEqual(uploadedPng);
  await shots('admin-entry-detail');
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    /zugelassen|angenommen/i,
  );
  await expect(entryDetail).toContainText('Angenommen');
  await expect(
    entryDetail.getByRole('button', { name: 'Zulassen' }),
  ).toHaveCount(0);

  const demoEvents = (await call('/admin/events', 'GET', undefined)) as Array<{
    id: string;
    slug: string;
  }>;
  const demoEvent = demoEvents.find(
    (candidate) => candidate.slug === 'historischer-bergpreis-2027',
  );
  expect(
    demoEvent,
    'Historischer Bergpreis demo seed is available',
  ).toBeTruthy();
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(demoEvent!.id);
  const demoRows = page.getByRole('row');
  await expect
    .poll(() => demoRows.count(), { timeout: 90_000 })
    .toBeGreaterThan(12);
  await shots('demo-historic-list');
  const designShotDirectory =
    '/home/openclaw/Developer/design-handoff/verification/158-overview-ui';
  mkdirSync(designShotDirectory, { recursive: true });
  for (const [view, title] of [
    ['Übersicht', 'Übersicht'],
    ['Exporte', 'Exporte'],
  ]) {
    await page
      .locator('.nb-admin-nav')
      .getByRole('button', { name: view })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(page.getByRole('status', { name: '' })).toHaveCount(0);
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `${designShotDirectory}/${view.toLowerCase()}-${width}x${height}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page
    .locator('.nb-admin-nav')
    .getByRole('button', { name: 'Nennungen' })
    .click();
  await demoRows.nth(1).locator('button[data-entry-action]').click();
  const demoPreview = page.getByRole('complementary', {
    name: 'Nennungsvorschau',
  });
  await expect(demoPreview).toBeVisible();
  await shots('demo-historic-preview');

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
  expect(csv).toContain(participantName);
  expect(csv).toContain('Lotus Seven');
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
    .filter({ hasText: shared.participantName })
    .locator('button[data-entry-action]')
    .click();
  const entryDetail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(entryDetail).toBeVisible();
  await expect(entryDetail).toContainText(shared.participant);

  // The invoice is open until the payment is recorded in the UI.
  await expect(entryDetail).toContainText('Startgeld');
  await entryDetail
    .getByRole('button', { name: 'Zahlung erfassen' })
    .first()
    .click();
  let dialog = page.getByRole('dialog');
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

  await entryDetail.getByRole('button', { name: 'Klasse ändern' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Neue Klasse').selectOption({ label: 'Beta Class' });
  await dialog
    .getByLabel('Begründung (für das Protokoll erforderlich)')
    .fill('Alpha E2E class change');
  await dialog.getByRole('button', { name: 'Klasse ändern' }).click();
  await expect(entryDetail).toContainText('Klasse Beta Class');
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Klasse geändert',
  );

  await entryDetail.getByRole('button', { name: 'Betrag anpassen' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Neuer Betrag/).fill('12,00');
  await dialog
    .getByLabel('Begründung (für das Protokoll erforderlich)')
    .fill('Alpha E2E amount correction');
  await dialog.getByRole('button', { name: 'Betrag anpassen' }).click();
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Betrag angepasst',
  );

  await entryDetail.getByRole('button', { name: 'Notiz hinzufügen' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sichtbarkeit').selectOption('internal');
  await dialog.getByLabel('Notiz').fill('Alpha internal note');
  await dialog.getByRole('button', { name: 'Notiz speichern' }).click();
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Alpha internal note',
  );
  await entryDetail.getByRole('button', { name: 'Notiz hinzufügen' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sichtbarkeit').selectOption('driver');
  await dialog.getByLabel('Notiz').fill('Alpha driver note');
  await dialog.getByRole('button', { name: 'Notiz speichern' }).click();
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Fahrernotiz',
  );
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Alpha driver note',
  );

  await entryDetail.getByRole('button', { name: 'Nennung löschen …' }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Begründung (für das Protokoll erforderlich)')
    .fill('Alpha E2E delete');
  await dialog.getByRole('button', { name: 'Nennung löschen' }).click();
  await expect(entryDetail).toHaveCount(0);
  await expect(
    page.getByRole('row').filter({ hasText: 'Ada Lovelace' }),
  ).toHaveCount(0);
});
