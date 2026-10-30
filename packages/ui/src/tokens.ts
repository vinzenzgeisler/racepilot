export const colors = {
  green: '#193B30',
  ivory: '#F5F4EE',
  white: '#FFFFFF',
  ink: '#111A16',
  night: '#0F2219',
  mint: '#B5E0CA',
  sage: '#E4EAE3',
  graphite: '#4F5A54',
  line: '#C9CFC8',
  signal: '#3FB97A',
  marshal: '#E2531F',
  marshalText: '#B8400F',
} as const;

export const contrastPairs = [
  {
    foreground: colors.ink,
    background: colors.ivory,
    ratio: 16.1,
    rating: 'AAA',
  },
  {
    foreground: colors.green,
    background: colors.ivory,
    ratio: 11.1,
    rating: 'AAA',
  },
  {
    foreground: colors.graphite,
    background: colors.ivory,
    ratio: 6.5,
    rating: 'AA',
  },
  {
    foreground: colors.marshalText,
    background: colors.white,
    ratio: 5.6,
    rating: 'AA',
  },
  {
    foreground: colors.ivory,
    background: colors.green,
    ratio: 11.1,
    rating: 'AAA',
  },
  {
    foreground: colors.mint,
    background: colors.green,
    ratio: 8.5,
    rating: 'AAA',
  },
  {
    foreground: colors.night,
    background: colors.mint,
    ratio: 11.5,
    rating: 'AAA',
  },
  {
    foreground: colors.ink,
    background: colors.marshal,
    ratio: 4.6,
    rating: 'AA',
  },
] as const;

const step = (
  fontFamily: string,
  fontWeight: number,
  size: number,
  lineHeight: number,
  letterSpacing: string,
) => ({ fontFamily, fontWeight, size, lineHeight, letterSpacing });
const archivo = 'Archivo Variable';
const plex = 'IBM Plex Sans';
const mono = 'IBM Plex Mono';
export const typography = {
  display: {
    webDesktop: step(archivo, 800, 172, 0.84, '-4%'),
    webMobile: step(archivo, 800, 64, 0.84, '-4%'),
  },
  h1: {
    webDesktop: step(archivo, 800, 84, 0.92, '-3.5%'),
    webMobile: step(archivo, 800, 40, 0.92, '-3.5%'),
    app: step(archivo, 800, 28, 0.92, '-3.5%'),
  },
  h2: {
    webDesktop: step(archivo, 800, 48, 1, '-2%'),
    webMobile: step(archivo, 800, 30, 1, '-2%'),
    app: step(archivo, 800, 22, 1, '-2%'),
  },
  h3: {
    webDesktop: step(archivo, 700, 26, 1.1, '-1%'),
    webMobile: step(archivo, 700, 21, 1.1, '-1%'),
    app: step(archivo, 700, 18, 1.1, '-1%'),
  },
  h4: {
    webDesktop: step(plex, 600, 20, 1.3, '0'),
    webMobile: step(plex, 600, 17, 1.3, '0'),
    app: step(plex, 600, 15, 1.3, '0'),
  },
  bodyL: {
    webDesktop: step(plex, 400, 20, 1.5, '0'),
    webMobile: step(plex, 400, 17, 1.5, '0'),
  },
  body: {
    webDesktop: step(plex, 400, 17, 1.55, '0'),
    webMobile: step(plex, 400, 16, 1.55, '0'),
    app: step(plex, 400, 14, 1.45, '0'),
  },
  small: {
    webDesktop: step(plex, 400, 14, 1.5, '0'),
    webMobile: step(plex, 400, 14, 1.5, '0'),
    app: step(plex, 400, 13, 1.5, '0'),
  },
  button: {
    webDesktop: step(plex, 500, 16, 1, '0'),
    webMobile: step(plex, 500, 16, 1, '0'),
    app: step(plex, 500, 14, 1, '0'),
  },
  label: {
    webDesktop: step(mono, 500, 12, 1.4, '8%'),
    webMobile: step(mono, 500, 11, 1.4, '8%'),
    app: step(mono, 500, 11, 1.4, '8%'),
  },
  digits: {
    webDesktop: step(archivo, 900, 64, 0.9, '0'),
    webMobile: step(archivo, 900, 40, 0.9, '0'),
    app: step(archivo, 900, 20, 0.9, '0'),
  },
  tabular: {
    webDesktop: step(plex, 400, 14, 1.4, '0'),
    webMobile: step(plex, 400, 14, 1.4, '0'),
    app: step(plex, 400, 14, 1.4, '0'),
  },
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
} as const;
export const shape = {
  radius: 0,
  sectionLine: 2,
  groupLine: 1,
  rowLine: 1,
  focusWidth: 3,
  focusOffset: 3,
  minTarget: 44,
} as const;
export const motion = {
  reaction: 120,
  transition: 240,
  scene: 600,
  entrance: 900,
  brake: 'cubic-bezier(.2,0,0,1)',
  launch: 'cubic-bezier(.7,0,.2,1)',
} as const;
