#!/bin/sh
# Time POST /bibliography/v1/format with a full 200-entry bibliography, and a
# trivial REST route as a baseline.
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
# Per style, each run sends two requests:
#   cold  every title made unique to the run, so no cache answers and every
#         entry is rendered (a first format or a style switch)
#   edit  the same list with one title changed, so the formatter's entry
#         cache answers for the other entries (an author editing a citation)
# Before the styles, GET /wp/v2/users/me is timed with the same credentials:
# WordPress boot, authentication, and REST dispatch with no formatting, so
# subtracting it from a /format time leaves roughly the plugin's own work.
#
# Environment:
#   RUNS       runs per style and baseline requests (default 5)
#   STYLES     space-separated style keys
#              (default: chicago-notes-bibliography chicago-author-date ieee)
#   FIXTURE    CSL-JSON array (default: src/benchmarks/fixtures/csl-200.json)
#   MAX_MS     fail if any request takes longer, and give up on it at that
#              point (default: 0, no limit)
#   OUTPUT     also append the result lines to this file
#
# Prints one line for the baseline and two per style:
#   route-timing route=users-me runs=<n> p50_ms=<n> max_ms=<n>
#   format-timing style=<key> mode=cold|edit items=<n> runs=<n> p50_ms=<n> max_ms=<n>
# and exits non-zero if a request fails, returns the wrong entry count, or
# exceeds MAX_MS.
set -eu

if [ "$#" -ne 3 ]; then
	sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//' >&2
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
MAX_TIME_ARGS=""

if [ "$MAX_MS" -gt 0 ]; then
	MAX_TIME_ARGS="--max-time $(awk -v ms="$MAX_MS" 'BEGIN { printf "%.3f", ms / 1000 }')"
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

status=0

# request <label> <method> <url> [body-file]
# Sends one request, checks for HTTP 200 and MAX_MS, and appends its time in
# milliseconds to $WORK_DIR/times-<label>.
request() {
	label="$1"
	method="$2"
	url="$3"
	body="${4:-}"

	# shellcheck disable=SC2086 # MAX_TIME_ARGS is empty or two words.
	if [ -n "$body" ]; then
		result=$(curl -sS -X "$method" -u "$AUTH_USER:$AUTH_PASSWORD" $MAX_TIME_ARGS \
			-H 'Content-Type: application/json' --data-binary "@$body" \
			-o "$WORK_DIR/response.json" -w '%{http_code} %{time_total}' "$url") || result=""
	else
		result=$(curl -sS -X "$method" -u "$AUTH_USER:$AUTH_PASSWORD" $MAX_TIME_ARGS \
			-o "$WORK_DIR/response.json" -w '%{http_code} %{time_total}' "$url") || result=""
	fi

	if [ -z "$result" ]; then
		echo "$label failed: no response within the limit or connection error" >&2
		exit 1
	fi

	code=${result% *}
	ms=$(awk -v s="${result#* }" 'BEGIN { printf "%d", s * 1000 }')

	if [ "$code" != "200" ]; then
		echo "$label failed: HTTP $code" >&2
		head -c 1000 "$WORK_DIR/response.json" >&2
		echo >&2
		exit 1
	fi

	if [ "$MAX_MS" -gt 0 ] && [ "$ms" -gt "$MAX_MS" ]; then
		echo "$label took ${ms} ms, over the ${MAX_MS} ms limit" >&2
		status=1
	fi

	echo "$ms" >> "$WORK_DIR/times-${label%% *}"
}

# summary <prefix> <times-label>: "<prefix> runs=<n> p50_ms=<n> max_ms=<n>"
summary() {
	line=$(sort -n "$WORK_DIR/times-$2" | awk -v prefix="$1" '
		{ t[NR] = $1 }
		END {
			printf "%s runs=%d p50_ms=%d max_ms=%d\n", prefix, NR, t[int((NR + 1) / 2)], t[NR]
		}')
	echo "$line"

	if [ -n "$OUTPUT" ]; then
		echo "$line" >> "$OUTPUT"
	fi
}

check_entries() {
	entries=$(jq '.entries | length' "$WORK_DIR/response.json")

	if [ "$entries" != "$ITEM_COUNT" ]; then
		echo "format-timing $1 returned $entries of $ITEM_COUNT entries" >&2
		exit 1
	fi
}

run=1
while [ "$run" -le "$RUNS" ]; do
	request "baseline run=$run" GET "$REST_URL/wp/v2/users/me"
	run=$((run + 1))
done
summary "route-timing route=users-me" baseline

for style in $STYLES; do
	run=1

	while [ "$run" -le "$RUNS" ]; do
		token="$run-$$-$(date +%s)"
		jq -c --arg style "$style" --arg token "$token" \
			'{style: $style, cslItems: map(.title += " " + $token)}' \
			"$FIXTURE" > "$WORK_DIR/cold.json"
		request "cold style=$style run=$run" POST "$REST_URL/bibliography/v1/format" "$WORK_DIR/cold.json"
		check_entries "style=$style mode=cold run=$run"

		jq -c --argjson i "$(( (run * 37) % ITEM_COUNT ))" \
			'.cslItems[$i].title += " (edited)"' \
			"$WORK_DIR/cold.json" > "$WORK_DIR/edit.json"
		request "edit style=$style run=$run" POST "$REST_URL/bibliography/v1/format" "$WORK_DIR/edit.json"
		check_entries "style=$style mode=edit run=$run"

		run=$((run + 1))
	done

	summary "format-timing style=$style mode=cold items=$ITEM_COUNT" cold
	summary "format-timing style=$style mode=edit items=$ITEM_COUNT" edit
	rm -f "$WORK_DIR/times-cold" "$WORK_DIR/times-edit"
done

exit "$status"
