import { expect, test, type APIRequestContext } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const mailpitBaseUrl =
  process.env.RACEPILOT_MAILPIT_URL ??
  process.env.COMMUNITY_MAILPIT_BASE_URL ??
  'http://127.0.0.1:8025';
const apiBaseUrl =
  process.env.RACEPILOT_API_URL ??
  process.env.COMMUNITY_API_BASE_URL ??
  'http://127.0.0.1:3000';

/** The message sent to `address` whose text contains `marker`, once Mailpit has it. */
async function mailTo(
  request: APIRequestContext,
  address: string,
  marker: string,
) {
  let text = '';
  await expect
    .poll(
      async () => {
        const list = await request.get(`${mailpitBaseUrl}/api/v1/messages`);
        if (!list.ok()) return false;
        const body = (await list.json()) as {
          messages?: Array<{ ID: string }>;
        };
        for (const message of body.messages ?? []) {
          if (!JSON.stringify(message).includes(address)) continue;
          const full = await request.get(
            `${mailpitBaseUrl}/api/v1/message/${message.ID}`,
          );
          const content = (await full.json()) as {
            Text?: string;
            HTML?: string;
          };
          const candidate = `${content.Text ?? ''}\n${content.HTML ?? ''}`;
          if (candidate.includes(marker)) {
            text = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return text;
}
const linkIn = (text: string, marker: string) =>
  text.match(new RegExp(`https?://[^\\s"<>]*${marker}[^\\s"<>]*`))?.[0] ?? '';

test('A co-driver completes data and consents through the personal link; the office sees it in the detail', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240_000);
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page
    .locator('#username')
    .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
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

  // Labelled test setup through the admin API.
  const call = async (
    path: string,
    method: string,
    data: unknown,
    status = 200,
  ) => {
    const response = await request.fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: ['Bearer', token].join(' '),
        'content-type': 'application/json',
      },
      data,
    });
    expect(
      response.status(),
      `test setup ${method} ${path}: ${await response.text()}`,
    ).toBe(status);
    return response.json();
  };
  const slug = `beifahrer-${randomUUID().slice(0, 8)}`;
  const event = await call(
    '/admin/events',
    'POST',
    {
      slug,
      name: 'Beifahrer E2E',
      startsOn: '2027-06-01',
      endsOn: '2027-06-02',
    },
    201,
  );
  const klass = await call(
    `/admin/events/${event.id}/classes`,
    'POST',
    {
      name: 'Rallye',
      code: 'RAL',
      vehicleType: 'car',
      sortOrder: 0,
      maxParticipants: 1,
      closed: false,
      passengerMode: 'optional',
    },
    201,
  );
  await call(`/admin/events/${event.id}/pricing/${klass.id}`, 'PUT', {
    baseCents: 1000,
    additionalEntryAdjustmentCents: 0,
    earlyBirdDeadline: null,
    earlyBirdDiscountCents: 0,
  });
  await call(`/admin/events/${event.id}/registration-form-config`, 'PUT', {
    features: { passenger: true, spareVehicle: true, multipleEntries: true },
  });
  const terms = 'Ich akzeptiere die Teilnahmebedingungen des Beifahrer-Tests.';
  await call(`/admin/events/${event.id}/consents`, 'PUT', {
    terms: [
      {
        key: 'participation',
        version: '1',
        language: 'de',
        text: terms,
        hash: createHash('sha256').update(terms).digest('hex'),
        required: true,
      },
    ],
  });
  await call(`/admin/events/${event.id}/transitions`, 'POST', {
    status: 'open',
  });

  // The driver names a co-driver and a spare vehicle in the public form.
  const suffix = randomUUID().slice(0, 8);
  const driverMail = `fahrer-${suffix}@example.test`;
  const passengerMail = `beifahrer-${suffix}@example.test`;
  await page.goto(`/events/${slug}/register`);
  await page.getByLabel('Vorname', { exact: true }).fill('Fiona');
  await page.getByLabel('Nachname', { exact: true }).fill(`Fahrerin ${suffix}`);
  await page.getByLabel('Kontakt-E-Mail').fill(driverMail);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  await page
    .getByRole('button', { name: 'Weiter zu Startmeldungen', exact: true })
    .click();
  await page.getByLabel('Klasse').selectOption(klass.id);
  await page.getByLabel('Hersteller', { exact: true }).fill('Lancia');
  await page.getByLabel('Modell', { exact: true }).fill('Stratos');
  await page.getByLabel('Beifahrer hinzufügen').check();
  await page.getByLabel('Vorname Beifahrer').fill('Bruno');
  await page.getByLabel('Nachname Beifahrer').fill(`Beifahrer ${suffix}`);
  await page.getByLabel('E-Mail Beifahrer').fill(passengerMail);
  await page.getByLabel('Ersatzfahrzeug erfassen').check();
  await page.getByLabel('Hersteller Ersatzfahrzeug').fill('Fiat');
  await page.getByLabel('Modell Ersatzfahrzeug').fill('131 Abarth');
  await page
    .getByRole('button', { name: 'Weiter zur Prüfung', exact: true })
    .click();
  await expect(page.getByText(`Bruno Beifahrer ${suffix}`)).toBeVisible();
  await page.getByRole('checkbox').check();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().includes('/registration/submissions') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  expect((await submitted).status()).toBe(202);

  // The co-driver gets no mail before the driver's address is verified.
  const verification = await mailTo(
    request,
    driverMail,
    '/registration/verify',
  );
  const verifyLink = linkIn(verification, '/registration/verify');
  expect(verifyLink).toBeTruthy();
  await page.goto(verifyLink);
  await expect(page.getByRole('status')).toContainText('E-Mail bestätigt');

  // Then the personal link arrives; it opens in a clean browser without any admin session.
  const invitation = await mailTo(request, passengerMail, '/passenger?token=');
  const personalLink = linkIn(invitation, '/passenger\\?token=');
  expect(personalLink).toBeTruthy();
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(personalLink);
  await expect(
    guest.getByRole('heading', { name: 'Deine Daten als Beifahrer' }),
  ).toBeVisible();
  await expect(guest.getByText('Beifahrer E2E')).toBeVisible();
  // Only what concerns this co-driver: the driver's mail address is not part of the page.
  await expect(guest.locator('body')).not.toContainText(driverMail);
  await expect(guest.getByLabel('Vorname')).toHaveValue('Bruno');
  const shots = process.env.PASSENGER_SCREENSHOT_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ] as const) {
      await guest.setViewportSize({ width, height });
      await guest.screenshot({
        path: `${shots}/link-${width}.png`,
        fullPage: true,
      });
    }
    await guest.setViewportSize({ width: 1440, height: 900 });
  }
  await guest.getByRole('button', { name: 'Daten abschließen' }).click();
  await expect(guest.getByRole('alert')).toBeVisible();
  await guest.getByLabel('Geburtsdatum').fill('1988-03-03');
  await guest.getByLabel('Telefon', { exact: true }).fill('+49 351 4711');
  await guest.getByLabel('Straße und Hausnummer').fill('Beifahrerweg 2');
  await guest.getByLabel('PLZ', { exact: true }).fill('01069');
  await guest.getByLabel('Ort', { exact: true }).fill('Dresden');
  await guest.getByRole('button', { name: 'Daten abschließen' }).click();
  await expect(guest.getByRole('alert')).toContainText('erforderlichen');
  await guest.getByRole('checkbox').check();
  await guest.getByRole('button', { name: 'Daten abschließen' }).click();
  await expect(guest.getByRole('status')).toContainText('gespeichert');
  // The link works once.
  await guest.goto(personalLink);
  await expect(guest.getByRole('alert')).toContainText('ungültig');
  await context.close();

  // The detail shows co-driver, spare vehicle and the co-driver's own consent.
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(event.id);
  const row = page.getByRole('row').filter({ hasText: `Fahrerin ${suffix}` });
  await expect(row).toBeVisible();
  await row
    .getByRole('button', { name: new RegExp(`Fahrerin ${suffix}.*Lancia`) })
    .click();
  await page
    .getByRole('complementary', { name: 'Nennungsvorschau' })
    .getByRole('button', { name: 'Vollständig öffnen' })
    .click();
  const detail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(detail).toBeVisible();
  const passenger = detail.getByRole('region', {
    name: 'Beifahrer',
    exact: true,
  });
  await expect(passenger).toContainText(`Bruno Beifahrer ${suffix}`);
  await expect(passenger).toContainText('Daten vollständig');
  await expect(passenger).toContainText('+49 351 4711');
  await expect(passenger).toContainText('Beifahrerweg 2, 01069 Dresden');
  const spare = detail.getByRole('region', {
    name: 'Ersatzfahrzeug',
    exact: true,
  });
  await expect(spare).toContainText('Fiat 131 Abarth');
  await expect(spare).toContainText('Ersatz');
  const consents = detail.getByRole('region', {
    name: 'Einwilligungen Beifahrer',
  });
  await expect(consents).toContainText('participation');
  // The driver's own consent evidence stays a separate list.
  await expect(
    detail.getByRole('region', { name: 'Einwilligungen', exact: true }),
  ).toContainText('participation');
  // A completed co-driver leaves no link action; the spare vehicle took no capacity (capacity is 1).
  await expect(
    detail.getByRole('button', { name: 'Persönlichen Link erstellen' }),
  ).toHaveCount(0);
  const occupied = await call(
    `/admin/entries?eventId=${event.id}&classId=${klass.id}`,
    'GET',
    undefined,
  );
  expect(occupied.total).toBe(1);

  // The office registers a co-driver afterwards and creates a link for them.
  const late = `spaet-${suffix}@example.test`;
  await call(`/admin/events/${event.id}/classes/${klass.id}`, 'PATCH', {
    maxParticipants: null,
  });
  const publicSubmit = await request.post(
    `${apiBaseUrl}/public/organizations/${(await call('/admin/organization', 'GET', undefined)).id}/events/${slug}/registration/submissions`,
    {
      data: {
        submissionId: randomUUID(),
        formVersion: '1.0',
        language: 'de',
        eventSlug: slug,
        person: {
          firstName: 'Lena',
          lastName: `Solo ${suffix}`,
          email: late,
          dateOfBirth: '1991-01-01',
        },
        entries: [
          {
            classId: klass.id,
            vehicle: {
              make: 'Audi',
              model: 'Quattro',
              year: 1984,
              registration: null,
            },
          },
        ],
        consents: [
          {
            key: 'participation',
            version: '1',
            hash: createHash('sha256').update(terms).digest('hex'),
            accepted: true,
          },
        ],
      },
    },
  );
  expect(publicSubmit.status()).toBe(202);
  await detail.getByRole('button', { name: /Nennungen$/ }).click();
  await page
    .getByRole('row')
    .filter({ hasText: `Solo ${suffix}` })
    .getByRole('button', { name: new RegExp(`Solo ${suffix}.*Audi`) })
    .click();
  await page
    .getByRole('complementary', { name: 'Nennungsvorschau' })
    .getByRole('button', { name: 'Vollständig öffnen' })
    .click();
  const lateDetail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(lateDetail.getByText('nicht angegeben').first()).toBeVisible();
  await lateDetail
    .getByRole('button', { name: 'Beifahrer nachmelden' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vorname').fill('Nico');
  await dialog.getByLabel('Nachname').fill('Nachgemeldet');
  await dialog.getByRole('button', { name: 'Beifahrer eintragen' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    lateDetail.getByRole('region', { name: 'Beifahrer', exact: true }),
  ).toContainText('Nico Nachgemeldet');
  await expect(lateDetail).toContainText('Daten ausstehend');
  await lateDetail
    .getByRole('button', { name: 'Persönlichen Link erstellen' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Link erstellen' })
    .click();
  const created = await page
    .getByRole('dialog')
    .getByLabel('Link')
    .inputValue();
  expect(created).toContain('/passenger?token=');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Schließen', exact: true })
    .click();
  await expect(lateDetail).toContainText('Link offen bis');
  const lateContext = await browser.newContext();
  const lateGuest = await lateContext.newPage();
  await lateGuest.goto(created);
  await expect(lateGuest.getByLabel('Vorname')).toHaveValue('Nico');
  await lateContext.close();
});
