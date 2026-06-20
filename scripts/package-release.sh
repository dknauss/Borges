#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RELEASE_ROOT="$ROOT_DIR/output/release"
STAGING_DIR="$RELEASE_ROOT/borges-bibliography-builder"
ZIP_PATH="$RELEASE_ROOT/borges-bibliography-builder.zip"

mkdir -p "$RELEASE_ROOT"
rm -rf "$STAGING_DIR" "$ZIP_PATH"
mkdir -p "$STAGING_DIR"

if [ -d "$ROOT_DIR/src" ] && grep -R -E 'CPAL-1\.0|AGPL-1\.0|creativecommons\.org/licenses/by-sa|Creative Commons Attribution-ShareAlike 3\.0' "$ROOT_DIR/src" >/dev/null 2>&1; then
	printf 'Source tree contains a non-GPL-compatible license marker.\n' >&2
	exit 1
fi

cp "$ROOT_DIR/bibliography-builder.php" "$STAGING_DIR/"
cp "$ROOT_DIR/block.json" "$STAGING_DIR/"
cp "$ROOT_DIR/readme.txt" "$STAGING_DIR/"
cp "$ROOT_DIR/LICENSE" "$STAGING_DIR/"
cp "$ROOT_DIR/THIRD-PARTY-NOTICES.txt" "$STAGING_DIR/"
cp -R "$ROOT_DIR/build" "$STAGING_DIR/build"
if [ -d "$ROOT_DIR/includes" ]; then
	cp -R "$ROOT_DIR/includes" "$STAGING_DIR/includes"
fi
if [ -d "$ROOT_DIR/languages" ]; then
	cp -R "$ROOT_DIR/languages" "$STAGING_DIR/languages"
fi
cp "$ROOT_DIR/composer.json" "$STAGING_DIR/"
# Keep Composer installs deterministic, then remove Composer metadata before zipping.
cp "$ROOT_DIR/composer.lock" "$STAGING_DIR/"
cp -R "$ROOT_DIR/packages" "$STAGING_DIR/packages"

composer install \
	--working-dir="$STAGING_DIR" \
	--no-dev \
	--no-interaction \
	--prefer-dist \
	--classmap-authoritative

rm -f "$STAGING_DIR/composer.json" "$STAGING_DIR/composer.lock"

find "$STAGING_DIR/vendor" \
	-type d \( -iname tests -o -iname test -o -iname .github -o -iname .circleci -o -iname docs -o -iname doc -o -iname documentation -o -iname example -o -iname examples -o -iname image -o -iname images \) \
	-prune -exec rm -rf {} +
find "$STAGING_DIR/vendor" \
	-type f \( -iname README -o -iname 'README.*' -o -iname CHANGELOG -o -iname 'CHANGELOG.*' -o -iname UPGRADING -o -iname 'UPGRADING.*' -o -iname phpunit.xml -o -iname phpunit.xml.dist -o -iname phpcs.xml -o -iname phpcs.xml.dist -o -iname .scrutinizer.yml \) \
	-delete
find "$STAGING_DIR/vendor" \
	-type f -name composer.json \
	-delete
find "$STAGING_DIR/vendor" \
	-type f \( -name '.editorconfig' -o -name '.gitattributes' -o -name '.gitignore' -o -name '.php-cs-fixer.dist.php' -o -name '.php_cs.dist' -o -name '.travis.yml' \) \
	-delete
find "$STAGING_DIR/vendor" \
	-type f \( \
		-name '*.png' -o \
		-name '*.jpg' -o \
		-name '*.jpeg' -o \
		-name '*.gif' -o \
		-name README.md -o \
		-name CHANGELOG.md -o \
		-name CONTRIBUTING.md -o \
		-name ISSUE_TEMPLATE.md -o \
		-name SECURITY.md \
	\) \
	-delete
rm -rf "$STAGING_DIR/packages"

FORBIDDEN_PACKAGE_METADATA=$(find "$STAGING_DIR" \
	\( -name composer.json -o -name composer.lock -o -name package.json -o -name package-lock.json -o -name yarn.lock -o -name pnpm-lock.yaml -o -name .DS_Store -o -name '.gitignore' -o -name '.gitattributes' \) \
	-print)

if [ -n "$FORBIDDEN_PACKAGE_METADATA" ]; then
	printf 'Release package staging directory contains forbidden package metadata:\n%s\n' "$FORBIDDEN_PACKAGE_METADATA" >&2
	exit 1
fi

if grep -R -E 'CPAL-1\.0|AGPL-1\.0|CC-BY-SA-3\.0|creativecommons\.org/licenses/by-sa|Creative Commons Attribution-ShareAlike 3\.0' "$STAGING_DIR/vendor" "$STAGING_DIR/build" >/dev/null 2>&1; then
	printf 'Release package contains a non-GPL-compatible license marker.\n' >&2
	exit 1
fi

(
	cd "$RELEASE_ROOT"
	zip -rq "$(basename "$ZIP_PATH")" "$(basename "$STAGING_DIR")"
)

printf 'Created release staging directory: %s\n' "$STAGING_DIR"
printf 'Created release zip: %s\n' "$ZIP_PATH"
