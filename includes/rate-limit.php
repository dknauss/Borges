<?php
/**
 * Rate limiting for the bulk write routes (Phase 05, M4 / Tier 4).
 *
 * Two layers, both kept only in short-lived cache entries:
 *
 * - A per-caller budget counted in posts, not requests, over a fixed window
 *   (default 250 posts per 15 minutes per user). A request for 25 posts
 *   costs 25, and dry runs cost the same as writes, because a dry run does
 *   all the formatting a write does. A request that asks for more than the
 *   caller has left is clipped to what is left; only a caller with nothing
 *   left gets a 429.
 * - A site-wide lock, so only one committing bulk request runs at a time.
 *   Dry runs skip it.
 *
 * Counters live in the object cache when the site has a persistent one
 * (`wp_cache_add()` and `wp_cache_incr()` are atomic there), and in
 * transients otherwise. The transient path reads, adds, and writes, so two
 * parallel requests from one caller can overshoot the budget by up to one
 * batch; commits are serialized by the lock, so only dry runs can race.
 * Windows are aligned to multiples of their length, so a counter's key
 * changes when its window ends and stale counters simply expire.
 *
 * Nothing here adds an option, a cron event, or a table: transients use the
 * plugin's `bbb_` prefix, which uninstall already removes, and the cache
 * group is flushed on uninstall.
 *
 * Every number is a filter, for hosts:
 *
 * - `bibliography_builder_bulk_rate_limit` — `array( 'posts' => 250, 'window' => 900 )`,
 *   or false to turn the budget off for a caller.
 * - `bibliography_builder_bulk_rate_limit_key` — whose budget a request spends;
 *   `user:<id>` by default.
 * - `bibliography_builder_bulk_max_posts_per_request` — batch cap, default 25.
 * - `bibliography_builder_bulk_time_budget` — seconds after which a request
 *   stops starting new posts, default 15.
 *
 * WP-CLI does not use the budget or the lock: someone with a shell is
 * already the site's operator, and the budget exists to stop runaway HTTP
 * loops. See `docs/rest-write-routes.md`, "Bulk reformat".
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Object-cache group for rate-limit counters and the bulk lock.
 */
const BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP = 'bibliography_builder_rate_limit';

/**
 * Seconds a caller is told to wait when another bulk write holds the lock.
 */
const BIBLIOGRAPHY_BUILDER_BULK_LOCK_RETRY_AFTER = 5;

/**
 * Seconds past the time budget before an abandoned lock frees itself, so a
 * request killed mid-run cannot block bulk writes for long.
 */
const BIBLIOGRAPHY_BUILDER_BULK_LOCK_GRACE = 30;

/**
 * The bulk budget for a user.
 *
 * @param int $user_id User spending the budget.
 * @return array{posts:int,window:int}|null Null when the budget is off.
 */
function bibliography_builder_bulk_rate_limit( $user_id ) {
	/**
	 * Filters the bulk routes' per-caller budget.
	 *
	 * Return false to turn the budget off, for a trusted integration user
	 * for example. The site-wide lock on committing requests still applies.
	 *
	 * @param array|false $limit   `posts` per `window` seconds. Default 250 per 900.
	 * @param int         $user_id User making the request.
	 */
	$limit = apply_filters(
		'bibliography_builder_bulk_rate_limit',
		array(
			'posts'  => 250,
			'window' => 900,
		),
		$user_id
	);

	if ( ! is_array( $limit ) ) {
		return null;
	}

	return array(
		'posts'  => max( 1, (int) ( $limit['posts'] ?? 250 ) ),
		'window' => max( 1, (int) ( $limit['window'] ?? 900 ) ),
	);
}

/**
 * Whose budget a request spends.
 *
 * @param int                  $user_id User making the request.
 * @param WP_REST_Request|null $request The request, when there is one.
 * @return string
 */
function bibliography_builder_bulk_rate_limit_key( $user_id, $request = null ) {
	/**
	 * Filters the key a bulk request's posts are counted under.
	 *
	 * The default gives each user a budget. Return `site` for one budget
	 * the whole site shares, or a host's own key.
	 *
	 * @param string               $key     Default `user:<id>`.
	 * @param int                  $user_id User making the request.
	 * @param WP_REST_Request|null $request The request, when there is one.
	 */
	return (string) apply_filters(
		'bibliography_builder_bulk_rate_limit_key',
		'user:' . $user_id,
		$user_id,
		$request
	);
}

/**
 * Most posts one bulk request may name.
 *
 * @return int Between 1 and 100.
 */
function bibliography_builder_bulk_max_posts_per_request() {
	/**
	 * Filters the most posts one bulk request may name.
	 *
	 * @param int $max Default 25. Clamped to 1–100.
	 */
	return min( 100, max( 1, (int) apply_filters( 'bibliography_builder_bulk_max_posts_per_request', 25 ) ) );
}

/**
 * Seconds after which a bulk request stops starting new posts.
 *
 * A request always finishes the post it is on, and always does at least
 * one post. When PHP has an execution limit, the budget stays under half
 * of it, so the response is sent before PHP gives up.
 *
 * @return float
 */
function bibliography_builder_bulk_time_budget() {
	/**
	 * Filters how long a bulk request keeps starting new posts.
	 *
	 * @param int|float $seconds Default 15. Clamped to 0–300.
	 */
	$budget = min( 300.0, max( 0.0, (float) apply_filters( 'bibliography_builder_bulk_time_budget', 15 ) ) );
	$limit  = (int) ini_get( 'max_execution_time' );

	return 0 < $limit ? min( $budget, $limit / 2 ) : $budget;
}

/**
 * The window a counter falls in.
 *
 * @param int      $window Window length in seconds.
 * @param int|null $now    Current Unix time; defaults to time().
 * @return array{start:int,reset:int}
 */
function bibliography_builder_rate_limit_window( $window, $now = null ) {
	$now   = null === $now ? time() : $now;
	$start = $now - ( $now % $window );

	return array(
		'start' => $start,
		'reset' => $start + $window,
	);
}

/**
 * Cache key for a caller's counter in a window.
 *
 * @param string $key   Rate-limit key.
 * @param int    $start Window start.
 * @return string
 */
function bibliography_builder_rate_limit_counter_key( $key, $start ) {
	return 'bulk:' . md5( $key ) . ':' . $start;
}

/**
 * Posts a caller has spent in the current window.
 *
 * @param string $key   Rate-limit key.
 * @param array  $limit `{ posts, window }`.
 * @return int
 */
function bibliography_builder_rate_limit_used( $key, $limit ) {
	$window  = bibliography_builder_rate_limit_window( $limit['window'] );
	$counter = bibliography_builder_rate_limit_counter_key( $key, $window['start'] );

	if ( wp_using_ext_object_cache() ) {
		return (int) wp_cache_get( $counter, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP );
	}

	$transient = bibliography_builder_get_transient_cache_key( BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, $counter );

	return (int) get_transient( $transient );
}

/**
 * Spend posts from a caller's budget, or give them back.
 *
 * @param string $key   Rate-limit key.
 * @param array  $limit `{ posts, window }`.
 * @param int    $posts Posts to spend; negative to give back.
 * @return int Posts spent in the window afterwards.
 */
function bibliography_builder_rate_limit_spend( $key, $limit, $posts ) {
	$window  = bibliography_builder_rate_limit_window( $limit['window'] );
	$counter = bibliography_builder_rate_limit_counter_key( $key, $window['start'] );
	$ttl     = max( 1, $window['reset'] - time() );

	if ( wp_using_ext_object_cache() ) {
		// Add is a no-op when the counter exists; incr and decr are atomic.
		wp_cache_add( $counter, 0, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, $ttl );
		$used = 0 <= $posts
			? wp_cache_incr( $counter, $posts, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP )
			: wp_cache_decr( $counter, -$posts, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP );

		return false === $used ? max( 0, $posts ) : $used;
	}

	$transient = bibliography_builder_get_transient_cache_key( BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, $counter );
	$used      = max( 0, (int) get_transient( $transient ) + $posts );
	set_transient( $transient, $used, $ttl );

	return $used;
}

/**
 * The caller's budget as response data and headers.
 *
 * @param array $limit `{ posts, window }`.
 * @param int   $used  Posts spent in the window.
 * @return array{limit:int,remaining:int,reset:int} `reset` is seconds from now.
 */
function bibliography_builder_rate_limit_state( $limit, $used ) {
	$window = bibliography_builder_rate_limit_window( $limit['window'] );

	return array(
		'limit'     => $limit['posts'],
		'remaining' => max( 0, $limit['posts'] - $used ),
		'reset'     => max( 0, $window['reset'] - time() ),
	);
}

/**
 * Add the IETF draft RateLimit headers to a response.
 *
 * @param WP_REST_Response $response Response.
 * @param array|null       $state    bibliography_builder_rate_limit_state(), or null when off.
 * @return WP_REST_Response
 */
function bibliography_builder_with_rate_limit_headers( $response, $state ) {
	if ( is_array( $state ) ) {
		$response->header( 'RateLimit-Limit', (string) $state['limit'] );
		$response->header( 'RateLimit-Remaining', (string) $state['remaining'] );
		$response->header( 'RateLimit-Reset', (string) $state['reset'] );
	}

	return $response;
}

/**
 * Take the site-wide bulk write lock.
 *
 * @param float $time_budget The request's time budget, in seconds.
 * @return string|false A token to release the lock with, or false when
 *                      another request holds it.
 */
function bibliography_builder_bulk_lock_acquire( $time_budget ) {
	$token = wp_generate_uuid4();
	$ttl   = (int) ceil( $time_budget ) + BIBLIOGRAPHY_BUILDER_BULK_LOCK_GRACE;

	if ( wp_using_ext_object_cache() ) {
		// Add only succeeds when no one holds the lock: atomic.
		return wp_cache_add( 'bulk-lock', $token, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, $ttl ) ? $token : false;
	}

	$transient = bibliography_builder_get_transient_cache_key( BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, 'bulk-lock' );

	if ( false !== get_transient( $transient ) ) {
		return false;
	}

	set_transient( $transient, $token, $ttl );

	return $token;
}

/**
 * Release the site-wide bulk write lock, if this request still holds it.
 *
 * @param string $token Token from bibliography_builder_bulk_lock_acquire().
 * @return void
 */
function bibliography_builder_bulk_lock_release( $token ) {
	if ( wp_using_ext_object_cache() ) {
		if ( wp_cache_get( 'bulk-lock', BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP ) === $token ) {
			wp_cache_delete( 'bulk-lock', BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP );
		}

		return;
	}

	$transient = bibliography_builder_get_transient_cache_key( BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, 'bulk-lock' );

	if ( get_transient( $transient ) === $token ) {
		delete_transient( $transient );
	}
}
