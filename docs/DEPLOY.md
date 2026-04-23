# Deploying

Runbook for standing the timesheet webapp up behind a reverse proxy on any
VPS. Reference deployment uses a git-based Portainer stack + Nginx Proxy
Manager for TLS — substitute your own Docker host and proxy if you prefer.

Placeholders used throughout:

- `$DEPLOY_HOSTNAME` — e.g. `timesheet.example.com`
- `$VPS_IP` — public IP of the host
- `$PORTAINER_URL` — e.g. `https://portainer.example.com`
- `$PORTAINER_ENDPOINT_ID` — integer id of the target Docker endpoint
- `$REPO_URL` — `https://github.com/<you>/employee-timesheet` (your fork)

## 0 · Pre-flight

You need:

- A Google Sheet with a header row on `_Config` tab — the app creates the rest.
- A service account JSON key with the **Google Sheets API** enabled (free tier).
- The service account's `client_email` shared as **Editor** on the Sheet.
- A Google OAuth 2.0 **Web Client** (also free) — note the Client ID.
- Portainer-UI or API access to the target Docker host.

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

Create a git-based stack (single-quoted heredoc avoids shell expansion on the env values):

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
    {'name': 'VITE_ALLOWED_GOOGLE_EMAIL', 'value': os.environ['ALLOWED_EMAIL']},
    {'name': 'VITE_SHEET_ID', 'value': os.environ['SHEET_ID']},
    {'name': 'GOOGLE_SERVICE_ACCOUNT_JSON', 'value': os.environ['SA_JSON']},
    {'name': 'AGENT_API_KEY', 'value': os.environ['AGENT_API_KEY']}
  ]
}))
")

curl -s -X POST \
  "$PORTAINER_URL/api/stacks/create/standalone/repository?endpointId=$PORTAINER_ENDPOINT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Generate `AGENT_API_KEY`:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`GOOGLE_SERVICE_ACCOUNT_JSON` must be single-line.** Use `JSON.stringify(JSON.parse(raw))` or `python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)))" < key.json`. If the sidecar logs `JSON.parse` failures or `DECODER routines::unsupported` after boot, the `\n` inside `private_key` was stripped — re-paste with escapes intact.

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
# expect 200 with service metadata

curl -H "X-Agent-Key: $AGENT_API_KEY" "https://$DEPLOY_HOSTNAME/api/employees"
# expect JSON array of employees (empty [] until you add some)
```

Then hit the URL in a browser, sign in with the allowlisted Google account, verify Dashboard loads.

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
- **`403 forbidden` on `/api/*`.** Your `X-Agent-Key` header value doesn't match the `AGENT_API_KEY` env var in the stack. Check for trailing whitespace.
- **Sidecar 500s with `invalid_grant` or `DECODER routines::unsupported`.** `GOOGLE_SERVICE_ACCOUNT_JSON` was pasted with mangled `\n` sequences in `private_key`. Redeploy with clean single-line JSON.
- **Dashboard tab doesn't update.** Hit "Sync to sheet" in the app header or "Initialize / rebuild Dashboard tab" in Settings. The app auto-rebuilds on employee add / reorder / toggle.
- **Container restart loop.** Check the container logs in Portainer; usually an nginx config syntax error or a sidecar boot error. The Dockerfile's HEALTHCHECK pings `/api/health`, so Portainer flags unhealthy containers in red.
