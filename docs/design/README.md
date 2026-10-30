# NENNBOX design foundation

This repository contains the implementation-facing design tokens for RacePilot's app package. The complete NENNBOX brandbook (M1–M6 and app specifications) is maintained in the private design repository; this document is only the public product's implementation reference.

## Tokens

Import `@racepilot/ui/base.css` for the reset, typography, focus behavior, motion preference, locally hosted fonts, and tokens. `@racepilot/ui/tokens.css` can be imported independently. TypeScript constants are exported by `@racepilot/ui`.

- **Color (M3):** Racing Green `#193B30`, Paddock Ivory `#F5F4EE`, White `#FFFFFF`, Ink `#111A16`, Night `#0F2219`, Mint `#B5E0CA`, Sage `#E4EAE3`, Graphite `#4F5A54`, Line `#C9CFC8`, Signal `#3FB97A`, Marshal `#E2531F` and text-safe Marshal `#B8400F`.
- **Typography (M4):** Archivo Variable for display/headings and numerals; IBM Plex Sans weights 400/500/600 for readable UI; IBM Plex Mono 500 for uppercase labels. Skala (px; size/line-height/tracking):

| Style | Desktop | Mobile | App |
|---|---:|---:|---:|
| Display | 172 / .84 / −4% | 64 / .84 / −4% | — |
| H1 | 84 / .92 / −3.5% | 40 / .92 / −3.5% | 28 / .92 / −3.5% |
| H2 | 48 / 1 / −2% | 30 / 1 / −2% | 22 / 1 / −2% |
| H3 | 26 / 1.1 / −1% | 21 / 1.1 / −1% | 18 / 1.1 / −1% |
| H4 | 20 / 1.3 / 0 | 17 / 1.3 / 0 | 15 / 1.3 / 0 |
| Body L | 20 / 1.5 / 0 | 17 / 1.5 / 0 | — |
| Body | 17 / 1.55 / 0 | 16 / 1.55 / 0 | 14 / 1.45 / 0 |
| Small | 14 / 1.5 / 0 | 14 / 1.5 / 0 | 13 / 1.5 / 0 |
| Button | 16 / 1 / 0 | 16 / 1 / 0 | 14 / 1 / 0 |
| Label | 12 / 1.4 / +8% | 11 / 1.4 / +8% | 11 / 1.4 / +8% |
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

All font files are served from the application bundle via Fontsource; OFL notices are in `packages/ui/licenses/`. Archivo Variable's `wdth.css` declares a 62–125% stretch axis and variable weight 100–900, so the required width and weight values are supported. The logo components live in `packages/ui/src/brand/`; their four provided variants are approved combinations from M2. The logo's trademark/licensing status is still subject to the owner's review.
