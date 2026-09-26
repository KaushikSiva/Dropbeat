#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUDIO_ROOT="${DROPBEAT_STUDIO_ROOT:-$APP_ROOT/studio}"
if [[ "${PLATFORM_NAME:-iphonesimulator}" != "iphonesimulator" ]]; then exit 0; fi
if [[ ! -f "$STUDIO_ROOT/node_modules/next/dist/bin/next" ]]; then
 echo "error: Run cd studio && npm ci once before launching DropBeat from Xcode."
 exit 1
fi
node "$STUDIO_ROOT/scripts/ios-server.cjs"
