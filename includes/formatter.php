<?php
/**
 * The citation formatter: style definitions, citeproc-php adaptation and
 * rendering, and the formatter's cache.
 *
 * Moved unchanged from bibliography-builder.php (refactor memo, Phase B).
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Formatter style definitions, keyed by style key, from `styles.json`.
 *
 * @return array<string, array{template: string, locale: string, family: string}>
 */
function bibliography_builder_get_formatter_style_definitions() {
	$definitions = array();

	foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
		$definitions[ $key ] = array(
			'template' => (string) $style['cslTemplate'],
			'locale'   => (string) $style['locale'],
			'family'   => (string) $style['family'],
		);
	}

	return $definitions;
}

/**
 * Get one formatter style definition, falling back to the default style.
 *
 * @param string $style_key Style key from the block attribute.
 * @return array
 */
function bibliography_builder_get_formatter_style_definition( $style_key ) {
	$styles = bibliography_builder_get_formatter_style_definitions();

	return isset( $styles[ $style_key ] ) ? $styles[ $style_key ] : $styles[ bibliography_builder_default_style_key() ];
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
 * MD5 of a bundled CSL style file's contents, or '' when it cannot be read.
 * Memoized per request.
 *
 * @param string $template Style template name (file name without .csl).
 * @return string
 */
function bibliography_builder_get_formatter_style_hash( $template ) {
	static $hashes = array();

	if ( ! isset( $hashes[ $template ] ) ) {
		$dir                 = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'vendor/citation-style-language/styles/';
		$path                = $dir . $template . '.csl';
		$hash                = '' !== $template && is_readable( $path ) ? md5_file( $path ) : false;
		$hashes[ $template ] = is_string( $hash ) ? $hash : '';
	}

	return $hashes[ $template ];
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
	$template = isset( $style['template'] ) ? (string) $style['template'] : '';
	$payload  = array(
		'version'    => 3,
		'style'      => sanitize_key( $style_key ),
		'template'   => $template,
		// The bundled styles change between releases (new manual editions), so
		// key on their contents: a cached entry from an older style is never
		// served after an upgrade.
		'style_hash' => bibliography_builder_get_formatter_style_hash( $template ),
		'locale'     => isset( $style['locale'] ) ? (string) $style['locale'] : '',
		'csl_items'  => bibliography_builder_sort_for_cache_key( array_values( $csl_items ) ),
	);
	$encoded  = bibliography_builder_json_encode( $payload );

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
	$stripped = bibliography_builder_strip_bounded( $decoded );

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

	// citeproc-php puts a space between a name and a label whose prefix is
	// ", " ("Lindqvist , eds."); a space before a comma is never wanted.
	$text = str_replace( ' ,', ',', $text );

	// American styles put commas and periods inside closing quotes. citeproc-php
	// only does so for an element's own suffix, not for a group delimiter
	// (“Title”, in IEEE).
	if ( isset( $style['locale'] ) && 'en-US' === $style['locale'] ) {
		$text = str_replace( array( '”,', '”.' ), array( ',”', '.”' ), $text );
	}

	// A title ending in "?" or "!" takes no period after it, but citeproc-php
	// adds the title's "." suffix anyway ("What Is It?.”"). Commas stay: CMOS
	// keeps one after a question-mark title (“Are You a Doctor?,” in notes).
	$text = preg_replace( '/([?!])([”’]?)\./u', '$1$2', $text );

	// citeproc-php initializes only capitalized parts of a hyphenated given
	// name, so "Ji-woo" comes out "J.- woo". Initialize the second part too.
	$text = preg_replace_callback(
		'/(\p{Lu})(\.?)- (\p{Ll})\p{Ll}*/u',
		static function ( $parts ) {
			return $parts[1] . $parts[2] . '-' . mb_strtoupper( $parts[3], 'UTF-8' ) . $parts[2];
		},
		$text
	);

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
 * Adapt a CSL-JSON item to what citeproc-php 2.7 can render.
 *
 * - Literal names (organizations, one-name authors): citeproc-php renders a
 *   name only from its `family` part, so `{ "literal": "Open Research
 *   Alliance" }` would vanish. As a family-only name it prints whole, never
 *   inverted or initialized.
 * - `page-first`: citeproc-php does not derive it from `page`, and OSCOLA
 *   cites a journal article by its first page.
 * - Name particles: for a style that demotes them in display (Chicago:
 *   `demote-non-dropping-particle="display-and-sort"`), a lowercase particle
 *   still inside `family` ("van Duijnhoven") moves to `non-dropping-particle`,
 *   so citeproc-php prints "Duijnhoven, Elza van". Other styles print the name
 *   as stored, so their output is unchanged; splitting there would also make
 *   citeproc-php print an elided particle with a space ("d’ Alembert").
 *
 * @param array $item                    CSL-JSON item.
 * @param bool  $demote_particle_display Whether the style demotes particles in display.
 * @return array
 */
function bibliography_builder_prepare_csl_for_formatter( $item, $demote_particle_display = false ) {
	$name_variables = array(
		'author',
		'collection-editor',
		'composer',
		'container-author',
		'director',
		'editor',
		'editorial-director',
		'illustrator',
		'interviewer',
		'original-author',
		'recipient',
		'reviewed-author',
		'translator',
	);

	foreach ( $name_variables as $variable ) {
		if ( empty( $item[ $variable ] ) || ! is_array( $item[ $variable ] ) ) {
			continue;
		}

		foreach ( $item[ $variable ] as $position => $name ) {
			$is_literal = is_array( $name ) && empty( $name['family'] )
				&& isset( $name['literal'] ) && is_string( $name['literal'] );
			$literal    = $is_literal ? trim( $name['literal'] ) : '';

			if ( '' !== $literal ) {
				$item[ $variable ][ $position ] = array( 'family' => $literal );
				continue;
			}

			if ( $demote_particle_display && is_array( $name ) && empty( $name['non-dropping-particle'] ) ) {
				$split = bibliography_builder_split_name_particle( isset( $name['family'] ) ? $name['family'] : null );

				if ( null !== $split ) {
					$name['family']                 = $split['family'];
					$name['non-dropping-particle']  = $split['particle'];
					$item[ $variable ][ $position ] = $name;
				}
			}
		}
	}

	if ( empty( $item['page-first'] ) && isset( $item['page'] ) && is_scalar( $item['page'] ) ) {
		$first = trim( preg_split( '/[-\x{2013}\x{2014},&]/u', (string) $item['page'] )[0] );

		if ( '' !== $first ) {
			$item['page-first'] = $first;
		}
	}

	return $item;
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

	$prepared_items  = array();
	$demote_particle = 1 === preg_match( '/demote-non-dropping-particle="display-and-sort"/', $style_xml );

	foreach ( array_values( $csl_items ) as $index => $item ) {
		$item_array       = bibliography_builder_prepare_csl_for_formatter(
			is_array( $item ) ? $item : array(),
			$demote_particle
		);
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

	// One render per entry: citeproc-php keeps per-render state on its parsed
	// name elements (once one entry is cut to "et al.", later entries in the
	// same render lose their "and"), and no style here needs cross-entry
	// context such as disambiguation or author substitution. The reusable
	// formatter parses the style once and restores that state before each
	// entry, instead of reparsing the style and locale for every entry.
	try {
		require_once BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'includes/class-bibliography-builder-reusable-citeproc.php';

		$html      = '';
		$formatter = new Bibliography_Builder_Reusable_CiteProc( $style_xml, $style['locale'], $markup_extension );

		foreach ( $items_for_formatter as $item_for_formatter ) {
			$html .= $formatter->render( array( $item_for_formatter ), 'bibliography' );
		}
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
