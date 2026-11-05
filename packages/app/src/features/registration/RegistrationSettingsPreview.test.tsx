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
    const header = container.querySelector<HTMLElement>('header')!;
    const accentSample = container.querySelector<HTMLElement>('header + p')!;
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
    expect(header.style.background).toBe('var(--brand-primary)');
    expect(header.style.color).toBe('var(--brand-primary-text)');
    expect(accentSample.style.background).toBe('var(--brand-accent)');
    expect(accentSample.style.color).toBe('var(--brand-accent-text)');
    expect(
      contrastRatio(colors.primaryForeground, colors.primarySurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.accentForeground, colors.accentSurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(container.textContent).toContain('Beispielveranstaltung');
  });
});
