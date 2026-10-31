import { SaxesParser } from 'saxes';

const svgElements = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);
const svgAttributes = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'preserveAspectRatio',
]);
const escapeAttribute = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );

/** Strictly reconstruct logo SVGs from geometry-only elements and attributes. */
export function sanitizeRegistrationSvg(source: string): Uint8Array {
  if (source.length > 1_000_000 || /<!ENTITY/i.test(source))
    throw new Error('Invalid SVG');
  const parser = new SaxesParser({ xmlns: false });
  const output: string[] = [];
  const stack: string[] = [];
  let error = false;
  let nodes = 0;
  parser.on('error', () => {
    error = true;
  });
  parser.on('doctype', () => {
    error = true;
  });
  parser.on('text', (text) => {
    if (text.trim()) error = true;
  });
  parser.on('cdata', () => {
    error = true;
  });
  parser.on('processinginstruction', () => {
    error = true;
  });
  parser.on('opentag', (tag) => {
    nodes++;
    if (
      nodes > 10000 ||
      stack.length > 30 ||
      !svgElements.has(tag.name) ||
      tag.name.includes(':')
    ) {
      error = true;
      return;
    }
    const attributes: string[] = [];
    for (const [name, raw] of Object.entries(tag.attributes)) {
      if (
        !svgAttributes.has(name) ||
        name.toLowerCase().startsWith('on') ||
        typeof raw !== 'string'
      ) {
        error = true;
        return;
      }
      const value = raw.trim();
      if (
        (name === 'fill' || name === 'stroke') &&
        !/^(?:none|currentColor|#[\da-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(value)
      ) {
        error = true;
        return;
      }
      if (
        (name === 'd' || name === 'points') &&
        !/^[MmZzLlHhVvCcSsQqTtAaEe0-9.,\s+-]*$/.test(value)
      ) {
        error = true;
        return;
      }
      if (
        name !== 'd' &&
        name !== 'points' &&
        /url\s*\(|javascript:|data:/i.test(value)
      ) {
        error = true;
        return;
      }
      if (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg') {
        error = true;
        return;
      }
      attributes.push(`${name}="${escapeAttribute(value)}"`);
    }
    if (
      tag.name === 'svg' &&
      (!attributes.some((value) => value.startsWith('xmlns=')) ||
        stack.length !== 0)
    ) {
      error = true;
      return;
    }
    output.push(
      `<${tag.name}${attributes.length ? ` ${attributes.join(' ')}` : ''}${tag.isSelfClosing ? '/>' : '>'}`,
    );
    if (!tag.isSelfClosing) stack.push(tag.name);
  });
  parser.on('closetag', (tag) => {
    if (tag.isSelfClosing) return;
    if (tag.name !== stack.at(-1)) {
      error = true;
      return;
    }
    stack.pop();
    output.push(`</${tag.name}>`);
  });
  try {
    parser.write(source).close();
  } catch {
    error = true;
  }
  const sanitized = output.join('');
  if (
    error ||
    stack.length ||
    !sanitized.startsWith('<svg ') ||
    !sanitized.endsWith('</svg>')
  )
    throw new Error('Invalid or unsafe SVG');
  return new TextEncoder().encode(sanitized);
}

export function validateRegistrationImage(
  kind: string,
  body: Uint8Array,
  contentType: string,
) {
  const png =
    body.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => body[i] === value);
  const jpeg =
    body.length >= 3 && body[0] === 255 && body[1] === 216 && body[2] === 255;
  const webp =
    body.length >= 12 &&
    new TextDecoder().decode(body.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(body.slice(8, 12)) === 'WEBP';
  if (kind === 'logoLight' || kind === 'logoDark') {
    if (contentType === 'image/svg+xml')
      return {
        body: sanitizeRegistrationSvg(
          new TextDecoder('utf-8', { fatal: true }).decode(body),
        ),
        contentType,
      };
    if (contentType === 'image/png' && png) return { body, contentType };
  } else if (kind === 'headerImage') {
    if (
      (contentType === 'image/png' && png) ||
      (contentType === 'image/jpeg' && jpeg) ||
      (contentType === 'image/webp' && webp)
    )
      return { body, contentType };
  }
  throw new Error('Unsupported or invalid image');
}
