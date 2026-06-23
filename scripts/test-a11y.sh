#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
PORT="${PLAYGROUND_PORT_A11Y:-9404}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_DIR="${ROOT_DIR}/.tmp/playground-e2e"
LOG_FILE="${LOG_DIR}/a11y.log"

mkdir -p "$LOG_DIR"
rm -f "$LOG_FILE"

cleanup() {
	if [ -n "${PLAYGROUND_PID:-}" ] && kill -0 "$PLAYGROUND_PID" 2>/dev/null; then
		kill "$PLAYGROUND_PID" 2>/dev/null || true
		wait "$PLAYGROUND_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT INT TERM

CI=1 npx @wp-playground/cli@3.1.40 server --auto-mount --login --port="$PORT" \
	>"$LOG_FILE" 2>&1 &
PLAYGROUND_PID=$!

attempt=0
until curl -fsS "$BASE_URL" >/dev/null 2>&1; do
	attempt=$((attempt + 1))
	if [ "$attempt" -gt 120 ]; then
		echo "Timed out waiting for Playground at $BASE_URL" >&2
		cat "$LOG_FILE" >&2 || true
		exit 1
	fi
	sleep 2
done

PLAYWRIGHT_BASE_URL="$BASE_URL" npx playwright test tests/e2e/a11y.spec.js
