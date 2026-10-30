# NENNBOX design foundation

This repository contains the implementation-facing design tokens for RacePilot's app package. The complete NENNBOX brandbook (M1–M6 and app specifications) is maintained in the private design repository; this document is only the public product's implementation reference.

## Tokens

Import `@racepilot/ui/base.css` for the reset, typography, focus behavior, motion preference, locally hosted fonts, and tokens. `@racepilot/ui/tokens.css` can be imported independently. TypeScript constants are exported by `@racepilot/ui`.

- **Color (M3):** Racing Green `#193B30`, Paddock Ivory `#F5F4EE`, White `#FFFFFF`, Ink `#111A16`, Night `#0F2219`, Mint `#B5E0CA`, Sage `#E4EAE3`, Graphite `#4F5A54`, Line `#C9CFC8`, Signal `#3FB97A`, Marshal `#E2531F` and text-safe Marshal `#B8400F`.
- **Typography (M4):** Archivo Variable for display/headings and numerals; IBM Plex Sans weights 400/500/600 for readable UI; IBM Plex Mono 500 for uppercase labels. Skala (px; size/line-height/tracking):

| Style | Desktop | Mobile | App |
|---|---:|---:|---:|
| Display | 172 / .84 / −0.04em / 125% | 64 / .84 / −0.04em / 125% | — |
| H1 | 84 / .92 / −0.035em / 122% | 40 / .92 / −0.035em / 122% | 28 / .92 / −0.035em / 122% |
| H2 | 48 / 1 / −0.02em / 118% | 30 / 1 / −0.02em / 118% | 22 / 1 / −0.02em / 118% |
| H3 | 26 / 1.1 / −0.01em / 112% | 21 / 1.1 / −0.01em / 112% | 18 / 1.1 / −0.01em / 112% |
| H4 | 20 / 1.3 / 0 | 17 / 1.3 / 0 | 15 / 1.3 / 0 |
| Body L | 20 / 1.5 / 0 | 17 / 1.5 / 0 | — |
| Body | 17 / 1.55 / 0 | 16 / 1.55 / 0 | 14 / 1.45 / 0 |
| Small | 14 / 1.5 / 0 | 14 / 1.5 / 0 | 13 / 1.5 / 0 |
| Button | 16 / 1 / 0 | 16 / 1 / 0 | 14 / 1 / 0 |
| Label | 12 / 1.4 / +0.08em | 11 / 1.4 / +0.08em | 11 / 1.4 / +0.08em |
| Numerals | 64–84 / .9 / 0 | 40–56 / .9 / 0 | 20 / .9 / 0 |
| Tabular data | 14 / 1.4 / 0 | 14 / 1.4 / 0 | 14 / 1.4 / 0 |

- **Spacing (A1):** 4, 8, 12, 16, 24, 32, 48 px.
- **Geometry (M6):** square corners; only radio controls and avatars may be round. Lines: section 2 px, group 1 px Ink, row 1 px Line. No shadows. Focus: 3 px Marshal outline with 3 px offset. Interactive target minimum: 44 × 44 px.
- **Motion (M6):** 120 ms reaction, 240 ms transition, 600 ms scene, 900 ms entrance. Brake easing `cubic-bezier(.2,0,0,1)` for appearance, launch easing `cubic-bezier(.7,0,.2,1)` for wipes/lines. Reduced-motion users receive effectively immediate transitions.

### Contrast allowlist (M3)

Only these text/background pairs are approved. Status colors also require a text label; Signal and Marshal are not decorative colors. White text is never placed on Marshal.

| Text | Background | Reference contrast | Level |
|---|---|---:|---|
| Ink | Ivory | 16.1:1 | AAA |
| Green | Ivory | 11.1:1 | AAA |
| Graphite | Ivory | 6.5:1 | AA |
| Marshal text `#B8400F` | White | 5.6:1 | AA |
| Ivory | Green | 11.1:1 | AAA |
| Mint | Green | 8.5:1 | AAA |
| Night | Mint | 11.5:1 | AAA |
| Ink | Marshal `#E2531F` | 4.6:1 | AA |

`packages/ui/src/__tests__/contrast.test.ts` recomputes every allowlisted pair using WCAG relative luminance and checks AA (4.5:1).

### Application rules (M4)

Use uppercase only for Mono labels and the logo, never headings. Archivo wide is not used below 18 px or for body copy; condensed Archivo is for digits only. Use tabular numerals for table data, keep prose lines to at most 70 characters, and do not use italics.

### Shared component rules (M6)

Use square geometry, prescribed line weights and no shadows. Keyboard focus is always visible. Controls meet the minimum target size; reduced motion suppresses animation. Statuses use one of the six named meanings (new, in progress, needs attention, done, rejected, not applicable), always with text, form, and color rather than color alone.

### Fonts and logo

All font files are served from the application bundle via Fontsource; OFL notices are in `packages/ui/licenses/`. Archivo Variable's `wdth.css` declares a 62–125% stretch axis and variable weight 100–900, so the required width and weight values are supported. The brand components and app-icon asset live in `packages/ui/src/brand/`; the four wordmark variants and the green/ivory app icon follow M2. The signet is sized to 1.7 times the font cap height (`cap`), and its adjacent Archivo wordmark uses 118% width, weight 800, and +0.03em tracking. The square app-icon master is `packages/ui/src/brand/app-icon.svg` (green field, ivory signet; M2 shows 160, 64, 32, and 16 px examples). Use signet-only below 24 px. M2 also captions a smallest logo with a 20 px signet; these source statements conflict, so this implementation follows the explicit below-24 px signet-only rule and does not infer a wordmark at 20 px. The text-rendered wordmark follows the HTML specimen; no claim is made that it is a curve-converted final master. See [`TRADEMARKS.md`](../../TRADEMARKS.md) for the separation of brand notice from software licensing.


### Browser verification

Rendered the package base styles and `Wordmark` in Chromium on 2026-10-30 at exact 320 px and 1440 px CSS viewports using the local app bundle. `document.fonts.check()` returned true for Archivo Variable, IBM Plex Sans, and IBM Plex Mono at both widths; the computed display face was Archivo Variable at 125% width, and the page had no horizontal overflow. The four logo variants computed to Green/Ivory, Mint signet + Ivory wordmark on Green, White on Ink, and Ink on Ivory respectively. This review used local assets only.
