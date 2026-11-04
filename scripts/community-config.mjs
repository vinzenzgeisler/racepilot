import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';

const stateDir = '.community-local';
const stateFile = join(stateDir, 'config.json');
const realmFile = join(stateDir, 'nennbox-realm.json');
const envFile = join(stateDir, 'compose.env');
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
chmodSync(stateDir, 0o700);
let config;
if (existsSync(stateFile)) {
  config = JSON.parse(readFileSync(stateFile, 'utf8'));
} else {
  const email = process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('COMMUNITY_ADMIN_EMAIL must be an email address');
  config = {
    email,
    password: randomBytes(24).toString('base64url'),
    operatorPassword: randomBytes(24).toString('base64url'),
  };
  writeFileSync(stateFile, JSON.stringify(config, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
}
if (!existsSync(realmFile)) {
  writeFileSync(
    realmFile,
    JSON.stringify(
      {
        realm: 'nennbox',
        enabled: true,
        registrationAllowed: false,
        loginWithEmailAllowed: true,
        users: [
          {
            username: 'community-admin',
            email: config.email,
            emailVerified: true,
            enabled: true,
            credentials: [
              { type: 'password', value: config.password, temporary: false },
            ],
          },
        ],
        clients: [
          {
            clientId: 'nennbox-app',
            enabled: true,
            protocol: 'openid-connect',
            publicClient: true,
            standardFlowEnabled: true,
            directAccessGrantsEnabled: false,
            implicitFlowEnabled: false,
            redirectUris: ['http://127.0.0.1:5173/auth/callback'],
            webOrigins: ['http://127.0.0.1:5173'],
            protocolMappers: [
              {
                name: 'nennbox-api-audience',
                protocol: 'openid-connect',
                protocolMapper: 'oidc-audience-mapper',
                config: {
                  'included.custom.audience': 'nennbox-api',
                  'access.token.claim': 'true',
                },
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
}
writeFileSync(
  envFile,
  `KC_BOOTSTRAP_ADMIN_PASSWORD=${config.operatorPassword}\n`,
  { mode: 0o600 },
);
if (process.argv.includes('--email')) process.stdout.write(config.email);
else if (process.argv.includes('--password'))
  process.stdout.write(config.password);
