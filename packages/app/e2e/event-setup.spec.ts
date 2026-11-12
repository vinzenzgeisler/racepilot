import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('admin creates a class, terms and opens its public registration in the UI', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local';
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');

  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Nennungen' })).toBeVisible();
  await page.getByRole('button', { name: 'Einrichten' }).click();

  const suffix = randomUUID().slice(0, 8);
  const name = `UI Setup ${suffix}`;
  const terms = `Teilnahmebedingungen ${suffix}`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Beginn').fill('2027-06-01');
  await page.getByLabel('Ende').fill('2027-06-02');
  await page.getByLabel('Klassenname').fill('Motorrad');
  await page.getByLabel('Kürzel', { exact: true }).fill('MOTO');
  await page.getByLabel('Fahrzeugtyp').selectOption('motorcycle');
  await page.getByLabel('Startgeld in Euro').fill('25,50');
  await page.getByLabel('Text der Bedingungen').fill(terms);
  await page
    .getByRole('button', { name: 'Speichern und Nennung öffnen' })
    .click();

  await expect(
    page.getByRole('status').filter({
      hasText: 'Veranstaltung gespeichert und Nennung geöffnet.',
    }),
  ).toBeVisible();
  const publicLink = page.getByRole('link', { name: /\/events\/.*\/register/ });
  await expect(publicLink).toBeVisible();
  const url = await publicLink.getAttribute('href');
  expect(url).toBeTruthy();
  if (!url) throw new Error('public registration link was not provided');

  await page.goto(url);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByLabel('Vorname').fill(`UI${suffix}`);
  await page.getByLabel('Nachname').fill('Setup');
  await page
    .getByLabel('Kontakt-E-Mail')
    .fill(`participant-${suffix}@example.test`);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  await page.getByLabel('Telefon', { exact: true }).fill('+49 151 1234567');
  await page.getByRole('button', { name: 'Weiter zu Startmeldungen' }).click();
  await page.getByLabel('Klasse').selectOption({ label: 'Motorrad (MOTO)' });
  await page.getByLabel('Hersteller').fill('Honda');
  await page.getByLabel('Modell').fill('CB500');
  await page.getByRole('button', { name: 'Weiter zur Prüfung' }).click();
  await expect(page.getByText(terms)).toBeVisible();
  const consent = page.getByRole('checkbox');
  await expect(consent).toBeVisible();
  await consent.check();
  const submission = page.waitForResponse((response) =>
    response.url().includes('/registration/submissions'),
  );
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  const submissionResponse = await submission;
  expect(submissionResponse.status(), await submissionResponse.text()).toBe(
    202,
  );
  await expect(page.getByRole('status')).toContainText(
    'Die Nennung wurde angenommen.',
  );
});
