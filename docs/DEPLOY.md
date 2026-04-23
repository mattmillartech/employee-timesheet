# Deploying to Redpill (timesheet.redpill.online)

This runbook walks you through getting the timesheet webapp up at
`https://timesheet.redpill.online` behind Nginx Proxy Manager on Redpill.
Everything runs as a git-based Portainer stack so "deploy the latest" is
`git push` → redeploy.

## 0 · Pre-flight

You need:

- A Google Sheet with a header row on `_Config` tab — the app creates the rest.
- A service account JSON key with the **Google Sheets API** enabled (free tier).
- The service account's `client_email` shared as **Editor** on the Sheet.
- A Google OAuth 2.0 **Web Client** (also free) — note the Client ID.
- SSH or Portainer-UI access to Redpill.

See the [README](../README.md#google-cloud-setup) for the GCP walkthrough.

---

## 1 · DNS

Add an **A record** in your DNS provider:

```
timesheet.redpill.online.   A   161.97.187.50
```

Confirm:

```bash
dig +short timesheet.redpill.online
# expect: 161.97.187.50
```

## 2 · OAuth origins

In **GCP Console → APIs & Services → Credentials**, edit your OAuth 2.0 Web
Client and add these **Authorized JavaScript origins**:

- `https://timesheet.redpill.online`
- `http://localhost:5173` (for local dev)

No redirect URIs needed — we use the GIS implicit/token flow.

## 3 · Portainer stack

SSH into Redpill (or use the Portainer UI). Get a token:

```bash
# Password lives in Bitwarden item "Portainer - Redpill" (id f1f9422f-…)
TOKEN=$(curl -s -X POST "https://portainer.redpill.online/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PORTAINER_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")
```

Create a git-based stack:

```bash
PAYLOAD=$(python3 -c '
import json
print(json.dumps({
  "name": "timesheet",
  "repositoryURL": "https://github.com/mattmillartech/employee-timesheet",
  "repositoryReferenceName": "refs/heads/main",
  "composeFile": "docker-compose.yml",
  "env": [
    {"name": "VITE_GOOGLE_CLIENT_ID", "value": "REPLACE-with-oauth-client-id"},
    {"name": "VITE_ALLOWED_GOOGLE_EMAIL", "value": "you@example.com"},
    {"name": "VITE_SHEET_ID", "value": "REPLACE-with-sheet-id"},
    {"name": "GOOGLE_SERVICE_ACCOUNT_JSON", "value": "REPLACE-single-line-json"},
    {"name": "AGENT_API_KEY", "value": "REPLACE-random-48char-string"}
  ]
}))
')

curl -s -X POST "https://portainer.redpill.online/api/stacks/create/standalone/repository?endpointId=3" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Generate `AGENT_API_KEY`:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important about `GOOGLE_SERVICE_ACCOUNT_JSON`:** Portainer's stack env var
editor preserves literal newlines correctly. Paste the full JSON on one line
with `\n` sequences intact, or use the multi-line editor if the UI offers it.
If the sidecar logs `JSON.parse` failures after boot, the `\n` inside
`private_key` was stripped — re-paste with the escapes.

## 4 · NPM proxy host

In Nginx Proxy Manager's UI (usually `https://npm.redpill.online` or your
NPM admin path; check [[bases/Infrastructure/redpill-services]] if you
forget):

- **Domain Names:** `timesheet.redpill.online`
- **Scheme:** `http`
- **Forward Hostname / IP:** `timesheet` (the container name on the
  `npm_proxy` network)
- **Forward Port:** `80`
- **Block Common Exploits:** on
- **Websockets Support:** off (not needed)
- **SSL tab:** request a Let's Encrypt cert, Force SSL: on, HTTP/2: on,
  HSTS: optional (skip while iterating; turn on after the deploy is stable).

NPM will trigger certbot; usually Let's Encrypt issues the cert within a
minute of the DNS record having propagated.

## 5 · Smoke test

```bash
# DNS + TLS
curl -I https://timesheet.redpill.online/
# expect HTTP/2 200

# Sidecar reachable through NPM → nginx → supervisor → node
curl https://timesheet.redpill.online/api/health
# expect 200 with service metadata

# Protected endpoint
curl -H "X-Agent-Key: $AGENT_API_KEY" https://timesheet.redpill.online/api/employees
# expect JSON array of employees
```

Then hit the URL in a browser, sign in with the allowlisted Google account,
verify the Dashboard loads and the sheet is reachable.

## 6 · Redeploying

Every push to `main` is a candidate deploy. Kick the stack to pull + rebuild:

```bash
# From a shell with $TOKEN set (see step 3)
STACK_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://portainer.redpill.online/api/stacks" \
  | python3 -c "import sys,json;[print(s['Id']) for s in json.load(sys.stdin) if s['Name']=='timesheet']")

curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://portainer.redpill.online/api/stacks/$STACK_ID/git/redeploy?endpointId=3" \
  -d '{"pullImage": true}'
```

For hands-off redeploys, configure Portainer's git webhook and point GitHub
at it via **Settings → Webhooks** (optional; not required for M7).

## 7 · Troubleshooting

- **`redirect_uri_mismatch` or `origin_mismatch` on sign-in.** The OAuth
  client is missing `https://timesheet.redpill.online` in the Authorized
  JavaScript origins list. Re-check step 2.
- **`403 forbidden` on `/api/*`.** Your `X-Agent-Key` header value doesn't
  match the `AGENT_API_KEY` env var in the stack. Double-check copy-paste
  (no stray whitespace).
- **Sidecar 500s with `invalid_grant` or `DECODER routines::unsupported`.**
  The `private_key` newlines got stripped in `GOOGLE_SERVICE_ACCOUNT_JSON`.
  Redeploy with single-line JSON where `\n` sequences are literal.
- **Dashboard tab doesn't update.** Hit "Sync to sheet" in the app header,
  or "Initialize / rebuild Dashboard tab" in Settings. The app rebuilds the
  tab automatically on employee add / reorder / toggle.
- **Container restart loop.** `docker logs timesheet` on Redpill: usually
  nginx config syntax or a sidecar boot error. The Dockerfile's HEALTHCHECK
  pings `/api/health` — Portainer flags unhealthy containers in red.
