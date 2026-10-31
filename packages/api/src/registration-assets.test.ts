import { describe, expect, it } from 'vitest';
import {
  sanitizeRegistrationSvg,
  validateRegistrationImage,
} from './registration-assets.js';

describe('registration asset validation', () => {
  it('reconstructs only static SVG geometry and removes comments', () => {
    const value = new TextDecoder().decode(
      sanitizeRegistrationSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--logo--><path fill="#193B30" d="M0 0L10 10z"/></svg>',
      ),
    );
    expect(value).toContain('<path fill="#193B30" d="M0 0L10 10z"/>');
    expect(value).not.toContain('logo');
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.test/x"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://attacker.test/x)" d="M0 0"/></svg>',
  ])('rejects active or external SVG content', (source) => {
    expect(() => sanitizeRegistrationSvg(source)).toThrow();
  });

  it('checks file signatures instead of trusting multipart content type', () => {
    expect(() =>
      validateRegistrationImage(
        'logoLight',
        new TextEncoder().encode('<svg/>'),
        'image/svg+xml',
      ),
    ).toThrow();
    expect(() =>
      validateRegistrationImage(
        'logoLight',
        new Uint8Array([0, 1, 2]),
        'image/png',
      ),
    ).toThrow();
    expect(
      validateRegistrationImage(
        'logoLight',
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        'image/png',
      ).contentType,
    ).toBe('image/png');
  });
});
