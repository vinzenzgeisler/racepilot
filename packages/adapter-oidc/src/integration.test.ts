import { createServer, type Server } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { createOIDCIdentityProvider } from './index.js';

let providerKeys: JWK[] = [];

describe('OIDC integration with a local discovery/JWKS provider', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it('discovers JWKS, reloads on key rotation, and rejects invalid tokens without granting claim roles', async () => {
    const issuer = await startProvider(
      (port) => `http://127.0.0.1:${port}/issuer`,
    );
    const first = await generateKeyPair('RS256');
    const rotated = await generateKeyPair('RS256');
    const attacker = await generateKeyPair('RS256');
    providerKeys = [
      {
        ...(await exportJWK(first.publicKey)),
        kid: 'first',
        alg: 'RS256',
        use: 'sig',
      },
    ];
    const provider = await createOIDCIdentityProvider({
      issuerUrl: issuer,
      audience: 'racepilot-web',
    });

    const valid = await token(first.privateKey, issuer, 'racepilot-web', {
      kid: 'first',
    });
    const identity = await provider.verify(valid);
    expect(identity).toMatchObject({
      issuer,
      subject: 'member-1',
      email: 'user@example.test',
      emailVerified: true,
    });
    expect(identity).not.toHaveProperty('role');
    expect(identity).not.toHaveProperty('permissions');

    providerKeys = [
      {
        ...(await exportJWK(rotated.publicKey)),
        kid: 'rotated',
        alg: 'RS256',
        use: 'sig',
      },
    ];
    await expect(
      provider.verify(
        await token(rotated.privateKey, issuer, 'racepilot-web', {
          kid: 'rotated',
        }),
      ),
    ).resolves.toMatchObject({ subject: 'member-1' });
    await expect(
      provider.verify(
        await token(first.privateKey, issuer, 'racepilot-web', {
          kid: 'retired',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verify(
        await token(first.privateKey, `${issuer}/wrong`, 'racepilot-web'),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verify(await token(first.privateKey, issuer, 'wrong-audience')),
    ).rejects.toThrow();
    await expect(
      provider.verify(
        await token(first.privateKey, issuer, 'racepilot-web', {
          expired: true,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verify(
        await token(attacker.privateKey, issuer, 'racepilot-web'),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verify(
        await token(first.privateKey, issuer, 'racepilot-web', {
          futureIat: true,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verify(
        await token(first.privateKey, issuer, 'racepilot-web', {
          futureNbf: true,
        }),
      ),
    ).rejects.toThrow();
    await expect(provider.verify(unsignedToken(issuer))).rejects.toThrow();
    const forgedClaims = await new SignJWT({
      role: 'admin',
      permissions: ['organization:update'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'rotated' })
      .setIssuer(issuer)
      .setAudience('racepilot-web')
      .setSubject('attacker')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(attacker.privateKey);
    await expect(provider.verify(forgedClaims)).rejects.toThrow();
  });

  it('fails startup if discovery advertises another issuer', async () => {
    const issuer = await startProvider(() => 'http://different-issuer.test');
    await expect(
      createOIDCIdentityProvider({ issuerUrl: issuer, audience: 'client' }),
    ).rejects.toThrow(/discovery/);
  });

  async function startProvider(
    issuerForPort: (port: number) => string,
  ): Promise<string> {
    const jwksHandler = (requestUrl: string | undefined) => {
      if (requestUrl?.endsWith('/.well-known/openid-configuration'))
        return {
          issuer: issuerForPort((server!.address() as { port: number }).port),
          jwks_uri: `${issuerForPort((server!.address() as { port: number }).port)}/keys`,
        };
      return { keys: providerKeys };
    };
    server = createServer((request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify(jwksHandler(request.url)));
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    );
    const port = (server.address() as { port: number }).port;
    return issuerForPort(port);
  }
});

async function token(
  key: CryptoKey,
  issuer: string,
  audience: string,
  options: {
    kid?: string;
    expired?: boolean;
    futureIat?: boolean;
    futureNbf?: boolean;
  } = {},
) {
  const jwt = new SignJWT({
    email: 'user@example.test',
    email_verified: true,
    groups: ['admin'],
    role: 'admin',
  })
    .setProtectedHeader({
      alg: 'RS256',
      ...(options.kid ? { kid: options.kid } : {}),
    })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('member-1');
  if (options.expired) jwt.setIssuedAt(1).setExpirationTime(2);
  else {
    jwt
      .setIssuedAt(
        options.futureIat ? Math.floor(Date.now() / 1000) + 120 : undefined,
      )
      .setExpirationTime('5m');
    if (options.futureNbf)
      jwt.setNotBefore(Math.floor(Date.now() / 1000) + 120);
  }
  return jwt.sign(key);
}

function unsignedToken(issuer: string): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ iss: issuer, aud: 'racepilot-web', sub: 'attacker', iat: 1, exp: 4_000_000_000 })}.`;
}
