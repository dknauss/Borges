<?php
/**
 * Bulk write routes (Phase 05, M4 / Tier 4).
 *
 * POST /bibliography/v1/bulk/reformat switches every bibliography in up to
 * 25 posts to one citation style. Like the other write routes it is off
 * unless the `bibliography_builder_enable_write_routes` filter returns true,
 * a dry run unless `dry_run=false`, and refuses to save a post whose ETag
 * has changed. It needs `edit_others_posts`, and `edit_post` on each post.
 *
 * It works in synchronous batches rather than background jobs, so the
 * plugin stores no job records and schedules no cron events. A request does
 * the posts it can within its batch cap, its caller's budget, and a time
 * budget, and returns the rest as `remaining`; the client sends those next.
 * Each post commits on its own, through the same reformat, splice, and
 * verify path as POST …/reformat, so a failure on one post never undoes
 * another. The budget and the site-wide lock are in includes/rate-limit.php.
 *
 * Request:
 *
 *     POST /wp-json/bibliography/v1/bulk/reformat?dry_run=false
 *     { "style": "mla-9", "posts": [ { "id": 12, "etag": "\"…\"" }, … ] }
 *
 * Response (200, whatever happened to each post):
 *
 *     { "dryRun": false, "style": "mla-9",
 *       "results": [ { "postId": 12, "status": "changed", "etag": "\"…\"",
 *                      "bibliographies": [ { "index": 0, "bibliographyId": "…", "changes": { … } } ] } ],
 *       "remaining": [ { "id": 13, "etag": "\"…\"" } ],
 *       "rateLimit": { "limit": 250, "remaining": 224, "reset": 611 } }
 *
 * A post's status is `preview` (dry run), `changed`, `unchanged` (already in
 * that style, nothing to save), `skipped` (missing, not editable, or no
 * bibliography), or `failed` (an entry could not be formatted, a missing or
 * stale ETag, or a failed save); the last two carry an `error`.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Permission callback: `edit_others_posts`, as the design memo's capability
 * matrix sets for bulk operations. Each post's `edit_post` is checked as the
 * request reaches it.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_bulk_permissions_check() {
	if ( current_user_can( 'edit_others_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_bulk_forbidden',
		__( 'Sorry, you are not allowed to edit bibliographies across posts.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Validate the `posts` list of a bulk request.
 *
 * @param mixed $posts Decoded `posts` value.
 * @param int   $max   Most posts allowed.
 * @return array<int, array{id:int,etag:string}>|WP_Error
 */
function bibliography_builder_bulk_posts_param( $posts, $max ) {
	$invalid = new WP_Error(
		'bibliography_builder_invalid_bulk_posts',
		sprintf(
			/* translators: %d: most posts one request may name. */
			__(
				'Send "posts": 1 to %d objects, each with a post "id" and, to save, the "etag" from a dry run or read.',
				'borges-bibliography-builder'
			),
			$max
		),
		array( 'status' => 400 )
	);

	if (
		! is_array( $posts )
		|| array() === $posts
		|| count( $posts ) > $max
		|| ! bibliography_builder_is_list_array( $posts )
	) {
		return $invalid;
	}

	$list = array();
	$seen = array();

	foreach ( $posts as $entry ) {
		if ( ! is_array( $entry ) || ! isset( $entry['id'] ) || ! is_int( $entry['id'] ) || 0 >= $entry['id'] ) {
			return $invalid;
		}

		if ( isset( $entry['etag'] ) && ! is_string( $entry['etag'] ) ) {
			return $invalid;
		}

		if ( isset( $seen[ $entry['id'] ] ) ) {
			return new WP_Error(
				'bibliography_builder_duplicate_bulk_post',
				/* translators: %d: post ID. */
				sprintf( __( 'Post %d is listed more than once.', 'borges-bibliography-builder' ), $entry['id'] ),
				array( 'status' => 400 )
			);
		}

		$seen[ $entry['id'] ] = true;
		$list[]               = array(
			'id'   => $entry['id'],
			'etag' => isset( $entry['etag'] ) ? trim( $entry['etag'] ) : '',
		);
	}

	return $list;
}

/**
 * A per-post error as response data.
 *
 * @param WP_Error $error Error.
 * @return array{code:string,message:string,status:int,entries?:mixed}
 */
function bibliography_builder_bulk_error_data( WP_Error $error ) {
	$data  = $error->get_error_data();
	$entry = array(
		'code'    => (string) $error->get_error_code(),
		'message' => $error->get_error_message(),
		'status'  => is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 500,
	);

	if ( is_array( $data ) && isset( $data['entries'] ) ) {
		$entry['entries'] = $data['entries'];
	}

	return $entry;
}

/**
 * Reformat every bibliography in one post, and save it unless dry running.
 *
 * Every block is rebuilt and spliced into the content in turn, and the post
 * is saved once, so it gains a single revision. If any block fails, nothing
 * is saved for that post.
 *
 * Shared by the bulk route and `wp borges reformat`.
 *
 * @param int    $post_id Post ID.
 * @param string $style   Supported style key.
 * @param bool   $dry_run Preview without saving.
 * @param string $etag    The ETag the caller based the change on; needed to save.
 * @return array Result: `postId`, `status`, and `etag`, `bibliographies`, or `error`.
 */
function bibliography_builder_bulk_reformat_post( $post_id, $style, $dry_run, $etag = '' ) {
	$result = array( 'postId' => $post_id );
	$post   = get_post( $post_id );

	if ( ! is_object( $post ) ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_post_not_found',
					__( 'Post not found.', 'borges-bibliography-builder' ),
					array( 'status' => 404 )
				)
			),
		);
	}

	if ( ! current_user_can( 'edit_post', $post->ID ) ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_write_forbidden',
					__( 'Sorry, you are not allowed to edit this bibliography.', 'borges-bibliography-builder' ),
					array( 'status' => 403 )
				)
			),
		);
	}

	$content = (string) $post->post_content;
	$current = bibliography_builder_post_etag( $post );
	$ranges  = bibliography_builder_locate_bibliography_blocks( $content );

	if ( is_wp_error( $ranges ) ) {
		return $result + array(
			'status' => 'failed',
			'error'  => bibliography_builder_bulk_error_data( $ranges ),
		);
	}

	if ( array() === $ranges ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_bibliography_not_found',
					__( 'The post has no bibliography.', 'borges-bibliography-builder' ),
					array( 'status' => 404 )
				)
			),
		);
	}

	$updated        = $content;
	$bibliographies = array();

	foreach ( $ranges as $index => $range ) {
		// Splicing earlier blocks moves later ones but never changes their
		// attributes, so the first location's attributes stay current.
		$change = bibliography_builder_write_reformat_attrs(
			bibliography_builder_write_to_arrays( $range['attrs'] ),
			$style
		);

		if ( is_wp_error( $change ) ) {
			return $result + array(
				'status' => 'failed',
				'error'  => array( 'index' => $index ) + bibliography_builder_bulk_error_data( $change ),
			);
		}

		$attrs  = bibliography_builder_decode_save_attributes( (string) wp_json_encode( $change['attrs'] ) );
		$block  = bibliography_builder_serialize_bibliography_block(
			$change['attrs'],
			bibliography_builder_render_save_markup( $attrs )
		);
		$splice = bibliography_builder_splice_bibliography_block( $updated, $index, $block );

		if ( is_wp_error( $splice ) ) {
			return $result + array(
				'status' => 'failed',
				'error'  => array( 'index' => $index ) + bibliography_builder_bulk_error_data( $splice ),
			);
		}

		$id               = $change['attrs']['bibliographyId'] ?? null;
		$updated          = $splice;
		$bibliographies[] = array(
			'index'          => $index,
			'bibliographyId' => null === $id ? null : (string) $id,
			'changes'        => $change['changes'],
		);
	}

	$result['bibliographies'] = $bibliographies;

	if ( $updated === $content ) {
		return $result + array(
			'status' => 'unchanged',
			'etag'   => $current,
		);
	}

	if ( $dry_run ) {
		return $result + array(
			'status' => 'preview',
			'etag'   => $current,
		);
	}

	if ( '' === $etag ) {
		$precondition = new WP_Error(
			'bibliography_builder_precondition_required',
			__( 'Send the ETag from a read or dry run to save this post.', 'borges-bibliography-builder' ),
			array( 'status' => 428 )
		);
	} elseif ( $etag !== $current && '*' !== $etag ) {
		$precondition = new WP_Error(
			'bibliography_builder_precondition_failed',
			__(
				'The post has changed since that ETag was issued. Read it again and retry.',
				'borges-bibliography-builder'
			),
			array( 'status' => 412 )
		);
	}

	if ( isset( $precondition ) ) {
		return $result + array(
			'status' => 'failed',
			'etag'   => $current,
			'error'  => bibliography_builder_bulk_error_data( $precondition ),
		);
	}

	$saved = wp_update_post(
		array(
			'ID'           => $post->ID,
			'post_content' => wp_slash( $updated ),
		),
		true
	);

	if ( is_wp_error( $saved ) ) {
		return $result + array(
			'status' => 'failed',
			'error'  => bibliography_builder_bulk_error_data( $saved ),
		);
	}

	return $result + array(
		'status' => 'changed',
		'etag'   => bibliography_builder_post_etag( get_post( $post->ID ) ),
	);
}

/**
 * An error response that can carry headers, which a WP_Error cannot.
 *
 * The body has the same shape WordPress gives a WP_Error.
 *
 * @param WP_Error   $error      Error, with `status` in its data.
 * @param array|null $rate_limit Rate-limit state for the headers, or null.
 * @param int|null   $retry      Seconds for Retry-After, or null.
 * @return WP_REST_Response
 */
function bibliography_builder_bulk_error_response( WP_Error $error, $rate_limit = null, $retry = null ) {
	$data     = (array) $error->get_error_data();
	$response = new WP_REST_Response(
		array(
			'code'    => $error->get_error_code(),
			'message' => $error->get_error_message(),
			'data'    => $data,
		),
		isset( $data['status'] ) ? (int) $data['status'] : 500
	);

	if ( null !== $retry ) {
		$response->header( 'Retry-After', (string) $retry );
	}

	return bibliography_builder_with_rate_limit_headers( $response, $rate_limit );
}

/**
 * POST /bulk/reformat: switch every bibliography in a batch of posts to one style.
 *
 * Checks run cheapest first, so a refused request does no work: the style
 * and post list, then the caller's budget, then (for a real write) the
 * site-wide lock, then each post's own `edit_post` and ETag.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_bulk_reformat( WP_REST_Request $request ) {
	if ( ! bibliography_builder_can_render_save_markup() ) {
		return new WP_Error(
			'bibliography_builder_write_unavailable',
			__(
				'This server cannot rebuild bibliography markup: the PHP intl extension is required.',
				'borges-bibliography-builder'
			),
			array( 'status' => 501 )
		);
	}

	/**
	 * WordPress documents an array, but returns null for an absent or invalid body.
	 *
	 * @var mixed $params
	 */
	$params = $request->get_json_params();
	$params = is_array( $params ) ? $params : array();
	$style  = isset( $params['style'] ) && is_string( $params['style'] ) ? $params['style'] : '';
	$styles = array_keys( bibliography_builder_get_formatter_style_definitions() );

	if ( ! in_array( $style, $styles, true ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_style',
			sprintf(
				/* translators: %s: comma-separated style keys. */
				__( 'Send "style": one of %s.', 'borges-bibliography-builder' ),
				implode( ', ', $styles )
			),
			array( 'status' => 400 )
		);
	}

	$posts = bibliography_builder_bulk_posts_param(
		$params['posts'] ?? null,
		bibliography_builder_bulk_max_posts_per_request()
	);

	if ( is_wp_error( $posts ) ) {
		return $posts;
	}

	$dry_run_arg = $request['dry_run'];
	$dry_run     = null === $dry_run_arg || false !== rest_sanitize_boolean( $dry_run_arg );
	$user_id     = get_current_user_id();
	$limit       = bibliography_builder_bulk_rate_limit( $user_id );
	$key         = bibliography_builder_bulk_rate_limit_key( $user_id, $request );
	$allowed     = count( $posts );
	$reserved    = 0;
	$state       = null;

	if ( null !== $limit ) {
		// Reserve the whole batch up front: with a persistent object cache the
		// increment is atomic, so parallel requests cannot both spend the
		// same posts. Whatever is over the budget, or never reached, is
		// given back below.
		$used     = bibliography_builder_rate_limit_spend( $key, $limit, $allowed );
		$over     = max( 0, $used - $limit['posts'] );
		$reserved = $allowed;
		$allowed  = max( 0, $allowed - $over );

		if ( 0 === $allowed ) {
			$used  = bibliography_builder_rate_limit_spend( $key, $limit, -$reserved );
			$state = bibliography_builder_rate_limit_state( $limit, $used );

			return bibliography_builder_bulk_error_response(
				new WP_Error(
					'bibliography_builder_rate_limited',
					__(
						'Bulk edit limit reached. Wait until the limit resets, then send the remaining posts.',
						'borges-bibliography-builder'
					),
					array(
						'status' => 429,
						'reset'  => $state['reset'],
					)
				),
				$state,
				$state['reset']
			);
		}
	}

	$budget = bibliography_builder_bulk_time_budget();
	$lock   = $dry_run ? null : bibliography_builder_bulk_lock_acquire( $budget );

	if ( false === $lock ) {
		if ( null !== $limit ) {
			$used  = bibliography_builder_rate_limit_spend( $key, $limit, -$reserved );
			$state = bibliography_builder_rate_limit_state( $limit, $used );
		}

		return bibliography_builder_bulk_error_response(
			new WP_Error(
				'bibliography_builder_bulk_busy',
				__( 'Another bulk edit is saving on this site. Try again shortly.', 'borges-bibliography-builder' ),
				array( 'status' => 429 )
			),
			$state,
			BIBLIOGRAPHY_BUILDER_BULK_LOCK_RETRY_AFTER
		);
	}

	$started = microtime( true );
	$results = array();

	try {
		foreach ( array_slice( $posts, 0, $allowed ) as $position => $entry ) {
			// Always do at least one post, then stop starting new ones once
			// the time budget is spent.
			if ( 0 < $position && microtime( true ) - $started >= $budget ) {
				break;
			}

			$results[] = bibliography_builder_bulk_reformat_post( $entry['id'], $style, $dry_run, $entry['etag'] );
		}
	} finally {
		if ( is_string( $lock ) ) {
			bibliography_builder_bulk_lock_release( $lock );
		}
	}

	if ( null !== $limit ) {
		$unused = $reserved - count( $results );
		$used   = 0 < $unused
			? bibliography_builder_rate_limit_spend( $key, $limit, -$unused )
			: bibliography_builder_rate_limit_used( $key, $limit );
		$state  = bibliography_builder_rate_limit_state( $limit, $used );
	}

	$response = rest_ensure_response(
		array(
			'dryRun'    => $dry_run,
			'style'     => $style,
			'results'   => $results,
			'remaining' => array_slice( $posts, count( $results ) ),
			'rateLimit' => $state,
		)
	);

	return bibliography_builder_with_rate_limit_headers( $response, $state );
}

/**
 * Register the bulk routes. Called from
 * bibliography_builder_register_write_routes(), so they follow its filter.
 *
 * @return void
 */
function bibliography_builder_register_bulk_routes() {
	register_rest_route(
		'bibliography/v1',
		'/bulk/reformat',
		array(
			'methods'             => 'POST',
			'callback'            => 'bibliography_builder_rest_bulk_reformat',
			'permission_callback' => 'bibliography_builder_rest_bulk_permissions_check',
			'args'                => array(
				'dry_run' => array(
					'description' => __(
						'Preview the change without saving. Defaults to true; pass false to write.',
						'borges-bibliography-builder'
					),
					'type'        => 'boolean',
					'default'     => true,
				),
			),
		)
	);
}
