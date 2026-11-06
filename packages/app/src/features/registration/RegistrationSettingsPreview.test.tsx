// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultRegistrationFormConfig,
  deriveAccessibleBrandColors,
} from '@racepilot/contracts';
import { RegistrationSettingsPreview } from './RegistrationSettingsPreview.js';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((channel) => parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe('RegistrationSettingsPreview', () => {
  it('pairs both brand text samples with accessible surfaces for light brand colors', async () => {
    const config = {
      ...defaultRegistrationFormConfig,
      branding: {
        ...defaultRegistrationFormConfig.branding,
        primaryColor: '#FFFFFF',
        accentColor: '#8FD3F0',
      },
    };
    const colors = deriveAccessibleBrandColors('#FFFFFF', '#8FD3F0');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(<RegistrationSettingsPreview config={config} />),
    );

    const colorTokens = container.querySelector<HTMLElement>(
      '[style*="--brand-primary"]',
    )!;
    const header = container.querySelector<HTMLElement>(
      '.registration-header',
    )!;
    expect(colorTokens.style.getPropertyValue('--brand-primary')).toBe(
      colors.primarySurface,
    );
    expect(colorTokens.style.getPropertyValue('--brand-primary-text')).toBe(
      colors.primaryForeground,
    );
    expect(colorTokens.style.getPropertyValue('--brand-accent')).toBe(
      colors.accentSurface,
    );
    expect(colorTokens.style.getPropertyValue('--brand-accent-text')).toBe(
      colors.accentForeground,
    );
    expect(header.textContent).toContain('Beispielveranstaltung');
    expect(
      contrastRatio(colors.primaryForeground, colors.primarySurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.accentForeground, colors.accentSurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(container.textContent).toContain('Beispielveranstaltung');
  });

  it('previews exactly the fields the participant will meet, with their requirement', async () => {
    const config = {
      ...defaultRegistrationFormConfig,
      fields: {
        ...defaultRegistrationFormConfig.fields,
        phone: { state: 'required' as const },
        city: { state: 'hidden' as const },
        owner: { state: 'hidden' as const },
        cylinders: { state: 'required' as const },
      },
    };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(<RegistrationSettingsPreview config={config} />),
    );
    const labels = [...container.querySelectorAll('.nb-field > span')].map(
      (label) => label.textContent,
    );
    expect(labels).toContain('Telefon · Pflicht');
    expect(labels).toContain('Zylinder · Pflicht');
    expect(labels).toContain('Veröffentlichung · Freiwillig');
    expect(labels.some((label) => label?.startsWith('Ort'))).toBe(false);
    expect(labels.some((label) => label?.startsWith('Besitzer'))).toBe(false);
  });
});
