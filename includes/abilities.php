<?php
/**
 * Read-only WordPress Abilities for Borges bibliographies.
 *
 * Registers discoverable, schema-described abilities through the Abilities API
 * introduced in WordPress 6.9. On older WordPress versions the registration
 * hooks never fire, so nothing is registered and nothing else changes.
 *
 * Every ability here is read-only: none writes post content, options, or any
 * other persistent state. They reuse the same data and permission helpers as
 * the `bibliography/v1` REST routes, so an ability can never expose more than
 * the matching route already does.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Ability category slug shared by all Borges abilities.
 */
const BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY = 'bibliography';

/**
 * Register the bibliography ability category.
 *
 * Category slugs are global. If another plugin registered `bibliography`
 * first, Borges abilities join that category instead of failing.
 *
 * @return void
 */
function bibliography_builder_register_ability_category() {
	if ( ! function_exists( 'wp_register_ability_category' ) ) {
		return;
	}

	if (
		function_exists( 'wp_has_ability_category' )
		&& wp_has_ability_category( BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY )
	) {
		return;
	}

	wp_register_ability_category(
		BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
		array(
			'label'       => __( 'Bibliographies', 'borges-bibliography-builder' ),
			'description' => __(
				'Read and check scholarly bibliographies built with the Borges bibliography block.',
				'borges-bibliography-builder'
			),
		)
	);
}

/**
 * Annotations shared by every Borges ability: all are read-only.
 *
 * @return array
 */
function bibliography_builder_get_readonly_ability_meta() {
	return array(
		'annotations'  => array(
			'readonly'    => true,
			'destructive' => false,
			'idempotent'  => true,
		),
		'show_in_rest' => true,
	);
}

/**
 * Register the read-only Borges abilities.
 *
 * @return void
 */
function bibliography_builder_register_abilities() {
	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	$post_id_schema = array(
		'type'        => 'integer',
		'minimum'     => 1,
		'description' => __( 'ID of the post that contains the bibliography blocks.', 'borges-bibliography-builder' ),
	);

	wp_register_ability(
		'borges/get-bibliographies',
		array(
			'label'               => __( 'Get bibliographies', 'borges-bibliography-builder' ),
			'description'         => __(
				"Lists a post's Borges bibliography blocks with each citation's CSL-JSON and display text.",
				'borges-bibliography-builder'
			),
			'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'post_id' => $post_id_schema,
				),
				'required'             => array( 'post_id' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'postId'         => array( 'type' => 'integer' ),
					'bibliographies' => array(
						'type'  => 'array',
						'items' => array( 'type' => 'object' ),
					),
				),
			),
			'execute_callback'    => 'bibliography_builder_ability_get_bibliographies',
			'permission_callback' => 'bibliography_builder_ability_can_read_post',
			'meta'                => bibliography_builder_get_readonly_ability_meta(),
		)
	);

	wp_register_ability(
		'borges/export-bibliography',
		array(
			'label'               => __( 'Export a bibliography', 'borges-bibliography-builder' ),
			'description'         => __(
				'Exports one Borges bibliography block as a CSL-JSON array or as plain text, one citation per line.',
				'borges-bibliography-builder'
			),
			'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'post_id' => $post_id_schema,
					'index'   => array(
						'type'        => 'integer',
						'minimum'     => 0,
						'default'     => 0,
						'description' => __(
							'Zero-based position of the bibliography block within the post.',
							'borges-bibliography-builder'
						),
					),
					'format'  => array(
						'type'        => 'string',
						'enum'        => array( 'csl-json', 'text' ),
						'default'     => 'csl-json',
						'description' => __( 'Export format: csl-json or text.', 'borges-bibliography-builder' ),
					),
				),
				'required'             => array( 'post_id' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'postId'  => array( 'type' => 'integer' ),
					'index'   => array( 'type' => 'integer' ),
					'format'  => array(
						'type' => 'string',
						'enum' => array( 'csl-json', 'text' ),
					),
					'content' => array( 'type' => array( 'array', 'string' ) ),
				),
			),
			'execute_callback'    => 'bibliography_builder_ability_export_bibliography',
			'permission_callback' => 'bibliography_builder_ability_can_read_post',
			'meta'                => bibliography_builder_get_readonly_ability_meta(),
		)
	);

	wp_register_ability(
		'borges/validate-citations',
		array(
			'label'               => __( 'Validate citations', 'borges-bibliography-builder' ),
			'description'         => __(
				'Checks CSL-JSON records against the rules Borges applies before formatting. Saves nothing.',
				'borges-bibliography-builder'
			),
			'category'            => BIBLIOGRAPHY_BUILDER_ABILITY_CATEGORY,
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'items' => array(
						'type'        => 'array',
						'minItems'    => 1,
						'maxItems'    => BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS,
						'items'       => array( 'type' => 'object' ),
						'description' => __( 'CSL-JSON citation records to check.', 'borges-bibliography-builder' ),
					),
				),
				'required'             => array( 'items' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'valid'   => array( 'type' => 'boolean' ),
					'results' => array(
						'type'  => 'array',
						'items' => array(
							'type'       => 'object',
							'properties' => array(
								'index'     => array( 'type' => 'integer' ),
								'valid'     => array( 'type' => 'boolean' ),
								'error'     => array( 'type' => array( 'string', 'null' ) ),
								'sanitized' => array( 'type' => array( 'object', 'null' ) ),
							),
						),
					),
				),
			),
			'execute_callback'    => 'bibliography_builder_ability_validate_citations',
			'permission_callback' => 'bibliography_builder_ability_can_validate',
			'meta'                => bibliography_builder_get_readonly_ability_meta(),
		)
	);
}

/**
 * Permission callback: may the current user read bibliographies in this post?
 *
 * Mirrors the `GET /posts/{id}/bibliographies` route: published posts of a
 * publicly viewable type are readable by anyone; anything else needs
 * `edit_post` on that post.
 *
 * @param mixed $input Ability input.
 * @return true|WP_Error
 */
function bibliography_builder_ability_can_read_post( $input = null ) {
	$post_id = is_array( $input ) && isset( $input['post_id'] ) ? absint( $input['post_id'] ) : 0;
	$post    = 0 < $post_id ? get_post( $post_id ) : null;

	if ( ! is_object( $post ) ) {
		return new WP_Error(
			'bibliography_builder_post_not_found',
			__( 'Post not found.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	if ( bibliography_builder_can_read_post( $post ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_forbidden',
		__( 'Sorry, you are not allowed to read this bibliography.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for citation validation: mirrors the formatter route.
 *
 * @return true|WP_Error
 */
function bibliography_builder_ability_can_validate() {
	return bibliography_builder_rest_format_permissions_check();
}

/**
 * Execute callback for `borges/get-bibliographies`.
 *
 * @param array $input Validated ability input.
 * @return array
 */
function bibliography_builder_ability_get_bibliographies( $input ) {
	$post_id = absint( $input['post_id'] );

	return array(
		'postId'         => $post_id,
		'bibliographies' => bibliography_builder_get_bibliographies_for_post( get_post( $post_id ) ),
	);
}

/**
 * Execute callback for `borges/export-bibliography`.
 *
 * @param array $input Validated ability input.
 * @return array|WP_Error
 */
function bibliography_builder_ability_export_bibliography( $input ) {
	$post_id        = absint( $input['post_id'] );
	$index          = isset( $input['index'] ) ? absint( $input['index'] ) : 0;
	$format         = isset( $input['format'] ) && 'text' === $input['format'] ? 'text' : 'csl-json';
	$bibliographies = bibliography_builder_get_bibliographies_for_post( get_post( $post_id ) );

	if ( ! isset( $bibliographies[ $index ] ) ) {
		return new WP_Error(
			'bibliography_builder_not_found',
			__( 'Bibliography block not found for the requested index.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	return array(
		'postId'  => $post_id,
		'index'   => $index,
		'format'  => $format,
		'content' => 'text' === $format
			? bibliography_builder_build_plain_text( $bibliographies[ $index ] )
			: bibliography_builder_build_csl_json( $bibliographies[ $index ] ),
	);
}

/**
 * Execute callback for `borges/validate-citations`.
 *
 * Runs each item through the formatter's own validator independently, so one
 * bad record does not hide the results for the others.
 *
 * @param array $input Validated ability input.
 * @return array
 */
function bibliography_builder_ability_validate_citations( $input ) {
	$items     = isset( $input['items'] ) && is_array( $input['items'] ) ? array_values( $input['items'] ) : array();
	$results   = array();
	$all_valid = true;

	foreach ( $items as $index => $item ) {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item( $item );
		$error     = $sanitized instanceof WP_Error ? $sanitized->get_error_message() : null;
		$all_valid = $all_valid && null === $error;

		$results[] = array(
			'index'     => $index,
			'valid'     => null === $error,
			'error'     => $error,
			'sanitized' => null === $error ? $sanitized : null,
		);
	}

	return array(
		'valid'   => $all_valid,
		'results' => $results,
	);
}

add_action( 'wp_abilities_api_categories_init', 'bibliography_builder_register_ability_category' );
add_action( 'wp_abilities_api_init', 'bibliography_builder_register_abilities' );
