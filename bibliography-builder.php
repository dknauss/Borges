<?php
/**
 * Plugin Name:       Borges Bibliography Builder
 * Plugin URI:        https://github.com/dknauss/Borges/
 * Description:       Create accessible bibliographies from DOI, PubMed, BibTeX, CSL-JSON, and free text; export RIS.
 * Version:           1.4.2
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
 * NCBI Literature Citation Export endpoint used for PMID resolution.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_CSL_API = 'https://pmc.ncbi.nlm.nih.gov/api/ctxp/v1/pubmed/';

/**
 * HTTP timeout for external PMID resolution requests.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT = 10;

/**
 * Cache TTL for repeated formatter responses.
 */
const BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL = 3600;

/**
 * Cache TTL for successful PMID resolution responses.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_CACHE_TTL = 86400;

/**
 * Cache TTL for PMID not-found responses.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_CACHE_TTL = 3600;

/**
 * Cache TTL for transient PMID upstream failures.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL = 600;

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
 * @param mixed $data  Data to encode.
 * @param int   $flags Optional encoding flags.
 * @param int   $depth Optional maximum depth.
 * @return string|false
 */
function bibliography_builder_json_encode( $data, $flags = 0, $depth = 512 ) {
	if ( function_exists( 'wp_json_encode' ) ) {
		return wp_json_encode( $data, $flags, $depth );
	}

	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Test fallback when WP is absent.
	return json_encode( $data, $flags, $depth );
}

/**
 * Build a compact transient key for a cache group/key pair.
 *
 * @param string $group Cache group.
 * @param string $key   Cache key.
 * @return string
 */
function bibliography_builder_get_transient_cache_key( $group, $key ) {
	return 'bbb_' . md5( $group . ':' . $key );
}

/**
 * Read a cached value from object cache with a transient fallback.
 *
 * @param string $key   Cache key.
 * @param string $group Cache group.
 * @return array{hit:bool,value:mixed}
 */
function bibliography_builder_cache_get( $key, $group ) {
	if ( function_exists( 'wp_cache_get' ) ) {
		$found = false;
		$value = wp_cache_get( $key, $group, false, $found );

		if ( $found ) {
			return array(
				'hit'   => true,
				'value' => $value,
			);
		}
	}

	if ( function_exists( 'get_transient' ) ) {
		$value = get_transient( bibliography_builder_get_transient_cache_key( $group, $key ) );

		if ( false !== $value ) {
			return array(
				'hit'   => true,
				'value' => $value,
			);
		}
	}

	return array(
		'hit'   => false,
		'value' => null,
	);
}

/**
 * Store a cached value in object cache and transient storage when available.
 *
 * @param string $key    Cache key.
 * @param mixed  $value  Cache value.
 * @param string $group  Cache group.
 * @param int    $expire TTL in seconds.
 * @return void
 */
function bibliography_builder_cache_set( $key, $value, $group, $expire ) {
	if ( function_exists( 'wp_cache_set' ) ) {
		wp_cache_set( $key, $value, $group, $expire );
	}

	if ( function_exists( 'set_transient' ) ) {
		set_transient( bibliography_builder_get_transient_cache_key( $group, $key ), $value, $expire );
	}
}

/**
 * Determine whether an array is a list on PHP versions before array_is_list().
 *
 * @param array $value Array to inspect.
 * @return bool
 */
function bibliography_builder_is_list_array( $value ) {
	return array() === $value || array_keys( $value ) === range( 0, count( $value ) - 1 );
}


/**
 * Return the CSL item types accepted by the formatter endpoint.
 *
 * Keep this in sync with src/lib/csl-sanitize.js.
 *
 * @return array
 */
function bibliography_builder_get_known_csl_types() {
	return array(
		'article',
		'article-journal',
		'article-magazine',
		'article-newspaper',
		'bill',
		'book',
		'broadcast',
		'chapter',
		'classic',
		'collection',
		'dataset',
		'document',
		'entry',
		'entry-dictionary',
		'entry-encyclopedia',
		'event',
		'figure',
		'graphic',
		'hearing',
		'interview',
		'legal_case',
		'legislation',
		'magazine',
		'manuscript',
		'map',
		'motion_picture',
		'musical_score',
		'performance',
		'pamphlet',
		'paper-conference',
		'patent',
		'periodical',
		'post',
		'post-weblog',
		'personal_communication',
		'regulation',
		'report',
		'review',
		'review-book',
		'software',
		'song',
		'speech',
		'standard',
		'thesis',
		'treaty',
		'webpage',
	);
}

/**
 * Return CSL fields that must contain strings.
 *
 * @return array
 */
function bibliography_builder_get_csl_string_fields() {
	return array(
		'title',
		'container-title',
		'publisher',
		'page',
		'volume',
		'issue',
		'DOI',
		'URL',
		'language',
		'edition',
		'medium',
		'genre',
		'publisher-place',
		'event-place',
		'reviewed-title',
	);
}

/**
 * Strip HTML markup from CSL strings, including nested/broken tag payloads.
 *
 * @param string $text String value.
 * @return string
 */
function bibliography_builder_strip_csl_html( $text ) {
	$result = (string) $text;

	do {
		$previous = $result;
		$result   = wp_strip_all_tags( $result );
	} while ( $result !== $previous );

	return $result;
}

/**
 * Whether a CSL key should be dropped before storage/formatting.
 *
 * @param string|int $key Array key.
 * @return bool
 */
function bibliography_builder_is_forbidden_csl_key( $key ) {
	return in_array( (string) $key, array( '__proto__', 'constructor', 'prototype' ), true );
}

/**
 * Recursively sanitize a CSL value and reject excessive nesting.
 *
 * @param mixed $value Value to sanitize.
 * @param int   $depth Current recursion depth.
 * @param bool  $valid Validity accumulator.
 * @return mixed
 */
function bibliography_builder_sanitize_csl_value( $value, $depth, &$valid ) {
	if ( $depth > 10 ) {
		$valid = false;
		return null;
	}

	if ( is_string( $value ) || is_int( $value ) || is_float( $value ) || is_bool( $value ) ) {
		return $value;
	}

	if ( is_array( $value ) ) {
		$sanitized = array();

		foreach ( $value as $key => $nested_value ) {
			if ( bibliography_builder_is_forbidden_csl_key( $key ) ) {
				continue;
			}

			$nested_valid    = true;
			$sanitized_value = bibliography_builder_sanitize_csl_value( $nested_value, $depth + 1, $nested_valid );

			if ( ! $nested_valid ) {
				$valid = false;
				continue;
			}

			if ( null !== $sanitized_value ) {
				$sanitized[ $key ] = $sanitized_value;
			}
		}

		return $sanitized;
	}

	if ( null !== $value ) {
		$valid = false;
	}

	return null;
}

/**
 * Normalize one CSL date part to an integer.
 *
 * @param mixed $part Date part.
 * @return int|null
 */
function bibliography_builder_normalize_csl_date_part( $part ) {
	if ( is_int( $part ) ) {
		return $part;
	}

	if ( is_float( $part ) && floor( $part ) === $part ) {
		return (int) $part;
	}

	if ( is_string( $part ) && preg_match( '/^\d+$/', $part ) ) {
		return (int) $part;
	}

	return null;
}

/**
 * Sanitize and validate CSL date structures.
 *
 * @param mixed $issued CSL issued/accessed value.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_date( $issued ) {
	if ( ! is_array( $issued ) || bibliography_builder_is_list_array( $issued ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$valid            = true;
	$sanitized_issued = bibliography_builder_sanitize_csl_value( $issued, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_issued ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$has_valid_date = false;

	if ( array_key_exists( 'date-parts', $sanitized_issued ) ) {
		if ( ! is_array( $sanitized_issued['date-parts'] ) || empty( $sanitized_issued['date-parts'] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$date_parts = array();

		foreach ( $sanitized_issued['date-parts'] as $date_part ) {
			if ( ! is_array( $date_part ) ) {
				continue;
			}

			$normalized_date_part = array();

			foreach ( $date_part as $part ) {
				$normalized_part = bibliography_builder_normalize_csl_date_part( $part );

				if ( null !== $normalized_part ) {
					$normalized_date_part[] = $normalized_part;
				}
			}

			if ( ! empty( $normalized_date_part ) ) {
				$date_parts[] = $normalized_date_part;
			}
		}

		if ( empty( $date_parts ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$sanitized_issued['date-parts'] = $date_parts;
		$has_valid_date                 = true;
	}

	foreach ( array( 'literal', 'raw' ) as $field ) {
		if ( ! array_key_exists( $field, $sanitized_issued ) ) {
			continue;
		}

		if ( ! is_string( $sanitized_issued[ $field ] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$sanitized_issued[ $field ] = bibliography_builder_strip_csl_html( $sanitized_issued[ $field ] );
		$has_valid_date             = true;
	}

	if ( ! $has_valid_date ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return $sanitized_issued;
}

/**
 * Sanitize and validate one CSL name object.
 *
 * @param mixed $author CSL name object.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_author( $author ) {
	if ( ! is_array( $author ) || bibliography_builder_is_list_array( $author ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL author entry.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$valid            = true;
	$sanitized_author = bibliography_builder_sanitize_csl_value( $author, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_author ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL author entry.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	foreach ( array( 'family', 'given', 'literal', 'ORCID' ) as $key ) {
		if ( array_key_exists( $key, $sanitized_author ) && ! is_string( $sanitized_author[ $key ] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL author field.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		if ( array_key_exists( $key, $sanitized_author ) ) {
			$sanitized_author[ $key ] = bibliography_builder_strip_csl_html( $sanitized_author[ $key ] );
		}
	}

	return $sanitized_author;
}

/**
 * Sanitize and validate CSL name lists.
 *
 * @param mixed  $names CSL name list.
 * @param string $field Field name.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_name_list( $names, $field ) {
	if ( ! is_array( $names ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			sprintf(
				/* translators: %s: CSL field name. */
				__( 'Invalid CSL %s list.', 'borges-bibliography-builder' ),
				$field
			),
			array( 'status' => 400 )
		);
	}

	$sanitized = array();

	foreach ( $names as $author ) {
		$sanitized_author = bibliography_builder_sanitize_csl_author( $author );

		if ( is_wp_error( $sanitized_author ) ) {
			return $sanitized_author;
		}

		$sanitized[] = $sanitized_author;
	}

	return $sanitized;
}

/**
 * Sanitize and validate a string-or-string-array CSL field.
 *
 * @param mixed  $value Field value.
 * @param string $field Field name.
 * @return string|array|WP_Error
 */
function bibliography_builder_sanitize_csl_string_or_array_field( $value, $field ) {
	if ( is_string( $value ) ) {
		return bibliography_builder_strip_csl_html( $value );
	}

	if ( is_array( $value ) ) {
		$sanitized = array();

		foreach ( $value as $item ) {
			if ( ! is_string( $item ) ) {
				return new WP_Error(
					'bibliography_builder_invalid_csl_item',
					sprintf(
						/* translators: %s: CSL field name. */
						__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
						$field
					),
					array( 'status' => 400 )
				);
			}

			$sanitized[] = bibliography_builder_strip_csl_html( $item );
		}

		return $sanitized;
	}

	return new WP_Error(
		'bibliography_builder_invalid_csl_item',
		sprintf(
			/* translators: %s: CSL field name. */
			__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
			$field
		),
		array( 'status' => 400 )
	);
}

/**
 * Validate and sanitize one CSL-JSON item for the formatter endpoint.
 *
 * @param mixed $csl CSL-JSON item.
 * @return array|WP_Error
 */
function bibliography_builder_validate_and_sanitize_csl_item( $csl ) {
	if ( ! is_array( $csl ) || bibliography_builder_is_list_array( $csl ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL object.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$valid         = true;
	$sanitized_csl = bibliography_builder_sanitize_csl_value( $csl, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_csl ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL object.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	if (
		empty( $sanitized_csl['type'] ) ||
		! is_string( $sanitized_csl['type'] ) ||
		! in_array( $sanitized_csl['type'], bibliography_builder_get_known_csl_types(), true )
	) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL type.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	foreach ( array( 'author', 'editor', 'reviewed-author' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_list = bibliography_builder_sanitize_csl_name_list( $sanitized_csl[ $field ], $field );

			if ( is_wp_error( $sanitized_list ) ) {
				return $sanitized_list;
			}

			$sanitized_csl[ $field ] = $sanitized_list;
		}
	}

	foreach ( array( 'issued', 'accessed' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_date = bibliography_builder_sanitize_csl_date( $sanitized_csl[ $field ] );

			if ( is_wp_error( $sanitized_date ) ) {
				return $sanitized_date;
			}

			$sanitized_csl[ $field ] = $sanitized_date;
		}
	}

	foreach ( bibliography_builder_get_csl_string_fields() as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			if ( ! is_string( $sanitized_csl[ $field ] ) ) {
				if (
					'title' !== $field
					&& ( is_int( $sanitized_csl[ $field ] ) || is_float( $sanitized_csl[ $field ] ) )
				) {
					$sanitized_csl[ $field ] = (string) $sanitized_csl[ $field ];
				} else {
					return new WP_Error(
						'bibliography_builder_invalid_csl_item',
						sprintf(
							/* translators: %s: CSL field name. */
							__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
							$field
						),
						array( 'status' => 400 )
					);
				}
			}

			$sanitized_csl[ $field ] = bibliography_builder_strip_csl_html( $sanitized_csl[ $field ] );
		}
	}

	foreach ( array( 'ISBN', 'ISSN' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_identifier = bibliography_builder_sanitize_csl_string_or_array_field(
				$sanitized_csl[ $field ],
				$field
			);

			if ( is_wp_error( $sanitized_identifier ) ) {
				return $sanitized_identifier;
			}

			$sanitized_csl[ $field ] = $sanitized_identifier;
		}
	}

	return $sanitized_csl;
}

/**
 * Validate and sanitize a list of CSL-JSON items for the formatter endpoint.
 *
 * @param array $csl_items CSL-JSON items.
 * @return array|WP_Error
 */
function bibliography_builder_validate_and_sanitize_csl_items( $csl_items ) {
	$sanitized_items = array();

	foreach ( array_values( $csl_items ) as $index => $item ) {
		$sanitized_item = bibliography_builder_validate_and_sanitize_csl_item( $item );

		if ( is_wp_error( $sanitized_item ) ) {
			return new WP_Error(
				$sanitized_item->get_error_code(),
				sprintf(
					/* translators: %d: 1-based citation item number. */
					__( 'Invalid CSL citation item at position %d.', 'borges-bibliography-builder' ),
					$index + 1
				),
				$sanitized_item->get_error_data()
			);
		}

		$sanitized_items[] = $sanitized_item;
	}

	return $sanitized_items;
}

/**
 * Recursively sort associative keys so equivalent CSL payloads hash identically.
 *
 * @param mixed $value Value to normalize.
 * @return mixed
 */
function bibliography_builder_sort_for_cache_key( $value ) {
	if ( ! is_array( $value ) ) {
		return $value;
	}

	if ( bibliography_builder_is_list_array( $value ) ) {
		return array_map( 'bibliography_builder_sort_for_cache_key', $value );
	}

	ksort( $value, SORT_STRING );

	foreach ( $value as $key => $nested_value ) {
		$value[ $key ] = bibliography_builder_sort_for_cache_key( $nested_value );
	}

	return $value;
}

/**
 * Build a stable cache key for a full bibliography formatting request.
 *
 * @param array  $csl_items CSL-JSON items.
 * @param string $style_key Requested style key.
 * @param array  $style     Formatter style definition.
 * @return string
 */
function bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style ) {
	$payload = array(
		'version'   => 1,
		'style'     => sanitize_key( $style_key ),
		'template'  => isset( $style['template'] ) ? (string) $style['template'] : '',
		'locale'    => isset( $style['locale'] ) ? (string) $style['locale'] : '',
		'csl_items' => bibliography_builder_sort_for_cache_key( array_values( $csl_items ) ),
	);
	$encoded = bibliography_builder_json_encode( $payload );

	if ( ! is_string( $encoded ) ) {
		$encoded = bibliography_builder_json_encode(
			$payload,
			JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
		);
	}

	return 'format_' . md5( is_string( $encoded ) ? $encoded : '' );
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
	$style     = bibliography_builder_get_formatter_style_definition( sanitize_key( $style_key ) );
	$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style );
	$cached    = bibliography_builder_cache_get( $cache_key, 'bibliography_builder_formatter' );

	if ( $cached['hit'] && is_array( $cached['value'] ) ) {
		return $cached['value'];
	}

	$available = bibliography_builder_ensure_formatter_available();

	if ( is_wp_error( $available ) ) {
		return $available;
	}

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

	bibliography_builder_cache_set(
		$cache_key,
		$formatted,
		'bibliography_builder_formatter',
		BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
	);

	return $formatted;
}

/**
 * Build the cache key for one PMID resolution.
 *
 * @param string $pmid PubMed ID.
 * @return string
 */
function bibliography_builder_get_pmid_cache_key( $pmid ) {
	return 'pmid_' . preg_replace( '/\D/u', '', (string) $pmid );
}

/**
 * Build a WP_Error for PMID resolution.
 *
 * @param string $code    Error code.
 * @param string $message Error message.
 * @param array  $data    Error data.
 * @return WP_Error
 */
function bibliography_builder_pmid_error( $code, $message, $data ) {
	return new WP_Error( $code, $message, $data );
}

/**
 * Cache a PMID resolution result.
 *
 * @param string $pmid   PubMed ID.
 * @param array  $result Cache payload.
 * @param int    $ttl    Cache TTL in seconds.
 * @return void
 */
function bibliography_builder_cache_pmid_result( $pmid, $result, $ttl ) {
	bibliography_builder_cache_set(
		bibliography_builder_get_pmid_cache_key( $pmid ),
		$result,
		'bibliography_builder_pmid',
		$ttl
	);
}

/**
 * Read a cached PMID resolution result.
 *
 * @param string $pmid PubMed ID.
 * @return WP_REST_Response|WP_Error|null
 */
function bibliography_builder_get_cached_pmid_result( $pmid ) {
	$cached = bibliography_builder_cache_get(
		bibliography_builder_get_pmid_cache_key( $pmid ),
		'bibliography_builder_pmid'
	);

	if ( ! $cached['hit'] || ! is_array( $cached['value'] ) ) {
		return null;
	}

	if ( isset( $cached['value']['type'] ) && 'success' === $cached['value']['type'] ) {
		return rest_ensure_response( isset( $cached['value']['data'] ) ? $cached['value']['data'] : array() );
	}

	if ( isset( $cached['value']['type'] ) && 'error' === $cached['value']['type'] ) {
		$error_code    = isset( $cached['value']['code'] )
			? (string) $cached['value']['code']
			: 'bibliography_builder_pmid_upstream_error';
		$error_message = isset( $cached['value']['message'] )
			? (string) $cached['value']['message']
			: __( 'The PubMed citation service returned an error.', 'borges-bibliography-builder' );

		return bibliography_builder_pmid_error(
			$error_code,
			$error_message,
			isset( $cached['value']['data'] ) && is_array( $cached['value']['data'] )
				? $cached['value']['data']
				: array( 'status' => 502 )
		);
	}

	return null;
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

	$sanitized_csl_items = bibliography_builder_validate_and_sanitize_csl_items( $csl_items );

	if ( is_wp_error( $sanitized_csl_items ) ) {
		return $sanitized_csl_items;
	}

	$formatted = bibliography_builder_format_csl_items( $sanitized_csl_items, $style_key );

	if ( is_wp_error( $formatted ) ) {
		return $formatted;
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

	$cached = bibliography_builder_get_cached_pmid_result( $pmid );

	if ( null !== $cached ) {
		return $cached;
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
		$error = bibliography_builder_pmid_error(
			'bibliography_builder_pmid_upstream_error',
			__( 'The PubMed citation service could not be reached.', 'borges-bibliography-builder' ),
			array( 'status' => 502 )
		);
		bibliography_builder_cache_pmid_result(
			$pmid,
			array(
				'type'    => 'error',
				'code'    => $error->get_error_code(),
				'message' => $error->get_error_message(),
				'data'    => $error->get_error_data(),
			),
			BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL
		);

		return $error;
	}

	$status = (int) wp_remote_retrieve_response_code( $response );

	if ( $status < 200 || $status >= 300 ) {
		if ( 404 === $status ) {
			$error = bibliography_builder_pmid_error(
				'bibliography_builder_pmid_not_found',
				__( 'The PubMed ID could not be resolved.', 'borges-bibliography-builder' ),
				array( 'status' => 404 )
			);
			bibliography_builder_cache_pmid_result(
				$pmid,
				array(
					'type'    => 'error',
					'code'    => $error->get_error_code(),
					'message' => $error->get_error_message(),
					'data'    => $error->get_error_data(),
				),
				BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_CACHE_TTL
			);

			return $error;
		}

		$error = bibliography_builder_pmid_error(
			'bibliography_builder_pmid_upstream_error',
			__( 'The PubMed citation service returned an error.', 'borges-bibliography-builder' ),
			array(
				'status'          => 502,
				'upstream_status' => $status,
			)
		);
		bibliography_builder_cache_pmid_result(
			$pmid,
			array(
				'type'    => 'error',
				'code'    => $error->get_error_code(),
				'message' => $error->get_error_message(),
				'data'    => $error->get_error_data(),
			),
			BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL
		);

		return $error;
	}

	$decoded = json_decode( wp_remote_retrieve_body( $response ), true );

	if ( ! is_array( $decoded ) || empty( $decoded ) ) {
		$error = bibliography_builder_pmid_error(
			'bibliography_builder_pmid_invalid_response',
			__( 'The PubMed citation service returned an invalid response.', 'borges-bibliography-builder' ),
			array( 'status' => 502 )
		);
		bibliography_builder_cache_pmid_result(
			$pmid,
			array(
				'type'    => 'error',
				'code'    => $error->get_error_code(),
				'message' => $error->get_error_message(),
				'data'    => $error->get_error_data(),
			),
			BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL
		);

		return $error;
	}

	bibliography_builder_cache_pmid_result(
		$pmid,
		array(
			'type' => 'success',
			'data' => $decoded,
		),
		BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_CACHE_TTL
	);

	return rest_ensure_response( $decoded );
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
 *   - empty_bibliography (error) - block has no citations.
 *   - heading_missing (warning) - citations exist with no visible heading.
 *   - raw_url_link_text (warning) - citation link text is a raw URL/DOI.
 *   - all_metadata_disabled (warning) - metadata outputs are disabled.
 *
 * @since 1.1.0
 */
function bibliography_builder_register_a11y_checks() {
	if ( ! function_exists( 'ba11yc_register_block_check' ) ) {
		return;
	}

	$raw_url_link_text_message     = __(
		'One or more citations use a URL or DOI as link text. Add a descriptive title for screen readers.',
		'borges-bibliography-builder'
	);
	$all_metadata_disabled_message = __(
		'All machine-readable metadata outputs are disabled. Enable JSON-LD, COinS, or CSL-JSON for interoperability.',
		'borges-bibliography-builder'
	);
	$heading_missing_message       = __(
		'Bibliography block has no heading. Screen reader users may not find this section.',
		'borges-bibliography-builder'
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'empty_bibliography',
			'error_msg'    => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'warning_msg'  => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'description'  => __( 'Add at least one citation before publishing.', 'borges-bibliography-builder' ),
			'level'        => 'error',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'heading_missing',
			'error_msg'    => $heading_missing_message,
			'warning_msg'  => $heading_missing_message,
			'description'  => __(
				'Add a heading in block settings so the bibliography is announced as a document section.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'raw_url_link_text',
			'error_msg'    => $raw_url_link_text_message,
			'warning_msg'  => $raw_url_link_text_message,
			'description'  => __(
				'Citations with a URL or DOI should have a descriptive title as link text.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'all_metadata_disabled',
			'error_msg'    => $all_metadata_disabled_message,
			'warning_msg'  => $all_metadata_disabled_message,
			'description'  => __(
				'Enable at least one metadata output to improve citation-manager interoperability.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);
}
add_action( 'ba11yc_ready', 'bibliography_builder_register_a11y_checks', 10, 0 );

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
