# Deploying

Runbook for standing the timesheet webapp up behind a reverse proxy on any
VPS. Reference deployment uses a git-based Portainer stack + Nginx Proxy
Manager for TLS — substitute your own Docker host and proxy if you prefer.

The container is **stateless on the backend**: no service-account JSON, no
shared API key, no maintainer-specific secrets. The only build-time value
that's tied to a GCP project is the OAuth Client ID (which is public by
design). Everything else — the sheet, the signed-in user, the agent's
access token — is resolved per-request. That's what makes the repo safe
for anyone to fork and deploy to their own accounts.

Placeholders used throughout:

- `$DEPLOY_HOSTNAME` — e.g. `timesheet.example.com`
- `$VPS_IP` — public IP of the host
- `$PORTAINER_URL` — e.g. `https://portainer.example.com`
- `$PORTAINER_ENDPOINT_ID` — integer id of the target Docker endpoint
- `$REPO_URL` — `https://github.com/<you>/employee-timesheet` (your fork)

## 0 · Pre-flight

You need:

- A Google OAuth 2.0 **Web Client** in your own GCP project — note the Client ID.
- Portainer-UI or API access to the target Docker host.

That's it. Each user who signs in either reuses their existing sheet
(via localStorage) or auto-creates a fresh one in their own Google
Drive on first sign-in; no server-side sheet provisioning needed.
Programmatic callers of `/api/*` bring their own OAuth access token.

See the [README](../README.md#google-cloud-setup) for the GCP walkthrough.

---

## 1 · DNS

Add an **A record** in your DNS provider:

```
$DEPLOY_HOSTNAME.   A   $VPS_IP
```

Confirm:

```bash
dig +short "$DEPLOY_HOSTNAME"
# expect: $VPS_IP
```

If your VPS domain already has a wildcard / CNAME-to-apex record covering
`*.<domain>`, you can skip this step — subdomains resolve automatically.

## 2 · OAuth origins

In **GCP Console → APIs & Services → Credentials**, edit your OAuth 2.0 Web
Client and add these **Authorized JavaScript origins**:

- `https://$DEPLOY_HOSTNAME`
- `http://localhost:5173` (for local dev)

No redirect URIs needed — we use the GIS implicit/token flow.

## 3 · Portainer stack

Authenticate to the Portainer API:

```bash
TOKEN=$(curl -s -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PORTAINER_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")
```

Create a git-based stack:

```bash
PAYLOAD=$(python3 -c "
import json, os
print(json.dumps({
  'name': 'timesheet',
  'repositoryURL': os.environ['REPO_URL'],
  'repositoryReferenceName': 'refs/heads/main',
  'composeFile': 'docker-compose.yml',
  'env': [
    {'name': 'VITE_GOOGLE_CLIENT_ID', 'value': os.environ['OAUTH_CLIENT_ID']},
    # Optional: comma-separated allowlist. Leave empty to allow any account
    # that passes your GCP consent screen.
    {'name': 'VITE_ALLOWED_GOOGLE_EMAIL', 'value': os.environ.get('ALLOWED_EMAILS', '')},
    # Optional: default sheet id baked into the bundle. Leave empty for
    # multi-user — each user gets a sheet auto-created in their Drive.
    {'name': 'VITE_SHEET_ID', 'value': os.environ.get('DEFAULT_SHEET_ID', '')},
  ]
}))
")

curl -s -X POST \
  "$PORTAINER_URL/api/stacks/create/standalone/repository?endpointId=$PORTAINER_ENDPOINT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

That's the whole env surface:

| Variable | Required? | What |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | yes | OAuth 2.0 Web Client ID from your GCP project. Public — baked into the JS bundle. |
| `VITE_ALLOWED_GOOGLE_EMAIL` | no | Comma-separated allowlist. Empty = any GCP-approved Google account. |
| `VITE_SHEET_ID` | no | Default sheet id. Empty = first sign-in auto-creates one in the user's Drive. |

No `GOOGLE_SERVICE_ACCOUNT_JSON`. No `AGENT_API_KEY`. No maintainer
secrets. The container stores nothing account-specific.

## 4 · Reverse proxy / TLS (NPM example)

With Nginx Proxy Manager:

- **Domain Names:** `$DEPLOY_HOSTNAME`
- **Scheme:** `http`
- **Forward Hostname / IP:** `timesheet` (container name on the shared proxy network — see `docker-compose.yml`)
- **Forward Port:** `80`
- **Block Common Exploits:** on
- **Websockets Support:** off
- **SSL:** Let's Encrypt cert, Force SSL on, HTTP/2 on, HSTS optional.

The container joins the `npm_proxy` external network by default (change the network name in `docker-compose.yml` if yours is named differently). Any reverse proxy (Caddy, Traefik, native nginx, Cloudflare Tunnel, etc.) works — just point it at the `timesheet` container on port 80.

## 5 · Smoke test

```bash
curl -I "https://$DEPLOY_HOSTNAME/"
# expect HTTP/2 200

curl "https://$DEPLOY_HOSTNAME/api/health"
# expect 200 { "auth": "oauth-bearer", ... }

# Programmatic /api/* call (replace TOKEN + SHEET_ID with yours):
ACCESS_TOKEN=$(gcloud auth application-default print-access-token)
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://$DEPLOY_HOSTNAME/api/employees?sheetId=<spreadsheet-id>"
```

Then hit the URL in a browser, sign in, verify the Dashboard loads.

## 6 · Redeploying

Every push to `main` is a candidate deploy. Kick the stack to pull + rebuild:

```bash
STACK_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/stacks" \
  | python3 -c "import sys,json;[print(s['Id']) for s in json.load(sys.stdin) if s['Name']=='timesheet']")

curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$PORTAINER_URL/api/stacks/$STACK_ID/git/redeploy?endpointId=$PORTAINER_ENDPOINT_ID" \
  -d '{"pullImage": true}'
```

For hands-off redeploys, configure Portainer's git webhook and point your GitHub repo at it via **Settings → Webhooks**.

## 7 · Troubleshooting

- **`redirect_uri_mismatch` or `origin_mismatch` on sign-in.** The OAuth client is missing `https://$DEPLOY_HOSTNAME` in its Authorized JavaScript origins list. Re-check step 2.
- **`401 missing_bearer_token` from `/api/*`.** You didn't pass `Authorization: Bearer <oauth-access-token>`. Health is unauthenticated but every other endpoint requires a Google OAuth token.
- **`400 missing_sheet_id` from `/api/*`.** Add `?sheetId=<spreadsheet-id>` to the request.
- **`401` / `403` from `/api/*` after the token is supplied.** Token is invalid, expired, or missing the `https://www.googleapis.com/auth/spreadsheets` scope. Mint a fresh one.
- **Sheet returns `permission denied`.** The authenticated account doesn't have access to that sheet — share it with them (or a service account whose key is producing the token).
- **Dashboard tab doesn't update.** Hit "Sync to sheet" in the app header or "Initialize / rebuild Dashboard tab" in Settings. The app auto-rebuilds on employee add / reorder / toggle.
- **Container restart loop.** Check container logs in Portainer; usually an nginx config syntax error or a sidecar boot error. The Dockerfile's HEALTHCHECK pings `/api/health`, so Portainer flags unhealthy containers in red.
