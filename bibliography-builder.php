<?php
/**
 * Plugin Name:       Borges Bibliography Builder
 * Plugin URI:        https://github.com/dknauss/borges-bibliography-builder/
 * Description:       Paste a DOI or BibTeX entry to build a formatted, auto-sorted bibliography in any style.
 * Version:           1.2.0
 * Requires at least: 6.4
 * Tested up to:      7.0
 * Requires PHP:      7.4
 * Author:            Dan Knauss
 * Author URI:        https://dan.knauss.ca/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       borges-bibliography-builder
 * Domain Path:       /languages
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'BIBLIOGRAPHY_BUILDER_PLUGIN_DIR' ) ) {
	define( 'BIBLIOGRAPHY_BUILDER_PLUGIN_DIR', __DIR__ . '/' );
}

/**
 * Maximum number of citations that may be formatted in one request.
 */
const BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS = 50;

/**
 * Maximum formatter request payload size.
 */
const BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES = 1048576;

/**
 * Object-cache group for successful formatter responses.
 */
const BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_GROUP = 'bibliography_builder_format';

/**
 * Short TTL for successful formatter responses when a persistent object cache exists.
 */
const BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL = 300;

/**
 * NCBI Literature Citation Export endpoint used for PMID resolution.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_CSL_API = 'https://pmc.ncbi.nlm.nih.gov/api/ctxp/v1/pubmed/';

/**
 * HTTP timeout for external PMID resolution requests.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT = 10;

/**
 * Cache TTL for successful PMID CSL lookups.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_TTL = 86400;

/**
 * Cache TTL for PMID not-found responses.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_TTL = 3600;

/**
 * Recursively gather bibliography block data from parsed blocks.
 *
 * @param array $blocks Parsed block tree.
 * @param array $results Accumulator.
 * @return array
 */
function bibliography_builder_collect_blocks( $blocks, $results = array() ) {
	foreach ( $blocks as $block ) {
		if ( ! empty( $block['blockName'] ) && 'bibliography-builder/bibliography' === $block['blockName'] ) {
			$attrs = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();

			$results[] = array(
				'citationStyle' => isset( $attrs['citationStyle'] )
					? (string) $attrs['citationStyle']
					: 'chicago-notes-bibliography',
				'headingText'   => isset( $attrs['headingText'] )
					? (string) $attrs['headingText']
					: '',
				'outputJsonLd'  => isset( $attrs['outputJsonLd'] ) ? (bool) $attrs['outputJsonLd'] : true,
				'outputCoins'   => ! empty( $attrs['outputCoins'] ),
				'outputCslJson' => ! empty( $attrs['outputCslJson'] ),
				'citations'     => isset( $attrs['citations'] )
					&& is_array( $attrs['citations'] )
						? array_values(
							array_filter( $attrs['citations'], 'is_array' )
						)
						: array(),
			);
		}

		if ( ! empty( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) {
			$results = bibliography_builder_collect_blocks( $block['innerBlocks'], $results );
		}
	}

	return $results;
}

/**
 * Normalize bibliography API records with index and counts.
 *
 * @param array $bibliographies Raw bibliography arrays.
 * @return array
 */
function bibliography_builder_prepare_bibliographies( $bibliographies ) {
	return array_values(
		array_map(
			static function ( $bibliography, $index ) {
				$bibliography['index']      = $index;
				$bibliography['entryCount'] = count( $bibliography['citations'] );

				return $bibliography;
			},
			$bibliographies,
			array_keys( $bibliographies )
		)
	);
}

/**
 * Get normalized bibliography data for a post.
 *
 * @param WP_Post $post Post object.
 * @return array
 */
function bibliography_builder_get_bibliographies_for_post( $post ) {
	$parsed_blocks  = parse_blocks( (string) $post->post_content );
	$bibliographies = bibliography_builder_collect_blocks( $parsed_blocks );

	return bibliography_builder_prepare_bibliographies( $bibliographies );
}

/**
 * Return the visible display text for a citation record.
 *
 * @param array $citation Citation record.
 * @return string
 */
function bibliography_builder_get_citation_display_text( $citation ) {
	if ( ! empty( $citation['displayOverride'] ) && is_string( $citation['displayOverride'] ) ) {
		return $citation['displayOverride'];
	}

	if ( ! empty( $citation['formattedText'] ) && is_string( $citation['formattedText'] ) ) {
		return $citation['formattedText'];
	}

	if ( ! empty( $citation['csl']['title'] ) && is_string( $citation['csl']['title'] ) ) {
		return $citation['csl']['title'];
	}

	return '';
}

/**
 * Build plain-text bibliography output from stored citation display strings.
 *
 * @param array $bibliography Bibliography record.
 * @return string
 */
function bibliography_builder_build_plain_text( $bibliography ) {
	$lines = array();

	foreach ( $bibliography['citations'] as $citation ) {
		$lines[] = wp_strip_all_tags( bibliography_builder_get_citation_display_text( $citation ), false );
	}

	return implode( "\n", $lines ) . "\n";
}

/**
 * Build a canonical CSL array from bibliography citations.
 *
 * @param array $bibliography Bibliography record.
 * @return array
 */
function bibliography_builder_build_csl_json( $bibliography ) {
	return array_values(
		array_map(
			static function ( $citation ) {
				return isset( $citation['csl'] ) && is_array( $citation['csl'] ) ? $citation['csl'] : array();
			},
			$bibliography['citations']
		)
	);
}

/**
 * Citation style definitions shared by PHP formatting endpoints.
 *
 * @return array
 */
function bibliography_builder_get_formatter_style_definitions() {
	return array(
		'chicago-notes-bibliography' => array(
			'template' => 'chicago-notes-bibliography',
			'locale'   => 'en-US',
			'family'   => 'notes',
		),
		'chicago-author-date'        => array(
			'template' => 'chicago-author-date',
			'locale'   => 'en-US',
			'family'   => 'author-date',
		),
		'apa-7'                      => array(
			'template' => 'apa',
			'locale'   => 'en-US',
			'family'   => 'author-date',
		),
		'mla-9'                      => array(
			'template' => 'modern-language-association',
			'locale'   => 'en-US',
			'family'   => 'author-date',
		),
		'harvard'                    => array(
			'template' => 'harvard1',
			'locale'   => 'en-US',
			'family'   => 'author-date',
		),
		'ieee'                       => array(
			'template' => 'ieee',
			'locale'   => 'en-US',
			'family'   => 'numeric',
		),
		'vancouver'                  => array(
			'template' => 'vancouver',
			'locale'   => 'en-US',
			'family'   => 'numeric',
		),
		'oscola'                     => array(
			'template' => 'oscola',
			'locale'   => 'en-GB',
			'family'   => 'notes',
		),
		'abnt'                       => array(
			'template' => 'abnt',
			'locale'   => 'pt-BR',
			'family'   => 'author-date',
		),
	);
}

/**
 * Get one formatter style definition, falling back to the default style.
 *
 * @param string $style_key Style key from the block attribute.
 * @return array
 */
function bibliography_builder_get_formatter_style_definition( $style_key ) {
	$styles = bibliography_builder_get_formatter_style_definitions();

	return isset( $styles[ $style_key ] ) ? $styles[ $style_key ] : $styles['chicago-notes-bibliography'];
}

/**
 * Load Composer autoload and verify citeproc-php is usable.
 *
 * @return true|WP_Error
 */
function bibliography_builder_ensure_formatter_available() {
	foreach ( array( 'dom', 'intl', 'json', 'mbstring', 'SimpleXML' ) as $extension ) {
		if ( ! extension_loaded( $extension ) ) {
			return new WP_Error(
				'bibliography_builder_formatter_extension_missing',
				sprintf(
					/* translators: %s: PHP extension name. */
					__( 'The bibliography formatter requires the PHP %s extension.', 'borges-bibliography-builder' ),
					$extension
				),
				array( 'status' => 500 )
			);
		}
	}

	$autoload = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'vendor/autoload.php';

	if ( ! file_exists( $autoload ) ) {
		return new WP_Error(
			'bibliography_builder_formatter_missing',
			__( 'The bibliography formatter dependencies are missing.', 'borges-bibliography-builder' ),
			array( 'status' => 500 )
		);
	}

	require_once $autoload;

	if ( ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
		return new WP_Error(
			'bibliography_builder_formatter_missing',
			__( 'The bibliography formatter is unavailable.', 'borges-bibliography-builder' ),
			array( 'status' => 500 )
		);
	}

	return true;
}

/**
 * JSON-encode data using WordPress when available.
 *
 * @param mixed $data Data to encode.
 * @return string|false
 */
function bibliography_builder_json_encode( $data ) {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Used only when WordPress is unavailable in isolated tests.
	return function_exists( 'wp_json_encode' ) ? wp_json_encode( $data ) : json_encode( $data );
}

require_once BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'includes/pmid.php';

/**
 * Whether formatter response caching should use WordPress' persistent object cache.
 *
 * Avoid transients for full-bibliography formatter payloads so sites without a
 * persistent cache do not churn wp_options rows for high-cardinality editor
 * requests.
 *
 * @return bool
 */
function bibliography_builder_formatter_cache_enabled() {
	return function_exists( 'wp_using_ext_object_cache' )
		&& wp_using_ext_object_cache()
		&& function_exists( 'wp_cache_get' )
		&& function_exists( 'wp_cache_set' );
}

/**
 * Build a bounded object-cache key for a successful formatter response.
 *
 * @param array  $csl_items CSL-JSON objects.
 * @param string $style_key Citation style key.
 * @return string
 */
function bibliography_builder_get_formatter_cache_key( $csl_items, $style_key ) {
	$encoded = bibliography_builder_json_encode(
		array(
			'style'    => sanitize_key( $style_key ),
			'cslItems' => array_values( $csl_items ),
		)
	);

	return is_string( $encoded ) ? 'format_' . md5( $encoded ) : '';
}

/**
 * Get a cached formatter response from persistent object cache.
 *
 * @param string $cache_key Formatter cache key.
 * @return array|null
 */
function bibliography_builder_get_cached_formatter_response( $cache_key ) {
	if ( '' === $cache_key || ! bibliography_builder_formatter_cache_enabled() ) {
		return null;
	}

	$cached = wp_cache_get( $cache_key, BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_GROUP );

	return is_array( $cached ) ? $cached : null;
}

/**
 * Cache a successful formatter response in persistent object cache.
 *
 * @param string $cache_key Formatter cache key.
 * @param array  $formatted Formatted citation strings.
 * @return void
 */
function bibliography_builder_set_cached_formatter_response( $cache_key, $formatted ) {
	if ( '' === $cache_key || ! bibliography_builder_formatter_cache_enabled() ) {
		return;
	}

	wp_cache_set(
		$cache_key,
		array_values( $formatted ),
		BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_GROUP,
		BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
	);
}

/**
 * Sanitize formatted citation text down to inert plain text.
 *
 * @param string $text Text extracted from citeproc output.
 * @return string
 */
function bibliography_builder_sanitize_formatted_text( $text ) {
	$decoded  = html_entity_decode( (string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$stripped = wp_strip_all_tags( $decoded );

	return trim( preg_replace( '/\s+/u', ' ', $stripped ) );
}

/**
 * Normalize known citeproc style artifacts for the saved static list.
 *
 * @param string $text  Plain formatted text.
 * @param array  $style Formatter style definition.
 * @return string
 */
function bibliography_builder_normalize_formatted_text( $text, $style ) {
	if ( isset( $style['family'] ) && 'numeric' === $style['family'] ) {
		$text = preg_replace( '/^(?:\[\d+\]|\d+\.)\s+/u', '', $text );
	}

	if ( isset( $style['template'] ) && 'abnt' === $style['template'] ) {
		$text = preg_replace( '/\bv\.\s+vol\.\s+/u', 'v. ', $text );
		$text = preg_replace( '/\bn\.\s+no\.\s+/u', 'n. ', $text );
		$text = preg_replace( '/\bp\.\s+p{1,2}\.\s+/u', 'p. ', $text );
	}

	return str_replace( 'and et al.', 'et al.', $text );
}

/**
 * Extract per-entry text from citeproc HTML output.
 *
 * @param string $html  citeproc HTML output.
 * @param array  $style Formatter style definition.
 * @return array<int,array{id:string,text:string}>
 */
function bibliography_builder_extract_citeproc_entries( $html, $style ) {
	if ( ! class_exists( 'DOMDocument' ) || ! class_exists( 'DOMXPath' ) ) {
		return array(
			array(
				'id'   => '',
				'text' => bibliography_builder_normalize_formatted_text(
					bibliography_builder_sanitize_formatted_text( $html ),
					$style
				),
			),
		);
	}

	$document = new DOMDocument( '1.0', 'UTF-8' );
	$previous = libxml_use_internal_errors( true );
	$document->loadHTML(
		'<?xml encoding="UTF-8"><body>' . $html . '</body>',
		LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
	);
	libxml_clear_errors();
	libxml_use_internal_errors( $previous );

	$xpath   = new DOMXPath( $document );
	$entries = array();

	foreach ( $xpath->query( '//*[contains(concat(" ", normalize-space(@class), " "), " csl-entry ")]' ) as $node ) {
		$id = '';

		foreach ( $xpath->query( './/*[@data-borges-csl-id]', $node ) as $marker ) {
			$id = (string) $marker->getAttribute( 'data-borges-csl-id' );
			break;
		}

		// phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMDocument exposes textContent.
		$node_text = $node->textContent;
		$entries[] = array(
			'id'   => $id,
			'text' => bibliography_builder_normalize_formatted_text(
				bibliography_builder_sanitize_formatted_text( $node_text ),
				$style
			),
		);
	}

	return $entries;
}

/**
 * Format CSL-JSON items as plain-text bibliography entries.
 *
 * @param array  $csl_items CSL-JSON objects.
 * @param string $style_key Citation style key.
 * @return array|WP_Error Array of formatted text strings in input order.
 */
function bibliography_builder_format_csl_items( $csl_items, $style_key ) {
	$available = bibliography_builder_ensure_formatter_available();

	if ( is_wp_error( $available ) ) {
		return $available;
	}

	$style           = bibliography_builder_get_formatter_style_definition( sanitize_key( $style_key ) );
	$style_file_name = $style['template'] . '.csl';
	$style_path      = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'vendor/citation-style-language/styles/' . $style_file_name;

	if ( ! is_readable( $style_path ) ) {
		return new WP_Error(
			'bibliography_builder_formatter_style_missing',
			__( 'The requested bibliography style is unavailable.', 'borges-bibliography-builder' ),
			array( 'status' => 500 )
		);
	}

	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file, not a remote URL.
	$style_xml = file_get_contents( $style_path );

	if ( false === $style_xml ) {
		return new WP_Error(
			'bibliography_builder_formatter_style_unreadable',
			__( 'The requested bibliography style could not be read.', 'borges-bibliography-builder' ),
			array( 'status' => 500 )
		);
	}

	$prepared_items = array();

	foreach ( array_values( $csl_items ) as $index => $item ) {
		$item_array       = is_array( $item ) ? $item : array();
		$item_array['id'] = 'bibliography-builder-format-' . $index;
		$prepared_items[] = $item_array;
	}

	$encoded_items = bibliography_builder_json_encode( $prepared_items );

	if ( ! is_string( $encoded_items ) ) {
		return new WP_Error(
			'bibliography_builder_formatter_encode_failed',
			__( 'The citation data could not be prepared for formatting.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$items_for_formatter = json_decode( $encoded_items );
	$markup_extension    = array(
		'bibliography' => array(
			'csl-entry' => static function ( $csl_item, $rendered_text ) {
				$id = isset( $csl_item->id )
					? preg_replace( '/[^A-Za-z0-9_.:-]/', '', (string) $csl_item->id )
					: '';

					return '<span data-borges-csl-id="'
						. htmlspecialchars( $id, ENT_QUOTES, 'UTF-8' )
						. '">' . $rendered_text . '</span>';
			},
		),
	);

	try {
		$formatter = new \Seboettg\CiteProc\CiteProc( $style_xml, $style['locale'], $markup_extension );
		$html      = $formatter->render( $items_for_formatter, 'bibliography' );
	} catch ( Throwable $error ) {
		return new WP_Error(
			'bibliography_builder_formatter_failed',
			__( 'The citations could not be formatted.', 'borges-bibliography-builder' ),
			array(
				'status' => 500,
				'error'  => $error->getMessage(),
			)
		);
	}

	$entries_by_id = array();

	foreach ( bibliography_builder_extract_citeproc_entries( $html, $style ) as $entry ) {
		if ( '' !== $entry['id'] ) {
			$entries_by_id[ $entry['id'] ] = $entry['text'];
		}
	}

	$formatted = array();

	foreach ( $prepared_items as $index => $item ) {
		$id            = $item['id'];
		$fallback_text = isset( $item['title'] ) && is_string( $item['title'] ) ? $item['title'] : '';
		$formatted[]   = isset( $entries_by_id[ $id ] )
			? $entries_by_id[ $id ]
			: bibliography_builder_sanitize_formatted_text( $fallback_text );
	}

	return $formatted;
}

/**
 * Whether the current request may read bibliography data for a post.
 *
 * @param WP_Post $post Post object.
 * @return bool
 */
function bibliography_builder_can_read_post( $post ) {
	$status = get_post_status( $post );

	if ( function_exists( 'post_password_required' ) && post_password_required( $post ) ) {
		return current_user_can( 'edit_post', $post->ID );
	}

	if ( 'publish' === $status ) {
		return true;
	}

	return current_user_can( 'edit_post', $post->ID );
}

/**
 * REST permission callback for bibliography access.
 *
 * @param WP_REST_Request $request REST request.
 * @return true|WP_Error
 */
function bibliography_builder_rest_permissions_check( WP_REST_Request $request ) {
	$post_id = absint( $request['post_id'] );
	$post    = get_post( $post_id );

	if ( ! $post ) {
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
 * Permission callback for editor-only formatter requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_format_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_formatter_forbidden',
		__( 'Sorry, you are not allowed to format bibliographies.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Read JSON/body params from a REST request.
 *
 * @param WP_REST_Request $request REST request.
 * @return array
 */
function bibliography_builder_get_request_params( WP_REST_Request $request ) {
	if ( method_exists( $request, 'get_json_params' ) ) {
		$params = $request->get_json_params();

		if ( is_array( $params ) ) {
			return $params;
		}
	}

	return array();
}

/**
 * REST callback that formats CSL-JSON items as plain text.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_format_citations( WP_REST_Request $request ) {
	if ( method_exists( $request, 'get_body' ) ) {
		$body = (string) $request->get_body();

		if ( strlen( $body ) > BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES ) {
			return new WP_Error(
				'bibliography_builder_formatter_payload_too_large',
				__( 'The citation formatting request is too large.', 'borges-bibliography-builder' ),
				array( 'status' => 413 )
			);
		}
	}

	$params    = bibliography_builder_get_request_params( $request );
	$style_key = isset( $params['style'] ) ? sanitize_key( $params['style'] ) : 'chicago-notes-bibliography';
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

	$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key );
	$formatted = bibliography_builder_get_cached_formatter_response( $cache_key );

	if ( null === $formatted ) {
		$formatted = bibliography_builder_format_csl_items( $csl_items, $style_key );

		if ( is_wp_error( $formatted ) ) {
			return $formatted;
		}

		bibliography_builder_set_cached_formatter_response( $cache_key, $formatted );
	}

	return rest_ensure_response(
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

	return rest_ensure_response(
		array(
			'postId'         => $post_id,
			'bibliographies' => $bibliographies,
		)
	);
}

/**
 * REST callback returning one bibliography block in various formats.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_get_bibliography( WP_REST_Request $request ) {
	$post_id        = absint( $request['post_id'] );
	$index          = absint( $request['index'] );
	$format         = isset( $request['format'] ) ? (string) $request['format'] : 'json';
	$post           = get_post( $post_id );
	$bibliographies = bibliography_builder_get_bibliographies_for_post( $post );

	if ( ! isset( $bibliographies[ $index ] ) ) {
		return new WP_Error(
			'bibliography_builder_not_found',
			__( 'Bibliography block not found for the requested index.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	$bibliography = $bibliographies[ $index ];

	if ( 'text' === $format ) {
		$response = new WP_REST_Response( bibliography_builder_build_plain_text( $bibliography ) );
		$response->header( 'Content-Type', 'text/plain; charset=utf-8' );

		return $response;
	}

	if ( 'csl-json' === $format ) {
		$response = rest_ensure_response( bibliography_builder_build_csl_json( $bibliography ) );
		$response->header( 'Content-Type', 'application/vnd.citationstyles.csl+json; charset=utf-8' );

		return $response;
	}

	return rest_ensure_response( $bibliography );
}

/**
 * Register REST routes.
 */
function bibliography_builder_register_rest_routes() {
	register_rest_route(
		'bibliography/v1',
		'/format',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'bibliography_builder_rest_format_citations',
			'permission_callback' => 'bibliography_builder_rest_format_permissions_check',
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/pmid/(?P<pmid>\d{1,8})',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_pmid',
			'permission_callback' => 'bibliography_builder_rest_pmid_permissions_check',
			'args'                => array(
				'pmid' => array(
					'description'       => __( 'PubMed ID to resolve to CSL-JSON.', 'borges-bibliography-builder' ),
					'type'              => 'string',
					'required'          => true,
					'sanitize_callback' => static function ( $value ) {
						return preg_replace( '/\D/u', '', (string) $value );
					},
					'validate_callback' => static function ( $value ) {
						return is_scalar( $value ) && (bool) preg_match( '/^\d{1,8}$/', (string) $value );
					},
				),
			),
		)
	);

	$common_args = array(
		'post_id' => array(
			'description'       => __( 'Post ID to inspect for bibliography blocks.', 'borges-bibliography-builder' ),
			'type'              => 'integer',
			'sanitize_callback' => 'absint',
			'validate_callback' => static function ( $value ) {
				return is_numeric( $value ) && (int) $value > 0;
			},
		),
	);

	register_rest_route(
		'bibliography/v1',
		'/posts/(?P<post_id>\d+)/bibliographies',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliographies',
			'permission_callback' => 'bibliography_builder_rest_permissions_check',
			'args'                => $common_args,
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/posts/(?P<post_id>\d+)/bibliographies/(?P<index>\d+)',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliography',
			'permission_callback' => 'bibliography_builder_rest_permissions_check',
			'args'                => array_merge(
				$common_args,
				array(
					'index'  => array(
						'description'       => __(
							'Zero-based bibliography block index within the post.',
							'borges-bibliography-builder'
						),
						'type'              => 'integer',
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $value ) {
							return is_numeric( $value ) && (int) $value >= 0;
						},
					),
					'format' => array(
						'description'       => __(
							'Response format: json, text, or csl-json.',
							'borges-bibliography-builder'
						),
						'type'              => 'string',
						'default'           => 'json',
						'sanitize_callback' => static function ( $value ) {
							return sanitize_key( $value );
						},
						'validate_callback' => static function ( $value ) {
							return in_array(
								$value,
								array( 'json', 'text', 'csl-json' ),
								true
							);
						},
					),
				)
			),
		)
	);
}


/**
 * Serve plain-text bibliography responses without JSON string wrapping.
 *
 * @param bool             $served  Whether the request has already been served.
 * @param WP_HTTP_Response $result  Result to send to the client.
 * @param WP_REST_Request  $request Request used to generate the response.
 * @param WP_REST_Server   $server  Server instance.
 * @return bool
 */
function bibliography_builder_rest_pre_serve_request( $served, $result, $request, $server ) {
	if ( $served ) {
		return $served;
	}

	if ( 0 !== strpos( $request->get_route(), '/bibliography/v1/' ) ) {
		return $served;
	}

	if ( 'text' !== $request->get_param( 'format' ) ) {
		return $served;
	}

	$data = $result->get_data();

	if ( ! is_string( $data ) ) {
		return $served;
	}

	$headers = $result->get_headers();

	foreach ( $headers as $key => $value ) {
		$server->send_header( $key, $value );
	}

	// Plain-text REST response is intentionally stripped to plain text at send time.
	echo wp_strip_all_tags( $data, false ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	return true;
}

/**
 * Register the block.
 */
function bibliography_builder_block_init() {
	register_block_type( __DIR__ );
}
add_action( 'init', 'bibliography_builder_block_init' );
add_action( 'rest_api_init', 'bibliography_builder_register_rest_routes' );
add_filter( 'rest_pre_serve_request', 'bibliography_builder_rest_pre_serve_request', 10, 4 );

/**
 * Register bibliography block checks with Block Accessibility Checks (BAC).
 *
 * Soft dependency: this hook is only fired when Troy Chaplin's BAC plugin is
 * active. If BAC is not present, this function is never called.
 *
 * Registered checks:
 *   - empty_bibliography (error)   — block has no citations.
 *   - heading_missing   (warning)  — headingText is blank; no visible heading.
 *
 * @param object $registry BAC check registry instance.
 * @since 1.1.0
 */
function bibliography_builder_register_a11y_checks( $registry ) {
	if ( ! is_object( $registry ) || ! method_exists( $registry, 'register_check' ) ) {
		return;
	}

	$heading_missing_message = __(
		'Bibliography block has no heading. Screen reader users may not find this section.',
		'borges-bibliography-builder'
	);

	$registry->register_check(
		'bibliography-builder/bibliography',
		'empty_bibliography',
		array(
			'error_msg'   => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'warning_msg' => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'description' => __( 'Add at least one citation before publishing.', 'borges-bibliography-builder' ),
			'type'        => 'error',
			'category'    => 'accessibility',
		)
	);

	$registry->register_check(
		'bibliography-builder/bibliography',
		'heading_missing',
		array(
			'error_msg'   => $heading_missing_message,
			'warning_msg' => $heading_missing_message,
			'description' => __(
				'Add a heading in block settings so the bibliography is announced as a document section.',
				'borges-bibliography-builder'
			),
			'type'        => 'warning',
			'category'    => 'accessibility',
		)
	);
}
add_action( 'ba11yc_ready', 'bibliography_builder_register_a11y_checks' );

/**
 * Conditionally enqueue the BAC validation script in the block editor.
 *
 * The script is only enqueued when BAC's own script handle is already
 * registered, so there is no hard dependency on Troy's plugin.
 *
 * @since 1.1.0
 */
function bibliography_builder_enqueue_a11y_validation() {
	if ( ! wp_script_is( 'block-accessibility-script', 'registered' ) ) {
		return;
	}

	$asset_file = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'build/validation.asset.php';
	if ( ! file_exists( $asset_file ) ) {
		return;
	}

	$asset        = require $asset_file;
	$dependencies = array_merge( $asset['dependencies'], array( 'block-accessibility-script' ) );

	wp_enqueue_script(
		'borges-bibliography-builder-a11y-validation',
		plugins_url( 'build/validation.js', __FILE__ ),
		$dependencies,
		$asset['version'],
		true
	);
}
add_action( 'enqueue_block_editor_assets', 'bibliography_builder_enqueue_a11y_validation', 20 );
