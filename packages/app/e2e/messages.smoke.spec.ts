import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const mailpitUrl = process.env.RACEPILOT_MAILPIT_URL ?? 'http://127.0.0.1:8025';

test('Admin filters recipients, sends a message, and sees Mailpit delivery and sent outbox', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
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
  await page.getByRole('button', { name: 'Nachrichten', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nachrichten' }),
  ).toBeVisible();
  const recipients = page.getByRole('group', { name: 'Empfänger' });
  await recipients
    .getByRole('combobox', { name: 'Klasse' })
    .selectOption({ label: 'H2 · bis 2000' });
  await expect(recipients.getByRole('status')).toContainText(/\d+ Empfänger/);
  const countText = await recipients.getByRole('status').textContent();
  const count = Number(countText?.match(/\d+/)?.[0] ?? 0);
  expect(count).toBeGreaterThan(0);
  const subject = `E2E Nachricht ${randomUUID()}`;
  await page
    .getByRole('textbox', { name: 'Betreff' })
    .fill('Test {{unknownField}}');
  await page
    .getByRole('textbox', { name: 'Nachricht' })
    .fill('Hallo {{firstName}}, dies ist ein Test.');
  await expect(
    page.getByRole('alert').filter({ hasText: 'unknownField' }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Betreff' }).fill(subject);
  await expect(
    page.getByRole('heading', { level: 3, name: subject }),
  ).toBeVisible();
  const screenshotDir = process.env.MESSAGE_SCREENSHOT_DIR;
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true });
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: width ?? 0, height: height ?? 0 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${screenshotDir}/messages-${width}x${height}.png`,
        fullPage: false,
      });
    }
  }
  await page.getByRole('button', { name: 'Nachricht senden' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`an ${count} Empfänger`);
  await dialog.getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'eingeplant' }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailpitUrl}/api/v1/messages`);
        if (!response.ok()) return false;
        const payload: unknown = await response.json();
        return JSON.stringify(payload).includes(subject);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        await page
          .getByRole('button', { name: 'Postausgang aktualisieren' })
          .click();
        const row = page.getByRole('row').filter({ hasText: subject });
        return (
          (await row.count()) > 0 &&
          (await row.textContent())?.includes('Gesendet') === true
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Nennungen', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'Anna Beispiel' })
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('complementary', { name: 'Nennungsvorschau' })
    .getByRole('button', { name: 'Nachricht' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nachrichten' }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Empfänger' }).getByRole('status'),
  ).toContainText('1 Empfänger');
});
