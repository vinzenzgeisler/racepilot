import { z } from 'zod';

export const hexColor = z.string().regex(/^#[\da-fA-F]{6}$/);
const luminance = (color: string) => {
  const channels =
    color
      .slice(1)
      .match(/../g)
      ?.map((channel) => parseInt(channel, 16) / 255) ?? [];
  const [r, g, b] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
// Runtime brand colors are accepted as source colors and transformed to
// accessible foregrounds at render time; rejecting a brand color would make
// the design inaccessible to organizations without helping them fix it.
export const brandAccentColor = hexColor;
export function deriveAccessibleBrandColors(primary: string, accent: string) {
  const contrast = (a: string, b: string) => {
    const l1 = luminance(a),
      l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const dark = '#111A16',
    light = '#FFFFFF';
  const darkenForSurface = (color: string) => {
    if (Math.max(contrast(color, light), contrast(color, dark)) >= 4.5)
      return color.toUpperCase();
    const values = color
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16));
    for (let step = 99; step >= 0; step--) {
      const candidate = `#${values
        .map((value) =>
          Math.round((value * step) / 100)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      if (contrast(candidate, light) >= 4.5) return candidate.toUpperCase();
    }
    return dark;
  };
  const primarySurface = darkenForSurface(primary),
    accentSurface = darkenForSurface(accent);
  const foreground = (background: string) =>
    contrast(background, light) >= contrast(background, dark) ? light : dark;
  let linkColor = primary.toUpperCase();
  if (contrast(linkColor, '#F5F4EE') < 4.5) {
    const values = linkColor
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16));
    for (let step = 99; step >= 0; step--) {
      const candidate = `#${values
        .map((value) =>
          Math.round((value * step) / 100)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      if (contrast(candidate, '#F5F4EE') >= 4.5) {
        linkColor = candidate.toUpperCase();
        break;
      }
    }
  }
  return {
    primarySurface,
    accentSurface,
    primaryForeground: foreground(primarySurface),
    accentForeground: foreground(accentSurface),
    linkColor,
    contrastNotice:
      primarySurface !== primary.toUpperCase() ||
      accentSurface !== accent.toUpperCase() ||
      linkColor !== primary.toUpperCase(),
  };
}
