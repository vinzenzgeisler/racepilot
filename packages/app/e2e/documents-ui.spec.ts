import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function signIn(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page
    .locator('#username')
    .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption({ label: 'Historischer Bergpreis 2027' });
}

function documentRow(page: import('@playwright/test').Page, name: string) {
  return page
    .locator('.admin-detail-view .nb-document-list li')
    .filter({ hasText: name });
}

test('Admin reviews and rejects real documents; list and preview refresh', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.getByRole('searchbox', { name: 'Suche' }).fill('Anna Beispiel');
  const row = page.getByRole('row').filter({ hasText: 'Anna Beispiel' });
  await expect(row).toContainText('Unterlagen 2/2', { timeout: 90_000 });
  await row.locator('button[data-entry-action]').click();
  const preview = page.getByRole('complementary', { name: 'Nennungsvorschau' });
  await expect(preview).toContainText('Hochgeladen');
  await preview.getByRole('button', { name: 'Vollständig öffnen' }).click();
  const detail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(detail).toBeVisible();
  await documentRow(page, 'Fahrerlizenz')
    .getByRole('button', { name: 'Prüfen' })
    .click();
  await expect(documentRow(page, 'Fahrerlizenz')).toContainText('Geprüft');
  await documentRow(page, 'Fahrzeugschein')
    .getByRole('button', { name: 'Ablehnen …' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: /Begründung/ })
    .fill('Dokument ist unleserlich.');
  await dialog.getByRole('button', { name: 'Ablehnen' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(documentRow(page, 'Fahrzeugschein')).toContainText('Abgelehnt');
  await expect(documentRow(page, 'Fahrzeugschein')).toContainText(
    'Dokument ist unleserlich.',
  );
  await detail.getByRole('button', { name: /Nennungen$/ }).click();
  await expect(row).toContainText('Unterlagen 1/2');
  await expect(row.locator('[title]')).toHaveAttribute(
    'title',
    /Fahrerlizenz: Geprüft.*Fahrzeugschein: Abgelehnt/,
  );
  await expect(preview).toContainText('Geprüft');
  await expect(preview).toContainText('Abgelehnt');
});

test('Bergpreis documents match the A7/A4 reference at three widths', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  const row = page.getByRole('row').filter({ hasText: 'Tom Probe' });
  await expect(row).toContainText('Unterlagen 1/2', { timeout: 90_000 });
  await row.locator('button[data-entry-action]').click();
  const preview = page.getByRole('complementary', { name: 'Nennungsvorschau' });
  await expect(preview).toContainText('Fahrerlizenz');
  await expect(preview).toContainText('Fahrzeugschein');
  const dir = process.env.DOCUMENTS_SCREENSHOT_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  // The inline preview only exists from 1680px (A7); below that the list
  // links straight to the detail, so the list row is the surface to compare.
  if (dir)
    await page.screenshot({
      path: `${dir}/ist-preview-1920x1080.png`,
      fullPage: false,
    });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(row).toContainText('Unterlagen 1/2');
    if (dir)
      await page.screenshot({
        path: `${dir}/ist-list-${width}x${height}.png`,
        fullPage: false,
      });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await preview.getByRole('button', { name: 'Vollständig öffnen' }).click();
  const detail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(detail).toContainText('Orga-Code');
  await expect(documentRow(page, 'Fahrerlizenz')).toContainText('Geprüft');
  await expect(documentRow(page, 'Fahrzeugschein')).toContainText('Fehlt');
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(detail).toBeVisible();
    if (dir)
      await page.screenshot({
        path: `${dir}/ist-detail-${width}x${height}.png`,
        fullPage: false,
      });
  }
});

test('Admin configures document activation and Orga-Code prefix persistently', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page
    .getByRole('button', { name: 'Einstellungen', exact: true })
    .click();
  const settings = page.getByRole('region', {
    name: 'Unterlagen und Orga-Code',
  });
  await expect(settings).toBeVisible();
  const type = settings.getByRole('group', { name: 'Unterlage 2' });
  await expect(type.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Fahrzeugschein',
  );
  await type.getByRole('checkbox', { name: 'Aktiv' }).uncheck();
  const prefix = settings.getByRole('textbox', { name: 'Präfix' });
  const originalPrefix = await prefix.inputValue();
  await prefix.fill('BERG2027');
  await settings.getByRole('button', { name: 'Unterlagen speichern' }).click();
  await expect(settings.getByRole('status')).toContainText('gespeichert');
  await page.getByRole('button', { name: 'Nennungen', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Suche' }).fill('Tom Probe');
  const row = page.getByRole('row').filter({ hasText: 'Tom Probe' });
  await expect(row).toContainText('Unterlagen 1/1');
  await row.locator('button[data-entry-action]').click();
  await expect(
    page.getByRole('complementary', { name: 'Nennungsvorschau' }),
  ).not.toContainText('Fahrzeugschein');
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption({ label: 'Historischer Bergpreis 2027' });
  await page
    .getByRole('button', { name: 'Einstellungen', exact: true })
    .click();
  await expect(settings).toBeVisible();
  await expect(
    settings
      .getByRole('group', { name: 'Unterlage 2' })
      .getByRole('checkbox', { name: 'Aktiv' }),
  ).not.toBeChecked();
  await expect(settings.getByRole('textbox', { name: 'Präfix' })).toHaveValue(
    'BERG2027',
  );
  await settings
    .getByRole('group', { name: 'Unterlage 2' })
    .getByRole('checkbox', { name: 'Aktiv' })
    .check();
  await settings.getByRole('textbox', { name: 'Präfix' }).fill(originalPrefix);
  await settings.getByRole('button', { name: 'Unterlagen speichern' }).click();
  await expect(settings.getByRole('status')).toContainText('gespeichert');
});
