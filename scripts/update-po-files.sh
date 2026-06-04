#!/usr/bin/env sh
# Update all PO files against the current POT.
#
# Merges new/changed source strings into each locale's PO file, marking
# them fuzzy so translators can find them. Existing translations are
# preserved unchanged.
#
# Requires gettext (msgmerge) OR WP-CLI (wp i18n update-po).
#
# Usage:
#   sh scripts/update-po-files.sh
#
# Install gettext if missing:
#   brew install gettext
#
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LANG_DIR="$ROOT/languages"
POT="$LANG_DIR/borges-bibliography-builder.pot"

if [ ! -f "$POT" ]; then
    echo "POT file not found: $POT" >&2
    echo "Regenerate it first: wp i18n make-pot . languages/borges-bibliography-builder.pot --domain=borges-bibliography-builder --exclude=node_modules,vendor" >&2
    exit 1
fi

PO_COUNT=$(find "$LANG_DIR" -name '*.po' | wc -l | tr -d ' ')
if [ "$PO_COUNT" -eq 0 ]; then
    echo "No .po files found in $LANG_DIR" >&2
    exit 1
fi

if command -v msgmerge >/dev/null 2>&1; then
    echo "Using msgmerge (gettext)"
    find "$LANG_DIR" -name '*.po' | sort | while read -r po; do
        locale=$(basename "$po" .po | sed 's/borges-bibliography-builder-//')
        printf "  %-10s %s\n" "$locale" "$po"
        msgmerge --update --backup=none --quiet "$po" "$POT"
    done
elif command -v wp >/dev/null 2>&1; then
    echo "Using wp i18n update-po (WP-CLI)"
    wp i18n update-po "$POT" "$LANG_DIR"
else
    echo "Neither msgmerge nor wp-cli found." >&2
    echo "Install gettext:  brew install gettext" >&2
    echo "Install WP-CLI:   brew install wp-cli" >&2
    exit 1
fi

echo "Done. Updated $PO_COUNT PO files against $(basename "$POT")."
echo "Review fuzzy-marked strings and rebuild MO files when ready:"
echo "  for po in $LANG_DIR/*.po; do msgfmt -o \"\${po%.po}.mo\" \"\$po\"; done"
