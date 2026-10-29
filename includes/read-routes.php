<?php
/**
 * REST read callbacks: the `/format` route, its request-parameter helper, and
 * the post bibliography read routes.
 *
 * Moved unchanged from bibliography-builder.php (refactor memo, Phase B).
 * Route registration and the permission callbacks stay in the root file.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Read JSON/body params from a REST request.
 *
 * @param WP_REST_Request $request REST request.
 * @return array
 */
function bibliography_builder_get_request_params( WP_REST_Request $request ) {
	/**
	 * WordPress documents an array, but returns null for an absent or invalid body.
	 *
	 * @var mixed $params
	 */
	$params = $request->get_json_params();

	return is_array( $params ) ? $params : array();
}

/**
 * REST callback that formats CSL-JSON items as plain text.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_format_citations( WP_REST_Request $request ) {
	$started = microtime( true );

	// Drop timings from any earlier call in the same process.
	bibliography_builder_format_timing();

	if ( function_exists( 'timer_float' ) ) {
		bibliography_builder_format_timing( 'wp', timer_float() * 1000.0, 'WordPress before the route' );
	}

	/**
	 * WordPress documents a string, but the body is null until one is set.
	 *
	 * @var string|null $body
	 */
	$body = $request->get_body();

	if ( strlen( (string) $body ) > BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES ) {
		return new WP_Error(
			'bibliography_builder_formatter_payload_too_large',
			__( 'The citation formatting request is too large.', 'borges-bibliography-builder' ),
			array( 'status' => 413 )
		);
	}

	$params    = bibliography_builder_get_request_params( $request );
	$style_key = isset( $params['style'] )
		? sanitize_key( $params['style'] )
		: bibliography_builder_default_style_key();
	$csl_items = isset( $params['cslItems'] ) && is_array( $params['cslItems'] ) ? $params['cslItems'] : array();

	if ( empty( $csl_items ) ) {
		return rest_ensure_response(
			array(
				'style'   => $style_key,
				'entries' => array(),
			)
		);
	}

	if ( count( $csl_items ) > BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS ) {
		return new WP_Error(
			'bibliography_builder_formatter_too_many_items',
			__( 'Too many citations were sent for formatting.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$sanitize_started    = microtime( true );
	$sanitized_csl_items = bibliography_builder_validate_and_sanitize_csl_items( $csl_items );

	bibliography_builder_format_timing( 'sanitize', bibliography_builder_format_timing_since( $sanitize_started ) );

	if ( is_wp_error( $sanitized_csl_items ) ) {
		return $sanitized_csl_items;
	}

	$formatted = bibliography_builder_format_csl_items( $sanitized_csl_items, $style_key );

	if ( is_wp_error( $formatted ) ) {
		return $formatted;
	}

	$response = new WP_REST_Response(
		array(
			'style'   => $style_key,
			'entries' => array_map(
				static function ( $text, $index ) {
					return array(
						'index' => $index,
						'text'  => $text,
					);
				},
				$formatted,
				array_keys( $formatted )
			),
		)
	);

	bibliography_builder_format_timing( 'callback', bibliography_builder_format_timing_since( $started ) );
	$response->header(
		'Server-Timing',
		bibliography_builder_server_timing_header( bibliography_builder_format_timing() )
	);

	return $response;
}

/**
 * REST callback returning bibliography block data for a post.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response
 */
function bibliography_builder_rest_get_bibliographies( WP_REST_Request $request ) {
	$post_id        = absint( $request['post_id'] );
	$post           = get_post( $post_id );
	$bibliographies = bibliography_builder_get_bibliographies_for_post( $post );

	return bibliography_builder_with_write_etag(
		rest_ensure_response(
			array(
				'postId'         => $post_id,
				'bibliographies' => $bibliographies,
			)
		),
		$post
	);
}

/**
 * REST callback returning one bibliography block in various formats.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_get_bibliography( WP_REST_Request $request ) {
	$format       = isset( $request['format'] ) ? (string) $request['format'] : 'json';
	$bibliography = null !== $request['id']
		? bibliography_builder_resolve_bibliography( $request['post_id'], $request['id'], 'id' )
		: bibliography_builder_resolve_bibliography( $request['post_id'], (int) $request['index'], 'index' );

	if ( is_wp_error( $bibliography ) ) {
		return $bibliography;
	}

	if ( 'text' === $format ) {
		$response = new WP_REST_Response( bibliography_builder_build_plain_text( $bibliography ) );
		$response->header( 'Content-Type', 'text/plain; charset=utf-8' );

		return bibliography_builder_with_write_etag( $response, get_post( absint( $request['post_id'] ) ) );
	}

	if ( 'csl-json' === $format ) {
		$response = rest_ensure_response( bibliography_builder_build_csl_json( $bibliography ) );
		$response->header( 'Content-Type', 'application/vnd.citationstyles.csl+json; charset=utf-8' );

		return bibliography_builder_with_write_etag( $response, get_post( absint( $request['post_id'] ) ) );
	}

	return bibliography_builder_with_write_etag(
		rest_ensure_response( $bibliography ),
		get_post( absint( $request['post_id'] ) )
	);
}
