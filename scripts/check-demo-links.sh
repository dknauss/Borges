#!/bin/sh
# Demo Link Monitor
#
# Verifies that every WordPress Playground demo blueprint in this repo installs
# from a live, reachable source — and that none reintroduce the browser-broken
# `git:directory` resource (WordPress/wordpress-playground#3875, which crashes
# hosted-browser installs with "createHash is not a function").
#
# For each blueprint under playground/ and .wordpress-org/blueprints/:
#   - fail if any install step uses `resource: "git:directory"`
#   - for every `resource: "url"` step, probe the full install URL (through the
#     CORS proxy, exactly as Playground fetches it) and fail if it is unreachable.
#
# Run locally:  npm run test:demo-links
# In CI:        .github/workflows/demo-links.yml (scheduled + manual)

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if ! command -v jq >/dev/null 2>&1; then
	echo "Demo link check FAILED: jq is required but not installed." >&2
	exit 1
fi

fail=0
checked=0

for bp in "$ROOT"/playground/blueprint*.json "$ROOT"/.wordpress-org/blueprints/*.json; do
	[ -f "$bp" ] || continue
	name=$(basename "$bp")

	# Guard: git:directory is broken in the hosted browser Playground.
	if jq -e '.. | objects | select(.resource? == "git:directory")' "$bp" >/dev/null 2>&1; then
		echo "  BROWSER-BROKEN: $name uses resource \"git:directory\" — see wordpress-playground#3875"
		fail=1
	fi

	# Check every url-resource install target is reachable. Fail loudly if the
	# blueprint is not valid JSON, rather than silently treating an unparseable
	# file as "no URLs to check".
	if ! urls=$(jq -r '.. | objects | select(.resource? == "url") | .url' "$bp"); then
		echo "  ERROR: could not parse $name (invalid JSON)"
		fail=1
		continue
	fi
	[ -n "$urls" ] || continue

	# Iterate without a pipe so $fail survives the loop (POSIX subshell rule).
	IFS='
'
	for url in $urls; do
		[ -n "$url" ] || continue
		checked=$((checked + 1))
		# Probe the FULL install URL the Blueprint uses (through the CORS proxy),
		# not just the underlying GitHub asset — so a proxy outage that would break
		# the live demo is caught even when the raw asset is still reachable.
		printf 'checking %-28s %s\n' "$name" "$url"
		# Prefer HEAD; some hosts reject it, so fall back to a 1-byte ranged GET.
		if curl -fsSL --retry 2 --max-time 60 -o /dev/null -I "$url" 2>/dev/null; then
			:
		elif curl -fsSL --retry 2 --max-time 60 -o /dev/null -r 0-0 "$url" 2>/dev/null; then
			:
		else
			echo "  DEAD LINK: $url (in $name)"
			fail=1
		fi
	done
	unset IFS
done

if [ "$fail" -ne 0 ]; then
	echo "Demo link check FAILED." >&2
	exit 1
fi

echo "Demo link check OK — $checked install URL(s) reachable, no git:directory."
