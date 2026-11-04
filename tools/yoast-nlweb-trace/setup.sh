#!/usr/bin/env bash
# Builds the local trace site: WordPress on SQLite, Borges (this checkout),
# Yoast SEO, and NLWeb (its WordPress plugin and its Python ingest code),
# then serves it on localhost:8890 with the LLM stub on localhost:8891.
#
# Usage: TRACE_STACK=/some/empty/dir tools/yoast-nlweb-trace/setup.sh
# Needs PHP 8.x with pdo_sqlite, Python 3.10+, git, and composer; the
# checkout needs `composer install` and `npm run build` first.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
stack="${TRACE_STACK:?set TRACE_STACK to an empty folder}"
mkdir -p "$stack" && cd "$stack"

# Versions the study used (README.md). Yoast-dist holds Yoast's built plugin.
WP_TAG=7.1.4 YOAST_TAG=28.8 SQLITE_TAG=v3.1.3 NLWEB_SHA=b423f15d9aeaa023ce75993ac9deed2354597043
[ -d wp ] || git clone -q --depth 1 --branch "$WP_TAG" https://github.com/WordPress/WordPress wp
[ -d yoast ] || git clone -q --depth 1 --branch "$YOAST_TAG" https://github.com/Yoast-dist/wordpress-seo yoast
[ -d sqlite ] || git clone -q --depth 1 --branch "$SQLITE_TAG" https://github.com/WordPress/sqlite-database-integration sqlite
if [ ! -d nlweb ]; then
	git clone -q https://github.com/microsoft/NLWeb nlweb
	git -C nlweb checkout -q "$NLWEB_SHA"
fi

rm -rf site && cp -r wp site && rm -rf site/.git
p=site/wp-content/plugins
cp -r sqlite/packages/plugin-sqlite-database-integration "$p/sqlite-database-integration"
rm -rf "$p/sqlite-database-integration/wp-includes/database"
cp -r sqlite/packages/mysql-on-sqlite/src "$p/sqlite-database-integration/wp-includes/database"
sed -e "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$stack/$p/sqlite-database-integration#" \
	-e "s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#" \
	"$p/sqlite-database-integration/db.copy" > site/wp-content/db.php
cp -r yoast "$p/wordpress-seo" && rm -rf "$p/wordpress-seo/.git"
# Yoast-dist expects the consumer's autoloader; make the plugin its own.
# --no-scripts: its post-autoload-dump script deletes the built DI container.
(cd "$p/wordpress-seo" && COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload -q --no-dev --no-scripts --classmap-authoritative)
cp -r nlweb/code/wordpress/nlweb "$p/nlweb"
ln -sfn "$repo" "$p/bibliography-builder"
mkdir -p site/wp-content/mu-plugins
ln -sf "$here/trace-variants.php" site/wp-content/mu-plugins/trace-variants.php

cat > site/wp-config.php <<'PHP'
<?php
define( 'DB_NAME', 'wp' ); define( 'DB_USER', '' ); define( 'DB_PASSWORD', '' ); define( 'DB_HOST', '' );
define( 'DB_CHARSET', 'utf8mb4' ); define( 'DB_COLLATE', '' ); define( 'DB_ENGINE', 'sqlite' );
foreach ( array( 'AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT' ) as $k ) { define( $k, 'local-trace-only' ); }
$table_prefix = 'wp_';
define( 'WP_DEBUG', true ); define( 'WP_DEBUG_LOG', true ); define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_HOME', 'http://localhost:8890' ); define( 'WP_SITEURL', 'http://localhost:8890' );
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', __DIR__ . '/' ); }
require_once ABSPATH . 'wp-settings.php';
PHP

# NLWeb's Python ingest needs only a few packages for the functions we call.
[ -d venv ] || python3 -m venv venv
venv/bin/pip -q install numpy chardet beautifulsoup4 pyyaml python-dotenv aiohttp requests

# The fixture post: the markup-value corpus, saved by Borges' PHP save() port.
MV_OUT="$stack/mv" php "$repo/tools/markup-value/render.php"
php "$here/site.php" install
php "$here/site.php" configure "$stack/mv/borges-default.post-content.html"

php -S localhost:8890 -t site "$here/router.php" > server.log 2>&1 &
php -S localhost:8891 -t "$here/llm-stub" > llmstub.log 2>&1 &
sleep 1
echo "Site: http://localhost:8890/what-a-bibliography-tells-machines/"
