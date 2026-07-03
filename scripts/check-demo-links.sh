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
#   - for every `resource: "url"` step, resolve the target (stripping the
#     CORS-proxy prefix) and fail if it is not reachable.
#
# Run locally:  npm run test:demo-links
# In CI:        .github/workflows/demo-links.yml (scheduled + manual)

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PROXY_PREFIX="https://wordpress-playground-cors-proxy.net/?"

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

	# Check every url-resource install target is reachable.
	urls=$(jq -r '.. | objects | select(.resource? == "url") | .url' "$bp" 2>/dev/null || true)
	[ -n "$urls" ] || continue

	# Iterate without a pipe so $fail survives the loop (POSIX subshell rule).
	IFS='
'
	for url in $urls; do
		[ -n "$url" ] || continue
		target=${url#"$PROXY_PREFIX"}
		checked=$((checked + 1))
		printf 'checking %-28s %s\n' "$name" "$target"
		# Prefer HEAD; some hosts reject it, so fall back to a 1-byte ranged GET.
		if curl -fsSL --retry 2 --max-time 60 -o /dev/null -I "$target" 2>/dev/null; then
			:
		elif curl -fsSL --retry 2 --max-time 60 -o /dev/null -r 0-0 "$target" 2>/dev/null; then
			:
		else
			echo "  DEAD LINK: $target (in $name)"
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
