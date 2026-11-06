#!/usr/bin/env bash
# Captures and measures the checked-out Borges as it is ("as-is") and with
# the two full-record prototypes from trace-variants.php, into OUT_DIR.
# The embed and pieces prototypes need #252's context fix checked out (README, "Running it").
# Usage: TRACE_STACK=… run-variants.sh OUT_DIR [variant ...]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$1"; shift
variants=("${@:-as-is embed pieces}")
for v in ${variants[@]}; do
	opt="$v"; [ "$v" = "as-is" ] && opt=""
	TRACE_STACK="$TRACE_STACK" php "$here/variant.php" "$opt"
	sleep 3 # PHP rechecks changed files every 2 s (opcache.revalidate_freq)
	"$here/capture.sh" "$out/$v"
done
TRACE_STACK="$TRACE_STACK" php "$here/variant.php" ""
python3 -I "$here/measure.py" "$here/../markup-value/corpus.json" \
	http://localhost:8890/what-a-bibliography-tells-machines/ $(for v in ${variants[@]}; do echo "$out/$v"; done) | tee "$out/survival.md"
