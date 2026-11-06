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
  await page.getByLabel('Kürzel').fill('MOTO');
  await page.getByLabel('Fahrzeugtyp').selectOption('motorcycle');
  await page.getByLabel('Startgeld in Euro').fill('25,50');
  await page.getByLabel('Text der Bedingungen').fill(terms);
  await page
    .getByRole('button', { name: 'Speichern und Nennung öffnen' })
    .click();

  await expect(page.getByRole('status')).toContainText(
    'Veranstaltung gespeichert und Nennung geöffnet.',
  );
  const publicLink = page.getByRole('link', { name: /\/events\/.*\/register/ });
  await expect(publicLink).toBeVisible();
  const url = await publicLink.getAttribute('href');
  expect(url).toBeTruthy();

  await page.goto(url!);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(terms)).toBeVisible();
  await expect(page.getByLabel('Klasse')).toContainText('Motorrad');
});
