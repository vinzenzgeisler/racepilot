import { readFileSync } from 'node:fs';

const exceptions = JSON.parse(
  readFileSync(
    new URL('./scripts/stylelint-exceptions.json', import.meta.url),
    'utf8',
  ),
);
const tokenOnly =
  '/^(?!var\\(|inherit$|initial$|unset$|revert$|transparent$|currentColor$).+/i';
const rawLength = '/(?:^|\\s)-?\\d+(?:\\.\\d+)?(?:px|rem|em|vh|vw)(?:\\s|$)/i';
const colorProperties = [
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
];
const fontProperties = [
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
];
const spacingProperties = [
  'margin',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'padding',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'gap',
  'row-gap',
  'column-gap',
  'inset',
  'inset-block',
  'inset-inline',
  'top',
  'right',
  'bottom',
  'left',
];
const colorLiteral =
  '/(?:#[0-9a-f]{3,8}\\b|\\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\\s*\\()/i';
const namedColors =
  '/\\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|crimson|cyan|darkblue|darkcyan|darkgray|darkgreen|darkgrey|darkmagenta|darkorange|darkred|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\\b/i';

export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: exceptions,
  rules: {
    'declaration-property-value-disallowed-list': {
      ...Object.fromEntries(
        colorProperties.map((property) => [
          property,
          [colorLiteral, namedColors],
        ]),
      ),
      ...Object.fromEntries(
        fontProperties.map((property) => [property, [tokenOnly]]),
      ),
      ...Object.fromEntries(
        spacingProperties.map((property) => [property, [rawLength]]),
      ),
    },
  },
};
