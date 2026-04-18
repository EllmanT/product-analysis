#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

KEY_PATH="$SCRIPT_DIR/E-Invoicing_key.pem"
REMOTE_USER="azureuser"
REMOTE_HOST="172.209.208.109"
REMOTE_PATH="/var/www/frontend/"

# Angular application builder output (client bundle for static hosting / nginx)
DIST_BROWSER="$FRONTEND_ROOT/dist/e-invoicing/browser"

echo "==> Building production bundle..."
cd "$FRONTEND_ROOT"
npm run build -- --configuration production

if [ ! -d "$DIST_BROWSER" ]; then
  echo "❌ Browser build not found at $DIST_BROWSER"
  echo "   (Expected after: ng build — project name is e-invoicing)"
  exit 1
fi

if [ ! -f "$KEY_PATH" ]; then
  echo "❌ SSH private key not found: $KEY_PATH"
  exit 1
fi

echo "==> Fixing SSH key permissions..."
chmod 400 "$KEY_PATH"

echo "==> Deploying browser assets to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH} ..."

# Remove existing deployed files first (including dotfiles).
echo "==> Cleaning remote folder ${REMOTE_PATH} ..."
ssh -i "$KEY_PATH" "${REMOTE_USER}@${REMOTE_HOST}" "set -euo pipefail; mkdir -p '${REMOTE_PATH}'; rm -rf '${REMOTE_PATH%/}'/* '${REMOTE_PATH%/}'/.[!.]* '${REMOTE_PATH%/}'/..?* || true"

# Copy contents of browser/ into the web root (index.html, *.js, assets, etc.)
scp -r -i "$KEY_PATH" "$DIST_BROWSER"/* "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

echo "==> Deployment successful!"
echo "    Note: This uploads the static SPA only. If you serve SSR (Node), deploy"
echo "    dist/e-invoicing/server/ and run: node server/server.mjs separately."
