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
  const editor = page.locator('.nb-message-editor');
  const aside = page.locator('.nb-message-aside');
  const formMax = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.width = 'var(--width-form-max)';
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const form = await editor.boundingBox();
    const help = await aside.boundingBox();
    const main = await page.locator('main').first().boundingBox();
    if (!form || !help || !main) throw new Error('layout boxes missing');
    expect(form.width).toBeLessThanOrEqual(formMax + 1);
    expect(form.x).toBeLessThanOrEqual(main.x + 64);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('.nb-message-editor *')].every(
          (node) =>
            node.getBoundingClientRect().right <=
            (node.closest('.nb-message-editor')?.getBoundingClientRect()
              .right ?? 0) +
              1,
        ),
      ),
    ).toBe(true);
    if (width >= 1440)
      expect(help.x).toBeGreaterThanOrEqual(form.x + form.width);
    else expect(help.y).toBeGreaterThanOrEqual(form.y + form.height - 1);
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: `${screenshotDir}/messages-${width}x${height}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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
  if (screenshotDir)
    await page.screenshot({
      path: `${screenshotDir}/messages-outbox-sent-1440x900.png`,
      fullPage: true,
    });
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
