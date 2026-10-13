#!/bin/sh
# Time POST /bibliography/v1/format with a full 200-entry bibliography.
#
# The editor sends the whole bibliography to this route on every add, edit,
# and style switch, so this is the round trip an author waits on. It measures
# what the PHP-only benchmark (scripts/benchmark-formatter.php) cannot: plugin
# boot, REST dispatch, sanitizing, and the web server, on the host under test.
#
# Usage:
#   sh scripts/time-format-route.sh <rest-url> <user> <application-password>
#
#   <rest-url> is the REST root up to the route, either
#   https://example.com/wp-json or https://example.com/index.php?rest_route=
#
# Each request changes one title so the formatter cache never answers it.
#
# Environment:
#   RUNS       requests per style (default 5)
#   STYLES     space-separated style keys
#              (default: chicago-notes-bibliography chicago-author-date ieee)
#   FIXTURE    CSL-JSON array (default: src/benchmarks/fixtures/csl-200.json)
#   MAX_MS     fail if any request takes longer (default: 0, never fail)
#   OUTPUT     also append the result lines to this file
#
# Prints one line per style:
#   format-timing style=<key> items=<n> runs=<n> p50_ms=<n> max_ms=<n>
# and exits non-zero if a request fails, returns the wrong entry count, or
# exceeds MAX_MS.
set -eu

if [ "$#" -ne 3 ]; then
	sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//' >&2
	exit 2
fi

REST_URL="$1"
AUTH_USER="$2"
AUTH_PASSWORD="$3"
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
RUNS="${RUNS:-5}"
STYLES="${STYLES:-chicago-notes-bibliography chicago-author-date ieee}"
FIXTURE="${FIXTURE:-$ROOT_DIR/src/benchmarks/fixtures/csl-200.json}"
MAX_MS="${MAX_MS:-0}"
OUTPUT="${OUTPUT:-}"
ITEM_COUNT=$(jq 'length' "$FIXTURE")
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

status=0

for style in $STYLES; do
	: > "$WORK_DIR/times"
	run=1

	while [ "$run" -le "$RUNS" ]; do
		jq -c --arg style "$style" --arg run "$run-$$-$(date +%s)" \
			'{style: $style, cslItems: (.[0].title += " " + $run)}' \
			"$FIXTURE" > "$WORK_DIR/body.json"

		result=$(curl -sS -X POST -u "$AUTH_USER:$AUTH_PASSWORD" \
			-H 'Content-Type: application/json' \
			--data-binary "@$WORK_DIR/body.json" \
			-o "$WORK_DIR/response.json" \
			-w '%{http_code} %{time_total}' \
			"$REST_URL/bibliography/v1/format")
		code=${result% *}
		ms=$(awk -v s="${result#* }" 'BEGIN { printf "%d", s * 1000 }')

		if [ "$code" != "200" ]; then
			echo "format-timing style=$style run=$run failed: HTTP $code" >&2
			head -c 1000 "$WORK_DIR/response.json" >&2
			echo >&2
			exit 1
		fi

		entries=$(jq '.entries | length' "$WORK_DIR/response.json")

		if [ "$entries" != "$ITEM_COUNT" ]; then
			echo "format-timing style=$style run=$run returned $entries of $ITEM_COUNT entries" >&2
			exit 1
		fi

		if [ "$MAX_MS" -gt 0 ] && [ "$ms" -gt "$MAX_MS" ]; then
			echo "format-timing style=$style run=$run took ${ms} ms, over the ${MAX_MS} ms limit" >&2
			status=1
		fi

		echo "$ms" >> "$WORK_DIR/times"
		run=$((run + 1))
	done

	line=$(sort -n "$WORK_DIR/times" | awk -v style="$style" -v items="$ITEM_COUNT" '
		{ t[NR] = $1 }
		END {
			printf "format-timing style=%s items=%d runs=%d p50_ms=%d max_ms=%d\n",
				style, items, NR, t[int((NR + 1) / 2)], t[NR]
		}')
	echo "$line"

	if [ -n "$OUTPUT" ]; then
		echo "$line" >> "$OUTPUT"
	fi
done

exit "$status"
