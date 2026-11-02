#!/bin/bash
# Runs each prompt through the Codex CLI once and saves its final answer.
# The prompts are the .txt files beside this script; answers go to answers/.
# Usage: bash run.sh  (set CODEX=/path/to/codex if it is not on PATH)
set -u
cd "$(dirname "$0")"
# bash doesn't load zsh's PATH, so look for the Codex CLI in the usual places.
CODEX="${CODEX:-$(command -v codex || zsh -lic 'command -v codex' 2>/dev/null | tail -1)}"
for c in /opt/homebrew/bin/codex /usr/local/bin/codex "$HOME/.npm-global/bin/codex" \
	/Applications/Codex.app/Contents/Resources/codex /Applications/ChatGPT.app/Contents/Resources/codex; do
	[ -n "$CODEX" ] && [ -x "$CODEX" ] && break
	[ -x "$c" ] && CODEX="$c"
done
if [ -z "$CODEX" ] || [ ! -x "$CODEX" ]; then
	echo "Codex CLI not found. Install it with: brew install codex   (or: npm install -g @openai/codex), run 'codex' once to sign in, then rerun."
	exit 1
fi
echo "Using $CODEX"
mkdir -p answers
for p in extract-apa-12 extract-oscola-12 extract-chicago-36 questions-plain questions-borges; do
	echo "== $p"
	"$CODEX" exec --skip-git-repo-check --sandbox read-only \
		--output-last-message "answers/$p.txt" - < "$p.txt" > "answers/$p.log" 2>&1 \
		&& echo "   saved answers/$p.txt" || echo "   failed: see answers/$p.log"
done
"$CODEX" --version > answers/codex-version.txt 2>&1
echo "Done."
