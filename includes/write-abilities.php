<?php
/**
 * Write abilities for Borges bibliographies (Phase 05, M5 / Tier 5).
 *
 * Each ability wraps one of the write routes in `includes/write-routes.php`:
 * it builds the same request the route would get and calls the route's own
 * callback, so permissions, validation, dry runs, and the If-Match check are
 * one code path, not two that could drift apart.
 *
 * The abilities follow the routes' opt-in: they are registered only when the
 * `bibliography_builder_enable_write_routes` filter returns true. Like the
 * routes they need `edit_post` on the post, preview the change unless
 * `dry_run` is false, and need `etag` (the ETag from a read or dry run) to
 * save.
 *
 * `borges/bulk-reformat` and `borges/bulk-deduplicate` wrap the bulk routes
 * (includes/bulk-routes.php) the same way. They need `edit_others_posts` and
 * spend the same rate-limit budget as the routes.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Annotations for a write ability.
 *
 * @param bool $destructive Whether the ability can remove data.
 * @param bool $idempotent  Whether repeating the call changes nothing more.
 * @return array
 */
function bibliography_builder_get_write_ability_meta( $destructive, $idempotent ) {
	return array(
		'annotations'  => array(
			'readonly'    => false,
			'destructive' => $destructive,
			'idempotent'  => $idempotent,
		),
		'show_in_rest' => true,
	);
}

/**
 * Register the write abilities when the site has enabled the write routes.
 *
 * @return void
 */
function bibliography_builder_register_write_abilities() {
	if ( ! function_exists( 'wp_register_ability' ) || ! bibliography_builder_write_routes_enabled() ) {
		return;
	}

	$common      = array(
		'post_id'         => array(
			'type'        => 'integer',
			'minimum'     => 1,
			'description' => __( 'ID of the post with the bibliography block.', 'borges-bibliography-builder' ),
		),
		'index'           => array(
			'type'        => 'integer',
			'minimum'     => 0,
			'default'     => 0,
			'description' => __(
				'Zero-based position of the bibliography block within the post.',
				'borges-bibliography-builder'
			),
		),
		'bibliography_id' => array(
			'type'        => 'string',
			'pattern'     => '^' . BIBLIOGRAPHY_BUILDER_BLOCK_ID_PATTERN . '$',
			'description' => __(
				"The block's stable bibliographyId. Takes precedence over index when given.",
				'borges-bibliography-builder'
			),
		),
		'dry_run'         => array(
			'type'        => 'boolean',
			'default'     => true,
			'description' => __(
				'Preview the change without saving. Defaults to true; pass false to save.',
				'borges-bibliography-builder'
			),
		),
		'etag'            => array(
			'type'        => 'string',
			'description' => __(
				'The ETag from a read or dry run. Required to save; a stale one is refused.',
				'borges-bibliography-builder'
			),
		),
	);
	$citation_id = array(
		'type'        => 'string',
		'pattern'     => '^[^/\s]{1,128}$',
		'description' => __( 'ID of the citation within the bibliography.', 'borges-bibliography-builder' ),
	);
	$output      = array(
		'type'       => 'object',
		'properties' => array(
			'postId'       => array( 'type' => 'integer' ),
			'dryRun'       => array( 'type' => 'boolean' ),
			'changes'      => array( 'type' => 'object' ),
			'bibliography' => array( 'type' => 'object' ),
			'etag'         => array( 'type' => 'string' ),
		),
	);

	$abilities = array(
		'borges/add-citations'                => array(
			'label'       => __( 'Add citations', 'borges-bibliography-builder' ),
			'description' => __(
				'Adds CSL-JSON citations to one Borges bibliography. Duplicates are skipped and reported.',
				'borges-bibliography-builder'
			),
			'properties'  => array(
				'items' => array(
					'type'        => 'array',
					'minItems'    => 1,
					'maxItems'    => BIBLIOGRAPHY_BUILDER_MAX_ITEMS_PER_WRITE,
					'items'       => array( 'type' => 'object' ),
					'description' => __( 'CSL-JSON citation records to add.', 'borges-bibliography-builder' ),
				),
			),
			'required'    => array( 'items' ),
			'callback'    => 'bibliography_builder_ability_add_citations',
			'meta'        => bibliography_builder_get_write_ability_meta( false, false ),
		),
		'borges/update-citation'              => array(
			'label'       => __( 'Update a citation', 'borges-bibliography-builder' ),
			'description' => __(
				'Changes CSL-JSON fields of one citation and reformats it. A null value removes a field.',
				'borges-bibliography-builder'
			),
			'properties'  => array(
				'citation_id' => $citation_id,
				'fields'      => array(
					'type'          => 'object',
					'minProperties' => 1,
					'description'   => __(
						'CSL-JSON fields to set. "id" and "type" cannot be changed.',
						'borges-bibliography-builder'
					),
				),
			),
			'required'    => array( 'citation_id', 'fields' ),
			'callback'    => 'bibliography_builder_ability_update_citation',
			'meta'        => bibliography_builder_get_write_ability_meta( false, true ),
		),
		'borges/delete-citation'              => array(
			'label'       => __( 'Delete a citation', 'borges-bibliography-builder' ),
			'description' => __(
				'Removes one citation from a Borges bibliography and returns the removed entry.',
				'borges-bibliography-builder'
			),
			'properties'  => array( 'citation_id' => $citation_id ),
			'required'    => array( 'citation_id' ),
			'callback'    => 'bibliography_builder_ability_delete_citation',
			'meta'        => bibliography_builder_get_write_ability_meta( true, false ),
		),
		'borges/reorder-citations'            => array(
			'label'       => __( 'Reorder citations', 'borges-bibliography-builder' ),
			'description' => __(
				'Reorders the citations of a numeric-style Borges bibliography. Other styles sort themselves.',
				'borges-bibliography-builder'
			),
			'properties'  => array(
				'ids' => array(
					'type'        => 'array',
					'minItems'    => 1,
					'items'       => array( 'type' => 'string' ),
					'description' => __( 'Every citation ID, in the new order.', 'borges-bibliography-builder' ),
				),
			),
			'required'    => array( 'ids' ),
			'callback'    => 'bibliography_builder_ability_reorder_citations',
			'meta'        => bibliography_builder_get_write_ability_meta( false, true ),
		),
		'borges/update-bibliography-settings' => array(
			'label'       => __( 'Update bibliography settings', 'borges-bibliography-builder' ),
			'description' => __(
				'Changes block settings of one Borges bibliography, such as its heading. Citations are not touched.',
				'borges-bibliography-builder'
			),
			'properties'  => array(
				'settings' => array(
					'type'          => 'object',
					'minProperties' => 1,
					'description'   => __(
						'Block settings to change. Use borges/reformat-bibliography to change the citation style.',
						'borges-bibliography-builder'
					),
				),
			),
			'required'    => array( 'settings' ),
			'callback'    => 'bibliography_builder_ability_update_bibliography_settings',
			'meta'        => bibliography_builder_get_write_ability_meta( false, true ),
		),
		'borges/reformat-bibliography'        => array(
			'label'       => __( 'Reformat a bibliography', 'borges-bibliography-builder' ),
			'description' => __(
				'Switches one Borges bibliography to another citation style and reformats every entry.',
				'borges-bibliography-builder'
			),
			'properties'  => array(
				'style' => array(
					'type'        => 'string',
					'enum'        => array_keys( bibliography_builder_get_formatter_style_definitions() ),
					'description' => __( 'Citation style to switch to.', 'borges-bibliography-builder' ),
				),
			),
			'required'    => array( 'style' ),
			'callback'    => 'bibliography_builder_ability_reformat_bibliography',
			'meta'        => bibliography_builder_get_write_ability_meta( false, true ),
		),
	);

	foreach ( $abilities as $name => $ability ) {
		wp_register_ability(
			$name,
			array(
				'label'               => $ability['label'],
				'description'         => $ability['description'],
				'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array_merge( $common, $ability['properties'] ),
					'required'             => array_merge( array( 'post_id' ), $ability['required'] ),
					'additionalProperties' => false,
				),
				'output_schema'       => $output,
				'execute_callback'    => $ability['callback'],
				'permission_callback' => 'bibliography_builder_ability_can_write_post',
				'meta'                => $ability['meta'],
			)
		);
	}

	bibliography_builder_register_bulk_reformat_ability();
	bibliography_builder_register_bulk_deduplicate_ability();
}

/**
 * Input schema for a bulk ability's `posts` list.
 *
 * @param string $description What the posts are for.
 * @return array
 */
function bibliography_builder_get_bulk_posts_schema( $description ) {
	return array(
		'type'        => 'array',
		'minItems'    => 1,
		'maxItems'    => bibliography_builder_bulk_max_posts_per_request(),
		'items'       => array(
			'type'                 => 'object',
			'properties'           => array(
				'id'   => array(
					'type'    => 'integer',
					'minimum' => 1,
				),
				'etag' => array( 'type' => 'string' ),
			),
			'required'             => array( 'id' ),
			'additionalProperties' => false,
		),
		'description' => $description,
	);
}

/**
 * Register `borges/bulk-reformat`, which wraps POST /bulk/reformat.
 *
 * Its input differs from the per-post abilities (a list of posts, not one
 * post and block), so it is registered on its own. It calls the route's
 * callback, so it spends the same rate-limit budget and takes the same
 * site-wide lock: agents calling abilities are exactly the callers the
 * budget is for.
 *
 * @return void
 */
function bibliography_builder_register_bulk_reformat_ability() {
	wp_register_ability(
		'borges/bulk-reformat',
		array(
			'label'               => __( 'Reformat bibliographies across posts', 'borges-bibliography-builder' ),
			'description'         => __(
				'Restyles every Borges bibliography in a batch of posts. Send the "remaining" posts next.',
				'borges-bibliography-builder'
			),
			'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'style'   => array(
						'type'        => 'string',
						'enum'        => array_keys( bibliography_builder_get_formatter_style_definitions() ),
						'description' => __( 'Citation style to switch to.', 'borges-bibliography-builder' ),
					),
					'posts'   => bibliography_builder_get_bulk_posts_schema(
						__(
							'Posts to reformat, each with its ID and, to save, the ETag from a dry run or read.',
							'borges-bibliography-builder'
						)
					),
					'dry_run' => array(
						'type'        => 'boolean',
						'default'     => true,
						'description' => __(
							'Preview the change without saving. Defaults to true; pass false to save.',
							'borges-bibliography-builder'
						),
					),
				),
				'required'             => array( 'style', 'posts' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'dryRun'    => array( 'type' => 'boolean' ),
					'style'     => array( 'type' => 'string' ),
					'results'   => array( 'type' => 'array' ),
					'remaining' => array( 'type' => 'array' ),
					'rateLimit' => array( 'type' => array( 'object', 'null' ) ),
				),
			),
			'execute_callback'    => 'bibliography_builder_ability_bulk_reformat',
			'permission_callback' => 'bibliography_builder_rest_bulk_permissions_check',
			'meta'                => bibliography_builder_get_write_ability_meta( false, true ),
		)
	);
}

/**
 * Register `borges/bulk-deduplicate`, which wraps POST /bulk/deduplicate.
 *
 * Like `borges/bulk-reformat`, it calls the route's callback, so the two
 * share one budget and the site-wide lock. It is annotated as destructive
 * because a save removes citations; each post's revision keeps them.
 *
 * @return void
 */
function bibliography_builder_register_bulk_deduplicate_ability() {
	wp_register_ability(
		'borges/bulk-deduplicate',
		array(
			'label'               => __( 'Remove duplicate citations across posts', 'borges-bibliography-builder' ),
			'description'         => __(
				'Removes repeated citations in each Borges bibliography in a batch of posts. Send "remaining" next.',
				'borges-bibliography-builder'
			),
			'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'posts'   => bibliography_builder_get_bulk_posts_schema(
						__(
							'Posts to deduplicate, each with its ID and, to save, the ETag from a dry run or read.',
							'borges-bibliography-builder'
						)
					),
					'dry_run' => array(
						'type'        => 'boolean',
						'default'     => true,
						'description' => __(
							'Preview the change without saving. Defaults to true; pass false to save.',
							'borges-bibliography-builder'
						),
					),
				),
				'required'             => array( 'posts' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'dryRun'    => array( 'type' => 'boolean' ),
					'results'   => array( 'type' => 'array' ),
					'remaining' => array( 'type' => 'array' ),
					'rateLimit' => array( 'type' => array( 'object', 'null' ) ),
				),
			),
			'execute_callback'    => 'bibliography_builder_ability_bulk_deduplicate',
			'permission_callback' => 'bibliography_builder_rest_bulk_permissions_check',
			'meta'                => bibliography_builder_get_write_ability_meta( true, true ),
		)
	);
}

/**
 * The route request a write ability stands for.
 *
 * @param mixed       $input       Validated ability input; a non-array counts as empty.
 * @param string      $method      HTTP method of the matching route.
 * @param array|null  $body        JSON body, or null for none.
 * @param string|null $citation_id Citation ID for the per-citation routes.
 * @return WP_REST_Request
 */
function bibliography_builder_write_ability_request( $input, $method, $body = null, $citation_id = null ) {
	$input   = is_array( $input ) ? $input : array();
	$request = new WP_REST_Request( $method, '/bibliography/v1/abilities' );
	$url     = array(
		'post_id' => isset( $input['post_id'] ) ? absint( $input['post_id'] ) : 0,
		'ref'     => (string) bibliography_builder_ability_block_ref( $input ),
	);

	if ( null !== $citation_id ) {
		$url['citation_id'] = $citation_id;
	}

	$request->set_url_params( $url );
	$request->set_query_params(
		array( 'dry_run' => ! isset( $input['dry_run'] ) || false !== $input['dry_run'] )
	);

	if ( isset( $input['etag'] ) && is_string( $input['etag'] ) ) {
		$request->set_header( 'If-Match', $input['etag'] );
	}

	if ( null !== $body ) {
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( $body ) );
	}

	return $request;
}

/**
 * A route's response as ability output.
 *
 * @param WP_REST_Response|WP_Error $response Route response.
 * @return array|WP_Error
 */
function bibliography_builder_write_ability_result( $response ) {
	return is_wp_error( $response ) ? $response : $response->get_data();
}

/**
 * Permission callback for the write abilities: `edit_post` on the post, as
 * for the write routes.
 *
 * @param mixed $input Ability input.
 * @return true|WP_Error
 */
function bibliography_builder_ability_can_write_post( $input = null ) {
	return bibliography_builder_rest_write_permissions_check(
		bibliography_builder_write_ability_request( $input, 'GET' )
	);
}

/**
 * Execute callback for `borges/add-citations`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_add_citations( $input ) {
	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_add_citations(
			bibliography_builder_write_ability_request( $input, 'POST', array( 'items' => $input['items'] ?? null ) )
		)
	);
}

/**
 * Execute callback for `borges/update-citation`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_update_citation( $input ) {
	$fields = isset( $input['fields'] ) && is_array( $input['fields'] ) ? $input['fields'] : array();

	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_update_citation(
			bibliography_builder_write_ability_request( $input, 'PATCH', $fields, (string) $input['citation_id'] )
		)
	);
}

/**
 * Execute callback for `borges/delete-citation`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_delete_citation( $input ) {
	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_delete_citation(
			bibliography_builder_write_ability_request( $input, 'DELETE', null, (string) $input['citation_id'] )
		)
	);
}

/**
 * Execute callback for `borges/reorder-citations`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_reorder_citations( $input ) {
	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_reorder_citations(
			bibliography_builder_write_ability_request( $input, 'PUT', array( 'ids' => $input['ids'] ?? null ) )
		)
	);
}

/**
 * Execute callback for `borges/update-bibliography-settings`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_update_bibliography_settings( $input ) {
	$settings = isset( $input['settings'] ) && is_array( $input['settings'] ) ? $input['settings'] : array();

	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_update_bibliography_settings(
			bibliography_builder_write_ability_request( $input, 'PATCH', $settings )
		)
	);
}

/**
 * Execute callback for `borges/reformat-bibliography`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_reformat_bibliography( $input ) {
	return bibliography_builder_write_ability_result(
		bibliography_builder_rest_reformat_bibliography(
			bibliography_builder_write_ability_request( $input, 'POST', array( 'style' => $input['style'] ?? null ) )
		)
	);
}

/**
 * Call a bulk route's callback for an ability.
 *
 * A refused request (rate limit, busy lock) comes back from the route as a
 * response carrying headers; it is turned back into a WP_Error here.
 *
 * @param callable $callback Route callback.
 * @param string   $route    Route path, for the request.
 * @param array    $body     JSON body.
 * @param array    $input    Validated ability input, for `dry_run`.
 * @return array|WP_Error
 */
function bibliography_builder_ability_call_bulk_route( $callback, $route, $body, $input ) {
	$request = new WP_REST_Request( 'POST', '/bibliography/v1' . $route );
	$request->set_query_params(
		array( 'dry_run' => ! isset( $input['dry_run'] ) || false !== $input['dry_run'] )
	);
	$request->set_header( 'Content-Type', 'application/json' );
	$request->set_body( (string) wp_json_encode( $body ) );

	$response = call_user_func( $callback, $request );

	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$data = $response->get_data();

	if ( 400 <= $response->get_status() && is_array( $data ) ) {
		return new WP_Error( (string) $data['code'], (string) $data['message'], $data['data'] );
	}

	return $data;
}

/**
 * Execute callback for `borges/bulk-reformat`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_bulk_reformat( $input ) {
	return bibliography_builder_ability_call_bulk_route(
		'bibliography_builder_rest_bulk_reformat',
		'/bulk/reformat',
		array(
			'style' => $input['style'] ?? null,
			'posts' => $input['posts'] ?? null,
		),
		$input
	);
}

/**
 * Execute callback for `borges/bulk-deduplicate`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_bulk_deduplicate( $input ) {
	return bibliography_builder_ability_call_bulk_route(
		'bibliography_builder_rest_bulk_deduplicate',
		'/bulk/deduplicate',
		array( 'posts' => $input['posts'] ?? null ),
		$input
	);
}

add_action( 'wp_abilities_api_init', 'bibliography_builder_register_write_abilities' );
