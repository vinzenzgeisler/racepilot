#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker mit Compose wird benötigt.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 wird benötigt.' >&2; exit 1; }
node scripts/community-config.mjs
compose=(docker compose --env-file .community-local/compose.env -f compose.community.dev.yaml)
"${compose[@]}" up -d --wait --wait-timeout 120
cleanup() {
  kill "${api_pid:-}" "${worker_pid:-}" "${app_pid:-}" 2>/dev/null || true
  "${compose[@]}" down >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for attempt in {1..60}; do
  if node -e "fetch('http://127.0.0.1:8080/realms/nennbox/.well-known/openid-configuration').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  if [[ "$attempt" == 60 ]]; then echo 'Keycloak wurde nicht bereit.' >&2; exit 1; fi
  sleep 2
done
npm ci
npm run build
export DATABASE_URL='postgres://racepilot:racepilot-local@127.0.0.1:5433/racepilot'
export DEPLOYMENT_MODE=community
export COMMUNITY_ORGANIZATION_SLUG=community
export COMMUNITY_ORGANIZATION_NAME=NENNBOX
export COMMUNITY_ORGANIZATION_TIMEZONE=Europe/Berlin
export COMMUNITY_ORGANIZATION_LOCALE=de
export OIDC_PROVIDER=oidc
export OIDC_ISSUER_URL='http://127.0.0.1:8080/realms/nennbox'
export OIDC_AUDIENCE=nennbox-api
export OIDC_CLIENT_ID=nennbox-app
export OIDC_REDIRECT_URI='http://127.0.0.1:5173/auth/callback'
export OIDC_BOOTSTRAP_EMAIL
OIDC_BOOTSTRAP_EMAIL="$(node scripts/community-config.mjs --email)"
export CANONICAL_BASE_URL='http://127.0.0.1:5173'
export MAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025
export SMTP_FROM='noreply@nennbox.local'
export STORAGE_PROVIDER=local STORAGE_LOCAL_ROOT="$PWD/.community-local/uploads"
mkdir -p "$STORAGE_LOCAL_ROOT"
node scripts/community-init.mjs
node packages/api/dist/server.js & api_pid=$!
node packages/worker/dist/server.js & worker_pid=$!
npm run dev --workspace @racepilot/app -- --host 127.0.0.1 & app_pid=$!
echo 'NENNBOX Community: http://127.0.0.1:5173/app'
echo 'Mailpit: http://127.0.0.1:8025'
echo "Admin-E-Mail: $OIDC_BOOTSTRAP_EMAIL"
if [[ "${COMMUNITY_PRINT_PASSWORD:-1}" == 1 ]]; then
  echo "Lokales Admin-Passwort: $(node scripts/community-config.mjs --password)"
fi
wait -n "$api_pid" "$worker_pid" "$app_pid"
