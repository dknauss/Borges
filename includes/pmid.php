<?php
/**
 * PubMed/PMID resolver REST endpoint and cache helpers.
 *
 * @package BibliographyBuilder
 */

/**
 * Build a bounded cache key for PMID resolver responses.
 *
 * @param string $pmid PubMed ID.
 * @return string
 */
function bibliography_builder_get_pmid_cache_key( $pmid ) {
	return 'bibliography_builder_pmid_' . md5( (string) $pmid );
}

/**
 * Read a cached PMID resolver response when WordPress transients are available.
 *
 * @param string $pmid PubMed ID.
 * @return array|null
 */
function bibliography_builder_get_cached_pmid_response( $pmid ) {
	if ( ! function_exists( 'get_transient' ) ) {
		return null;
	}

	$cached = get_transient( bibliography_builder_get_pmid_cache_key( $pmid ) );

	return is_array( $cached ) ? $cached : null;
}

/**
 * Cache a PMID resolver response when WordPress transients are available.
 *
 * @param string $pmid  PubMed ID.
 * @param array  $value Cache payload.
 * @param int    $ttl   Cache TTL in seconds.
 * @return void
 */
function bibliography_builder_set_cached_pmid_response( $pmid, $value, $ttl ) {
	if ( ! function_exists( 'set_transient' ) ) {
		return;
	}

	set_transient( bibliography_builder_get_pmid_cache_key( $pmid ), $value, $ttl );
}

/**
 * Permission callback for editor-only PMID resolver requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_pmid_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_pmid_forbidden',
		__( 'Sorry, you are not allowed to resolve PubMed citations.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * REST callback that resolves a PubMed ID to CSL-JSON.
 *
 * NCBI's CSL endpoint does not currently emit browser CORS headers, so editor
 * requests are proxied through WordPress using a fixed URL and numeric PMID.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_pmid( WP_REST_Request $request ) {
	$pmid = isset( $request['pmid'] ) ? (string) $request['pmid'] : '';

	if ( ! preg_match( '/^\d{1,8}$/', $pmid ) ) {
		return new WP_Error(
			'bibliography_builder_pmid_invalid',
			__( 'Invalid PubMed ID.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$cached = bibliography_builder_get_cached_pmid_response( $pmid );

	if ( isset( $cached['type'] ) && 'success' === $cached['type'] && isset( $cached['data'] ) && is_array( $cached['data'] ) ) {
		return rest_ensure_response( $cached['data'] );
	}

	if ( isset( $cached['type'] ) && 'not_found' === $cached['type'] ) {
		return new WP_Error(
			'bibliography_builder_pmid_not_found',
			__( 'The PubMed ID could not be resolved.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	$url      = add_query_arg(
		array(
			'format' => 'csl',
			'id'     => $pmid,
		),
		BIBLIOGRAPHY_BUILDER_PUBMED_CSL_API
	);
	$response = wp_remote_get(
		$url,
		array(
			'timeout'     => BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT,
			'redirection' => 3,
		)
	);

	if ( is_wp_error( $response ) ) {
		return new WP_Error(
			'bibliography_builder_pmid_upstream_error',
			__( 'The PubMed citation service could not be reached.', 'borges-bibliography-builder' ),
			array( 'status' => 502 )
		);
	}

	$status = (int) wp_remote_retrieve_response_code( $response );

	if ( $status < 200 || $status >= 300 ) {
		if ( 404 === $status ) {
			bibliography_builder_set_cached_pmid_response(
				$pmid,
				array( 'type' => 'not_found' ),
				BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_TTL
			);

			return new WP_Error(
				'bibliography_builder_pmid_not_found',
				__( 'The PubMed ID could not be resolved.', 'borges-bibliography-builder' ),
				array( 'status' => 404 )
			);
		}

		return new WP_Error(
			'bibliography_builder_pmid_upstream_error',
			__( 'The PubMed citation service returned an error.', 'borges-bibliography-builder' ),
			array(
				'status'          => 502,
				'upstream_status' => $status,
			)
		);
	}

	$decoded = json_decode( wp_remote_retrieve_body( $response ), true );

	if ( ! is_array( $decoded ) || empty( $decoded ) ) {
		return new WP_Error(
			'bibliography_builder_pmid_invalid_response',
			__( 'The PubMed citation service returned an invalid response.', 'borges-bibliography-builder' ),
			array( 'status' => 502 )
		);
	}

	bibliography_builder_set_cached_pmid_response(
		$pmid,
		array(
			'type' => 'success',
			'data' => $decoded,
		),
		BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_TTL
	);

	return rest_ensure_response( $decoded );
}
