#!/usr/bin/env bash
#
# Verify that the figures recorded in docs/current-metrics.md still match reality.
#
# The metrics doc is hand-verified: every number carries the command used to derive
# it. This script guards against the doc silently going stale when a counted
# quantity changes. It is deliberately narrow -- see "Scope" below.
#
# Usage: .github/scripts/verify-metrics.sh [path/to/current-metrics.md]
#
# Scope
# -----
# Verified here (platform-independent and deterministic):
#   * lines of code       -- main plugin file, all first-party PHP, JS source
#   * persistence audit   -- the no-options/no-cron/no-CPT grep must stay empty
#
# NOT verified here, on purpose:
#   * du-based footprint figures (vendor/, languages/, build/, total, ZIP). `du`
#     reports allocated blocks, so the same tree measures differently across
#     filesystems and between macOS and the Linux CI runner. Asserting them would
#     produce failures that say nothing about the repository.
#   * built asset byte sizes (build/view.js, build/style-index.css). Webpack output
#     is only byte-stable for a fixed toolchain; the recorded values come from a
#     local Node 24 build while CI builds on Node 22.
#   Those figures stay hand-verified -- re-derive them with the commands in the doc
#   when you touch packaging or the build.

set -euo pipefail

DOC="${1:-docs/current-metrics.md}"

if [[ ! -f "$DOC" ]]; then
	echo "verify-metrics: cannot find metrics doc at '$DOC'" >&2
	exit 2
fi

failures=0

# Pull the bolded value out of the table row whose first cell contains $1.
# Strips thousands separators so "1,928" compares as 1928.
doc_value() {
	local label="$1" value
	value="$(grep -F -- "$label" "$DOC" | grep -o '\*\*[0-9,]\+\*\*' | head -1 | tr -d '*,')"
	if [[ -z "$value" ]]; then
		echo "verify-metrics: no bolded number found for row '$label' in $DOC" >&2
		exit 2
	fi
	printf '%s' "$value"
}

check() {
	local name="$1" documented="$2" actual="$3"
	if [[ "$documented" == "$actual" ]]; then
		printf '  ok    %-38s %s\n' "$name" "$actual"
	else
		printf '  DRIFT %-38s documented %s, actual %s\n' "$name" "$documented" "$actual"
		failures=$((failures + 1))
	fi
}

echo "Verifying $DOC"

# --- Lines of code -----------------------------------------------------------

actual_main="$(wc -l < bibliography-builder.php | tr -d ' ')"
check "bibliography-builder.php lines" "$(doc_value 'Main plugin file')" "$actual_main"

actual_php="$(find . -name '*.php' \
	-not -path './vendor/*' \
	-not -path './node_modules/*' \
	-not -path './tests/*' \
	-not -path './packages/*' \
	-not -path './scripts/*' \
	-not -path './output/*' \
	-not -path './build/*' \
	-print0 | xargs -0 wc -l | tail -1 | awk '{print $1}')"
check "all first-party PHP lines" "$(doc_value 'All first-party PHP')" "$actual_php"

actual_js="$(find ./src -name '*.js' -not -name '*.test.js' \
	-print0 | xargs -0 wc -l | tail -1 | awk '{print $1}')"
check "JS source lines" "$(doc_value 'JS source')" "$actual_js"

# --- Persistence / hook audit ------------------------------------------------
#
# The doc claims zero persistent settings, options, cron events, CPTs, or custom
# tables. That claim underpins the "0 additional queries" runtime figure, so it is
# worth enforcing rather than trusting.

persistence_hits="$(grep -rEl \
	'add_option|update_option|register_setting|register_post_type|dbDelta|wp_schedule_event' \
	--include='*.php' . 2>/dev/null | grep -vE 'vendor|tests|node_modules' || true)"

if [[ -z "$persistence_hits" ]]; then
	printf '  ok    %-38s NONE\n' "persistence/hook audit"
else
	printf '  DRIFT %-38s expected NONE, found:\n' "persistence/hook audit"
	while IFS= read -r hit; do
		printf '          %s\n' "$hit"
	done <<<"$persistence_hits"
	failures=$((failures + 1))
fi

# --- Result ------------------------------------------------------------------

echo
if (( failures > 0 )); then
	cat >&2 <<-EOF
		verify-metrics: $failures figure(s) in $DOC no longer match the repository.

		Re-derive the affected numbers with the command in the doc's own
		"Re-derivation command" column and update $DOC in the same commit as the
		change that moved them.
	EOF
	exit 1
fi

echo "verify-metrics: all checked figures match."
