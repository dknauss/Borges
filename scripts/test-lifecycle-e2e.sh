#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ZIP_PATH="$ROOT_DIR/output/release/borges-bibliography-builder.zip"

# --- Server 1: auto-mount (activate/deactivate tests) ---
PORT_MOUNT="${PLAYGROUND_PORT_MOUNT:-9401}"
BASE_URL_MOUNT="http://127.0.0.1:${PORT_MOUNT}"
LOG_DIR="${ROOT_DIR}/.tmp/playground-e2e"
LOG_MOUNT="${LOG_DIR}/lifecycle-mount.log"

# --- Server 2: plain install (delete test — uploads zip via wp-admin) ---
PORT_ZIP="${PLAYGROUND_PORT_ZIP:-9402}"
BASE_URL_ZIP="http://127.0.0.1:${PORT_ZIP}"
LOG_ZIP="${LOG_DIR}/lifecycle-zip.log"

mkdir -p "$LOG_DIR"
rm -f "$LOG_MOUNT" "$LOG_ZIP"

# Build the release zip if it doesn't exist.
if [ ! -f "$ZIP_PATH" ]; then
	echo "Building release zip..."
	npm run build
	npm run package:release
fi

cleanup() {
	for pid in "${PID_MOUNT:-}" "${PID_ZIP:-}"; do
		if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
			kill "$pid" 2>/dev/null || true
			wait "$pid" 2>/dev/null || true
		fi
	done
}
trap cleanup EXIT INT TERM

# Wait for a Playground server to answer, or print both logs and fail.
wait_for_server() {
	attempt=0
	until curl -fsS "$1" >/dev/null 2>&1; do
		attempt=$((attempt + 1))
		if [ "$attempt" -gt 60 ]; then
			echo "Timed out waiting for Playground at $1" >&2
			cat "$LOG_MOUNT" "$LOG_ZIP" >&2 || true
			exit 1
		fi
		sleep 2
	done
}

# The servers start one after the other, not together. On a runner with no
# cached WordPress ZIP, both would download it to the same
# ~/.wordpress-playground/<version>.zip.partial, and the second rename fails
# with ENOENT. Once server 1 is up the ZIP is cached and server 2 reuses it.

# Start server 1 (auto-mount — plugin source is read-write mounted).
CI=1 npx @wp-playground/cli@3.1.40 server \
	--auto-mount --login --port="$PORT_MOUNT" \
	>"$LOG_MOUNT" 2>&1 &
PID_MOUNT=$!
wait_for_server "$BASE_URL_MOUNT"

# Start server 2 (plain — no plugin pre-installed; test uploads the zip).
CI=1 npx @wp-playground/cli@3.1.40 server \
	--login --port="$PORT_ZIP" \
	>"$LOG_ZIP" 2>&1 &
PID_ZIP=$!
wait_for_server "$BASE_URL_ZIP"

echo "Both Playground servers ready."

# Run activate/deactivate lifecycle tests (auto-mount server).
PLAYWRIGHT_BASE_URL="$BASE_URL_MOUNT" \
	npx playwright test tests/e2e/lifecycle.spec.js --grep-invert "delete"

# Run delete test (plain server — zip uploaded via wp-admin).
PLAYWRIGHT_BASE_URL="$BASE_URL_ZIP" \
	npx playwright test tests/e2e/lifecycle.spec.js --grep "delete"
