#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
RUNTIME_ROOT="${WP_BIBLIO_RUNTIME_ROOT:-$ROOT_DIR/.tmp/runtime-matrix}"
SERVER="${WP_BIBLIO_SERVER:-apache}"
PHP_VERSION="${WP_BIBLIO_PHP_VERSION:-8.3}"
WP_VERSION="${WP_BIBLIO_WP_VERSION:-latest}"
DB_ENGINE="${WP_BIBLIO_DB_ENGINE:-mysql}"
MULTISITE="${WP_BIBLIO_MULTISITE:-0}"
HTTP_PORT="${WP_BIBLIO_HTTP_PORT:-8899}"
DB_PORT="${WP_BIBLIO_DB_PORT:-33069}"
SITE_URL="http://127.0.0.1:${HTTP_PORT}"
WORKDIR="${RUNTIME_ROOT}/${SERVER}-php${PHP_VERSION}-wp${WP_VERSION}-${DB_ENGINE}$([ "$MULTISITE" = "1" ] && printf '%s' '-multisite' || true)"
SITE_DIR="${WORKDIR}/site"
COMPOSE_FILE="${WORKDIR}/docker-compose.yml"
NGINX_CONF="${WORKDIR}/nginx.conf"
PLUGIN_DIR="$ROOT_DIR"
ARTIFACT_DIR="${WP_BIBLIO_ARTIFACT_DIR:-$WORKDIR/artifacts}"
ARTIFACT_RESPONSE_DIR="$ARTIFACT_DIR/http"
WORDPRESS_IMAGE="wordpress:php${PHP_VERSION}-$([ "$SERVER" = "nginx" ] && printf 'fpm' || printf 'apache')"
SQLITE_PLUGIN_SLUG="sqlite-database-integration"

rm -rf "$WORKDIR"
mkdir -p "$SITE_DIR" "$ARTIFACT_RESPONSE_DIR"

collect_artifacts() {
	status="$1"
	mkdir -p "$ARTIFACT_RESPONSE_DIR"
	{
		echo "server=$SERVER"
		echo "php_version=$PHP_VERSION"
		echo "wp_version=$WP_VERSION"
		echo "db_engine=$DB_ENGINE"
		echo "multisite=$MULTISITE"
		echo "site_url=$SITE_URL"
		echo "http_port=$HTTP_PORT"
		echo "db_port=$DB_PORT"
		echo "status=$status"
		echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	} > "$ARTIFACT_DIR/summary.txt"
	cp "$COMPOSE_FILE" "$ARTIFACT_DIR/docker-compose.yml" 2>/dev/null || true
	cp "$NGINX_CONF" "$ARTIFACT_DIR/nginx.conf" 2>/dev/null || true
	docker compose -f "$COMPOSE_FILE" ps -a > "$ARTIFACT_DIR/docker-ps.txt" 2>&1 || true
	docker compose -f "$COMPOSE_FILE" logs --no-color > "$ARTIFACT_DIR/docker-logs.txt" 2>&1 || true
	wp_exec 'php -v' > "$ARTIFACT_DIR/php-version.txt" 2>&1 || true
	wp_exec 'php -r '\''echo extension_loaded("pdo_sqlite") ? "1" : "0";'\''' > "$ARTIFACT_DIR/pdo-sqlite.txt" 2>&1 || true
	wp_exec 'wp core version --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/wp-version.txt" 2>&1 || true
	wp_exec 'wp plugin list --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/plugin-list.txt" 2>&1 || true
	wp_exec 'wp eval '\''echo defined( "DB_ENGINE" ) ? DB_ENGINE : "undefined";'\'' --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/db-engine.txt" 2>&1 || true
	docker version > "$ARTIFACT_DIR/docker-version.txt" 2>&1 || true
	docker compose version > "$ARTIFACT_DIR/docker-compose-version.txt" 2>&1 || true
	wp_exec 'wp option get home --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/home-url.txt" 2>&1 || true
	wp_exec 'wp site list --fields=blog_id,url --format=csv --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/site-list.csv" 2>&1 || true
}

cleanup() {
	docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}

finish() {
	status=$?
	collect_artifacts "$status"
	cleanup
	exit "$status"
}
trap finish EXIT INT TERM

if [ "$SERVER" = "nginx" ]; then
	cat > "$NGINX_CONF" <<'NGINXEOF'
server {
    listen 80;
    server_name _;
    root /var/www/html;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass wordpress:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
NGINXEOF
fi

cat > "$COMPOSE_FILE" <<EOF2
services:
EOF2

if [ "$DB_ENGINE" = "mysql" ]; then
	cat >> "$COMPOSE_FILE" <<EOF2
  db:
    image: mariadb:11
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: wordpress
      MARIADB_ROOT_PASSWORD: rootpass
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 20

EOF2
fi

cat >> "$COMPOSE_FILE" <<EOF2
  wordpress:
    image: ${WORDPRESS_IMAGE}
EOF2

if [ "$DB_ENGINE" = "mysql" ]; then
	cat >> "$COMPOSE_FILE" <<EOF2
    depends_on:
      db:
        condition: service_healthy
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
EOF2
fi

if [ "$SERVER" = "apache" ]; then
	cat >> "$COMPOSE_FILE" <<EOF2
    ports:
      - "${HTTP_PORT}:80"
EOF2
fi

cat >> "$COMPOSE_FILE" <<EOF2
    volumes:
      - ${SITE_DIR}:/var/www/html
      - ${PLUGIN_DIR}:/var/www/html/wp-content/plugins/bibliography
EOF2

if [ "$SERVER" = "nginx" ]; then
	cat >> "$COMPOSE_FILE" <<EOF2

  nginx:
    image: nginx:1.27-alpine
    depends_on:
      - wordpress
    ports:
      - "${HTTP_PORT}:80"
    volumes:
      - ${SITE_DIR}:/var/www/html:ro
      - ${NGINX_CONF}:/etc/nginx/conf.d/default.conf:ro
EOF2
fi

echo "Starting runtime smoke environment: server=${SERVER} php=${PHP_VERSION} wp=${WP_VERSION} db=${DB_ENGINE}"
docker compose -f "$COMPOSE_FILE" up -d

install_wp_cli() {
	docker compose -f "$COMPOSE_FILE" exec -T wordpress sh -lc '
		if ! command -v wp >/dev/null 2>&1; then
			curl -fsSL -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
			chmod +x /usr/local/bin/wp
		fi
	'
}

wait_for_http() {
	attempt=0
	until curl -fsS "$SITE_URL/wp-login.php" >/dev/null 2>&1; do
		attempt=$((attempt + 1))
		if [ "$attempt" -gt 60 ]; then
			echo "Timed out waiting for $SITE_URL" >&2
			exit 1
		fi
		sleep 2
	done
}

# Wait until the web server has loaded the plugin's REST routes.
#
# The WordPress image writes wp-config.php at container start, and the first
# readiness request caches it in opcache. `wp core multisite-install` then
# rewrites it, but opcache only re-checks a file's timestamp every couple of
# seconds (revalidate_freq), so a request inside that window still runs as a
# single site, where a network-activated plugin is not loaded and every route
# 404s with rest_no_route. Poll the REST index instead of racing it.
wait_for_plugin_routes() {
	attempt=0
	until curl -fsS "$SITE_URL/?rest_route=/" 2>/dev/null | grep -q 'bibliography\\*/v1'; do
		attempt=$((attempt + 1))
		if [ "$attempt" -gt 30 ]; then
			echo "Timed out waiting for bibliography/v1 routes at $SITE_URL" >&2
			curl -sS "$SITE_URL/?rest_route=/" | head -c 2000 >&2 || true
			echo >&2
			exit 1
		fi
		sleep 1
	done
}

wp_exec() {
	docker compose -f "$COMPOSE_FILE" exec -T wordpress sh -lc "$1"
}

capture_http() {
	name="$1"
	url="$2"
	body_file="$ARTIFACT_RESPONSE_DIR/${name}.body"
	headers_file="$ARTIFACT_RESPONSE_DIR/${name}.headers"
	status=$(curl -sSL -D "$headers_file" -o "$body_file" -w '%{http_code}' "$url")

	# Print the failing response in the job log: artifacts expire and are not
	# always reachable, and the status alone does not say which layer refused.
	if [ "$status" -ge 400 ]; then
		echo "HTTP $status from $name: $url" >&2
		head -c 2000 "$body_file" >&2
		echo >&2
		return 1
	fi
}

ensure_wp_version() {
	if [ "$WP_VERSION" = "latest" ]; then
		return
	fi
	CURRENT_VERSION=$(wp_exec 'wp core version --allow-root --path=/var/www/html')
	if [ "$CURRENT_VERSION" != "$WP_VERSION" ]; then
		wp_exec "wp core download --version=$WP_VERSION --force --skip-content --allow-root --path=/var/www/html"
	fi
}

ensure_wp_config_mysql() {
	wp_exec 'if [ ! -f /var/www/html/wp-config.php ]; then wp config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost=db:3306 --skip-check --allow-root --path=/var/www/html; fi'
}

ensure_wp_config_sqlite() {
	wp_exec 'if [ ! -f /var/www/html/wp-config.php ]; then wp config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost=127.0.0.1 --skip-check --allow-root --path=/var/www/html; fi'
}

bootstrap_mysql_site() {
	ensure_wp_version
	ensure_wp_config_mysql
	if [ "$MULTISITE" = "1" ]; then
		wp_exec "wp core is-installed --allow-root --path=/var/www/html || wp core multisite-install --allow-root --path=/var/www/html --url=$SITE_URL --title='Borges Bibliography Builder Smoke Network' --admin_user=admin --admin_password=password --admin_email=admin@example.com"
		wp_exec 'wp core is-installed --network --allow-root --path=/var/www/html'
	else
		wp_exec "wp core is-installed --allow-root --path=/var/www/html || wp core install --allow-root --path=/var/www/html --url=$SITE_URL --title='Borges Bibliography Builder Smoke' --admin_user=admin --admin_password=password --admin_email=admin@example.com"
	fi
}

bootstrap_sqlite_site() {
	ensure_wp_version
	ensure_wp_config_sqlite
	wp_exec "wp plugin install ${SQLITE_PLUGIN_SLUG} --force --allow-root --path=/var/www/html"
	wp_exec 'wp eval '\''require_once WP_PLUGIN_DIR . "/sqlite-database-integration/load.php"; sqlite_plugin_copy_db_file(); echo file_exists( WP_CONTENT_DIR . "/db.php" ) ? "db-dropin-installed" : "db-dropin-missing";'\'' --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/sqlite-activation.txt"
	grep -q 'db-dropin-installed' "$ARTIFACT_DIR/sqlite-activation.txt"
	wp_exec "wp core is-installed --allow-root --path=/var/www/html || wp core install --allow-root --path=/var/www/html --url=$SITE_URL --title='Bibliography Builder Smoke (SQLite)' --admin_user=admin --admin_password=password --admin_email=admin@example.com"
	wp_exec "wp plugin activate ${SQLITE_PLUGIN_SLUG} --allow-root --path=/var/www/html"
	wp_exec 'wp eval '\''echo defined( "DB_ENGINE" ) ? DB_ENGINE : "undefined";'\'' --allow-root --path=/var/www/html' > "$ARTIFACT_DIR/sqlite-db-engine-after-install.txt"
	grep -q '^sqlite$' "$ARTIFACT_DIR/sqlite-db-engine-after-install.txt"
}

wait_for_http
install_wp_cli

if [ "$DB_ENGINE" = "sqlite" ]; then
	bootstrap_sqlite_site
else
	bootstrap_mysql_site
fi

if [ "$MULTISITE" = "1" ]; then
	wp_exec 'wp plugin activate bibliography --network --allow-root --path=/var/www/html'
	wp_exec 'wp plugin is-active bibliography --network --allow-root --path=/var/www/html'
else
	wp_exec 'wp plugin activate bibliography --allow-root --path=/var/www/html'
fi

BLOCK_CONTENT=$(cat <<'BLOCKEOF'
<!-- wp:bibliography-builder/bibliography {"citationStyle":"chicago-notes-bibliography","headingText":"References","outputJsonLd":true,"outputCoins":false,"outputCslJson":false,"citations":[{"id":"alpha-1","formattedText":"Alpha citation.","csl":{"type":"book","title":"Alpha Book","author":[{"family":"Alpha","given":"Ada"}],"issued":{"date-parts":[[2024]]}}}]} -->
<div class="wp-block-bibliography-builder-bibliography"><p class="bibliography-builder-heading">References</p><ul class="bibliography-builder-list bibliography-builder-list-unordered bibliography-builder-list-chicago-notes-bibliography"><li id="bibliography-builder-alpha-1" class="bibliography-builder-entry"><cite class="bibliography-builder-entry-text">Alpha citation.</cite></li></ul></div>
<!-- /wp:bibliography-builder/bibliography -->
BLOCKEOF
)

POST_ID=$(docker compose -f "$COMPOSE_FILE" exec -T -e BLOCK_CONTENT="$BLOCK_CONTENT" wordpress sh -lc 'wp post create --allow-root --path=/var/www/html --post_type=post --post_status=publish --post_title="Runtime Matrix Smoke" --post_content="$BLOCK_CONTENT" --porcelain')
printf '%s\n' "$POST_ID" > "$ARTIFACT_DIR/post-id.txt"

wait_for_plugin_routes

capture_http frontend "$SITE_URL/?p=$POST_ID"
capture_http rest-collection "$SITE_URL/?rest_route=/bibliography/v1/posts/$POST_ID/bibliographies"
capture_http rest-text "$SITE_URL/?rest_route=/bibliography/v1/posts/$POST_ID/bibliographies/0&format=text"
capture_http rest-csl-json "$SITE_URL/?rest_route=/bibliography/v1/posts/$POST_ID/bibliographies/0&format=csl-json"

grep -q 'bibliography-builder-entry-text' "$ARTIFACT_RESPONSE_DIR/frontend.body"
grep -q '"entryCount":1' "$ARTIFACT_RESPONSE_DIR/rest-collection.body"
grep -q '^Alpha citation\.$' "$ARTIFACT_RESPONSE_DIR/rest-text.body"
grep -q '"title":"Alpha Book"' "$ARTIFACT_RESPONSE_DIR/rest-csl-json.body"

if [ "$DB_ENGINE" = "sqlite" ]; then
	wp_exec 'wp eval '\''echo defined( "DB_ENGINE" ) ? DB_ENGINE : "undefined";'\'' --allow-root --path=/var/www/html' | grep -q '^sqlite$'
fi

echo "Runtime smoke passed: server=${SERVER} php=${PHP_VERSION} wp=${WP_VERSION} db=${DB_ENGINE} multisite=${MULTISITE}"
