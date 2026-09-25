<?php
/**
 * PHP port of the block's static save() markup (Phase 05, M2 spike).
 *
 * Borges stores its bibliography as static HTML inside `post_content`, and the
 * editor re-validates that HTML against the JS `save()` every time a post is
 * opened. A server-side write route therefore has to regenerate markup the
 * editor would have produced from the same attributes, or the block opens as
 * "invalid content".
 *
 * This file reproduces `renderBibliographySave()` in `src/save-markup.js` and
 * the helpers it calls (sorting, display segments, link splitting, JSON-LD,
 * COinS, RIS/CSL-JSON cite-export links, and the block-supports wrapper).
 * Every function names the JS function it mirrors. Parity is enforced by
 * committed fixtures: PHPUnit renders each case in
 * `tests/fixtures/save-parity/cases.json` and compares it with the committed
 * markup, and Jest checks that the same committed markup is byte-identical to
 * the current JS `save()` and validates in the real block registry.
 *
 * Nothing calls this yet. It exists so the M2 write routes can be built on it.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Characters JavaScript's `\s` matches (ECMAScript WhiteSpace + LineTerminator),
 * as a PCRE character-class body.
 */
const BIBLIOGRAPHY_BUILDER_JS_WHITESPACE = '\t\n\x0B\f\r \x{00A0}\x{1680}\x{2000}-\x{200A}'
	. '\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

/**
 * A page-range separator: a hyphen, en dash, or em dash with optional
 * JavaScript whitespace around it.
 */
const BIBLIOGRAPHY_BUILDER_PAGE_RANGE_SEPARATOR = '/[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']*[-–—]['
	. BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']*/u';

/**
 * Whether this PHP can render save markup: sorting needs ICU collation and
 * export filenames need Unicode normalization, exactly as the browser has.
 *
 * @return bool
 */
function bibliography_builder_can_render_save_markup() {
	return class_exists( 'Collator' ) && class_exists( 'Normalizer' );
}

/**
 * JavaScript truthiness for a decoded JSON value.
 *
 * @param mixed $value Value.
 * @return bool
 */
function bibliography_builder_js_truthy( $value ) {
	if ( is_array( $value ) ) {
		return true;
	}

	if ( is_float( $value ) && is_nan( $value ) ) {
		return false;
	}

	return null !== $value && false !== $value && 0 !== $value && 0.0 !== $value && '' !== $value;
}

/**
 * JavaScript `String(value)` for a decoded JSON scalar.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_js_string( $value ) {
	if ( null === $value ) {
		return 'null';
	}

	if ( is_bool( $value ) ) {
		return $value ? 'true' : 'false';
	}

	if ( is_float( $value ) ) {
		return bibliography_builder_js_number( $value );
	}

	if ( is_array( $value ) ) {
		// String([a, b]) joins with commas; objects never reach here in practice.
		return bibliography_builder_is_list_array( $value )
			? implode( ',', array_map( 'bibliography_builder_js_string', $value ) )
			: '[object Object]';
	}

	return (string) $value;
}

/**
 * JavaScript number-to-string conversion for a float.
 *
 * @param float $value Number.
 * @return string
 */
function bibliography_builder_js_number( $value ) {
	if ( is_nan( $value ) ) {
		return 'NaN';
	}

	if ( is_infinite( $value ) ) {
		return $value > 0 ? 'Infinity' : '-Infinity';
	}

	if ( floor( $value ) === $value && abs( $value ) < 1e21 ) {
		return sprintf( '%.0f', $value );
	}

	// PHP's shortest round-trip form matches JavaScript's for ordinary values.
	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Number formatting only.
	$encoded = json_encode( $value );

	return is_string( $encoded ) ? $encoded : (string) $value;
}

/**
 * `JSON.stringify()` for a decoded JSON value, optionally pretty-printed with
 * two-space indentation as `JSON.stringify( value, null, 2 )` does.
 *
 * Written out rather than using `json_encode()` because PHP differs from
 * JavaScript on whole-number floats (`1.0`) and indentation width.
 *
 * Known limit: an empty JSON object (`{}`) decodes to an empty PHP array and
 * is written back as `[]`.
 *
 * @param mixed    $value  Value.
 * @param int|null $indent Spaces per level, or null for compact output.
 * @param int      $depth  Current depth (internal).
 * @return string
 */
function bibliography_builder_json_stringify( $value, $indent = null, $depth = 0 ) {
	if ( null === $value ) {
		return 'null';
	}

	if ( is_bool( $value ) ) {
		return $value ? 'true' : 'false';
	}

	if ( is_int( $value ) ) {
		return (string) $value;
	}

	if ( is_float( $value ) ) {
		return is_finite( $value ) ? bibliography_builder_js_number( $value ) : 'null';
	}

	if ( is_string( $value ) ) {
		$flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			| JSON_UNESCAPED_LINE_TERMINATORS | JSON_INVALID_UTF8_SUBSTITUTE;
		// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Exact JSON.stringify string escaping.
		$encoded = json_encode( $value, $flags );

		return is_string( $encoded ) ? $encoded : '""';
	}

	if ( ! is_array( $value ) ) {
		return 'null';
	}

	$is_list = bibliography_builder_is_list_array( $value );

	if ( array() === $value ) {
		return '[]';
	}

	$items = array();

	foreach ( $value as $key => $item ) {
		$encoded_item = bibliography_builder_json_stringify( $item, $indent, $depth + 1 );
		$items[]      = $is_list
			? $encoded_item
			: bibliography_builder_json_stringify( (string) $key ) . ( null === $indent ? ':' : ': ' ) . $encoded_item;
	}

	list( $open, $close ) = $is_list ? array( '[', ']' ) : array( '{', '}' );

	if ( null === $indent ) {
		return $open . implode( ',', $items ) . $close;
	}

	$inner = "\n" . str_repeat( ' ', $indent * ( $depth + 1 ) );
	$outer = "\n" . str_repeat( ' ', $indent * $depth );

	return $open . $inner . implode( ',' . $inner, $items ) . $outer . $close;
}

/**
 * `encodeURIComponent()`.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_encode_uri_component( $value ) {
	return strtr(
		rawurlencode( (string) $value ),
		array(
			'%21' => '!',
			'%27' => "'",
			'%28' => '(',
			'%29' => ')',
			'%2A' => '*',
		)
	);
}

/**
 * `escapeAmpersand()` from `@wordpress/escape-html`: leaves anything that
 * already looks like an entity alone.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_escape_ampersand( $value ) {
	return (string) preg_replace( '/&(?!([a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/i', '&amp;', $value );
}

/**
 * `escapeHTML()` from `@wordpress/escape-html`, used for text nodes.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_escape_save_text( $value ) {
	return str_replace( '<', '&lt;', bibliography_builder_escape_ampersand( (string) $value ) );
}

/**
 * `escapeAttribute()` from `@wordpress/escape-html`.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_escape_save_attribute( $value ) {
	return strtr(
		bibliography_builder_escape_ampersand( (string) $value ),
		array(
			'"' => '&quot;',
			'<' => '&lt;',
			'>' => '&gt;',
		)
	);
}

/**
 * Serialize an element's attributes in the given order, skipping null values.
 *
 * @param array $attributes Attribute name => value.
 * @return string
 */
function bibliography_builder_save_attributes( $attributes ) {
	$html = '';

	foreach ( $attributes as $name => $value ) {
		if ( null === $value ) {
			continue;
		}

		// @wordpress/element serializes `download` as a boolean attribute, so
		// a truthy value is written bare and the filename is dropped.
		$html .= 'download' === $name
			? ' download'
			: ' ' . $name . '="' . bibliography_builder_escape_save_attribute( $value ) . '"';
	}

	return $html;
}

/**
 * Front-end style definitions the save markup depends on.
 *
 * Mirrors the `listType`, `family`, and `locale` fields of `STYLE_DEFINITIONS`
 * in `src/lib/formatting/style-registry.js`.
 *
 * @param string $style_key Style key.
 * @return array{key: string, listType: string, family: string, locale: string}
 */
function bibliography_builder_get_save_style_definition( $style_key ) {
	$styles = array(
		'chicago-notes-bibliography' => array( 'ul', 'notes', 'en-US' ),
		'chicago-author-date'        => array( 'ul', 'author-date', 'en-US' ),
		'apa-7'                      => array( 'ul', 'author-date', 'en-US' ),
		'mla-9'                      => array( 'ul', 'author-date', 'en-US' ),
		'harvard'                    => array( 'ul', 'author-date', 'en-US' ),
		'ieee'                       => array( 'ol', 'numeric', 'en-US' ),
		'vancouver'                  => array( 'ol', 'numeric', 'en-US' ),
		'oscola'                     => array( 'ul', 'notes', 'en-GB' ),
		'abnt'                       => array( 'ul', 'author-date', 'pt-BR' ),
	);
	$key    = is_string( $style_key ) && isset( $styles[ $style_key ] ) ? $style_key : 'chicago-notes-bibliography';

	return array(
		'key'      => $key,
		'listType' => $styles[ $key ][0],
		'family'   => $styles[ $key ][1],
		'locale'   => $styles[ $key ][2],
	);
}

/**
 * `getPrimaryIdentifierValue()` from `src/lib/csl-utils.js`.
 *
 * @param mixed $value CSL identifier field.
 * @return string
 */
function bibliography_builder_get_primary_identifier( $value ) {
	if ( is_array( $value ) && bibliography_builder_is_list_array( $value ) ) {
		foreach ( $value as $item ) {
			if ( is_string( $item ) && '' !== $item ) {
				return $item;
			}
		}

		return '';
	}

	return is_string( $value ) ? $value : '';
}

/**
 * Read a CSL field, treating a missing key as null.
 *
 * @param array  $csl   CSL-JSON item.
 * @param string $field Field name.
 * @return mixed
 */
function bibliography_builder_csl_field( $csl, $field ) {
	return is_array( $csl ) && array_key_exists( $field, $csl ) ? $csl[ $field ] : null;
}

/**
 * `csl.issued['date-parts'][0]` when present and truthy, else null.
 *
 * @param array $csl CSL-JSON item.
 * @return array|null
 */
function bibliography_builder_csl_first_date_parts( $csl ) {
	$issued = bibliography_builder_csl_field( $csl, 'issued' );
	$parts  = is_array( $issued ) && isset( $issued['date-parts'] ) ? $issued['date-parts'] : null;

	return is_array( $parts ) && isset( $parts[0] ) && is_array( $parts[0] ) ? $parts[0] : null;
}

/**
 * `parts.map( … padStart( 2, '0' ) ).join( '-' )` used by JSON-LD and COinS.
 *
 * @param array $parts Date parts.
 * @return string
 */
function bibliography_builder_join_date_parts( $parts ) {
	$strings = array();

	foreach ( array_values( $parts ) as $index => $part ) {
		$string    = bibliography_builder_js_string( $part );
		$strings[] = 0 === $index ? $string : str_pad( $string, 2, '0', STR_PAD_LEFT );
	}

	return implode( '-', $strings );
}

// ── Sorting: src/lib/sorter.js ───────────────────────────────────────────────

/**
 * `getPrimaryContributors()`.
 *
 * @param array $csl CSL-JSON item.
 * @return array|null
 */
function bibliography_builder_sort_primary_contributors( $csl ) {
	foreach ( array( 'author', 'editor' ) as $field ) {
		$names = bibliography_builder_csl_field( $csl, $field );

		if ( is_array( $names ) && count( $names ) > 0 ) {
			return array_values( $names );
		}
	}

	return null;
}

/**
 * `stripArticles()`.
 *
 * @param mixed $title Title.
 * @return string
 */
function bibliography_builder_sort_strip_articles( $title ) {
	$title = bibliography_builder_js_truthy( $title ) ? bibliography_builder_js_string( $title ) : '';

	return (string) preg_replace( '/^(a|an|the)[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+/iu', '', $title );
}

/**
 * JavaScript `toLowerCase()`.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_js_lower( $value ) {
	return function_exists( 'mb_strtolower' ) ? mb_strtolower( $value, 'UTF-8' ) : strtolower( $value );
}

/**
 * A string-valued name part, or '' when it is falsy.
 *
 * @param array  $name Name object.
 * @param string $part Part key.
 * @return string
 */
function bibliography_builder_name_part( $name, $part ) {
	return is_array( $name ) && isset( $name[ $part ] ) && bibliography_builder_js_truthy( $name[ $part ] )
		? bibliography_builder_js_string( $name[ $part ] )
		: '';
}

/**
 * `getAuthorSort()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_sort_author_key( $csl ) {
	$contributors = bibliography_builder_sort_primary_contributors( $csl );

	if ( null === $contributors ) {
		$title = bibliography_builder_csl_field( $csl, 'title' );

		return bibliography_builder_js_truthy( $title )
			? bibliography_builder_js_lower( bibliography_builder_sort_strip_articles( $title ) )
			: "\u{FFFF}";
	}

	$first = $contributors[0];
	$name  = bibliography_builder_name_part( $first, 'family' );

	return bibliography_builder_js_lower( '' !== $name ? $name : bibliography_builder_name_part( $first, 'literal' ) );
}

/**
 * `getSortableYear()`, as a float so a missing year is INF.
 *
 * @param array $csl CSL-JSON item.
 * @return float
 */
function bibliography_builder_sort_year( $csl ) {
	$parts = bibliography_builder_csl_first_date_parts( $csl );
	$year  = null !== $parts && isset( $parts[0] ) ? $parts[0] : null;

	if ( ! bibliography_builder_js_truthy( $year ) ) {
		return INF;
	}

	return is_numeric( $year ) ? (float) $year : NAN;
}

/**
 * `getTitleSort()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_sort_title_key( $csl ) {
	return bibliography_builder_js_lower(
		bibliography_builder_sort_strip_articles( bibliography_builder_csl_field( $csl, 'title' ) )
	);
}

/**
 * `localeCompare( other, locale, { sensitivity: 'base' } )`.
 *
 * @param Collator $collator Collator at primary strength.
 * @param string   $a        First string.
 * @param string   $b        Second string.
 * @return int
 */
function bibliography_builder_locale_compare( $collator, $a, $b ) {
	return (int) $collator->compare( $a, $b );
}

/**
 * `compareYears()`: NaN (including INF - INF) sorts as equal, as in JS.
 *
 * @param array $a CSL-JSON item.
 * @param array $b CSL-JSON item.
 * @return int
 */
function bibliography_builder_sort_compare_years( $a, $b ) {
	$difference = bibliography_builder_sort_year( $a ) - bibliography_builder_sort_year( $b );

	if ( is_nan( $difference ) || 0.0 === $difference ) {
		return 0;
	}

	return $difference < 0 ? -1 : 1;
}

/**
 * `normalizeContributorKey()`.
 *
 * @param mixed $contributor Name object.
 * @return string
 */
function bibliography_builder_sort_contributor_key( $contributor ) {
	$family  = bibliography_builder_js_lower( trim( bibliography_builder_name_part( $contributor, 'family' ) ) );
	$given   = bibliography_builder_js_lower( trim( bibliography_builder_name_part( $contributor, 'given' ) ) );
	$literal = bibliography_builder_js_lower( trim( bibliography_builder_name_part( $contributor, 'literal' ) ) );

	return '' !== $family ? $family . '|' . $given : $literal;
}

/**
 * `compareAuthorChains()`.
 *
 * @param Collator $collator Collator.
 * @param array    $chain_a  Contributor keys.
 * @param array    $chain_b  Contributor keys.
 * @return int
 */
function bibliography_builder_sort_compare_chains( $collator, $chain_a, $chain_b ) {
	$first = bibliography_builder_locale_compare(
		$collator,
		isset( $chain_a[0] ) ? $chain_a[0] : '',
		isset( $chain_b[0] ) ? $chain_b[0] : ''
	);

	if ( 0 !== $first ) {
		return $first;
	}

	$length_a = count( $chain_a );
	$length_b = count( $chain_b );

	if ( $length_a !== $length_b ) {
		if ( 1 === $length_a ) {
			return -1;
		}

		if ( 1 === $length_b ) {
			return 1;
		}
	}

	$shared = min( $length_a, $length_b );

	for ( $index = 1; $index < $shared; $index++ ) {
		$comparison = bibliography_builder_locale_compare( $collator, $chain_a[ $index ], $chain_b[ $index ] );

		if ( 0 !== $comparison ) {
			return $comparison;
		}
	}

	return $length_a - $length_b;
}

/**
 * The comparator for a style family: `compareNotes()` or `compareAuthorDate()`.
 *
 * @param string   $family   Style family.
 * @param Collator $collator Collator.
 * @param array    $a        CSL-JSON item.
 * @param array    $b        CSL-JSON item.
 * @return int
 */
function bibliography_builder_sort_compare( $family, $collator, $a, $b ) {
	$authors = bibliography_builder_locale_compare(
		$collator,
		bibliography_builder_sort_author_key( $a ),
		bibliography_builder_sort_author_key( $b )
	);
	$titles  = static function () use ( $collator, $a, $b ) {
		return bibliography_builder_locale_compare(
			$collator,
			bibliography_builder_sort_title_key( $a ),
			bibliography_builder_sort_title_key( $b )
		);
	};

	if ( 'notes' === $family ) {
		if ( 0 !== $authors ) {
			return $authors;
		}

		$title_comparison = $titles();

		return 0 !== $title_comparison ? $title_comparison : bibliography_builder_sort_compare_years( $a, $b );
	}

	$key     = 'bibliography_builder_sort_contributor_key';
	$chain_a = array_map( $key, (array) bibliography_builder_sort_primary_contributors( $a ) );
	$chain_b = array_map( $key, (array) bibliography_builder_sort_primary_contributors( $b ) );

	if ( array() !== $chain_a && array() !== $chain_b ) {
		$chains = bibliography_builder_sort_compare_chains( $collator, $chain_a, $chain_b );

		if ( 0 !== $chains ) {
			return $chains;
		}
	}

	if ( 0 !== $authors ) {
		return $authors;
	}

	$years = bibliography_builder_sort_compare_years( $a, $b );

	return 0 !== $years ? $years : $titles();
}

/**
 * `sortCitations()`: stable sort by style family; numeric styles keep order.
 *
 * @param array  $citations Citation records.
 * @param string $style_key Style key.
 * @return array
 */
function bibliography_builder_sort_citations_for_save( $citations, $style_key ) {
	$style     = bibliography_builder_get_save_style_definition( $style_key );
	$citations = array_values( $citations );

	if ( 'numeric' === $style['family'] ) {
		return $citations;
	}

	$collator = new Collator( str_replace( '-', '_', $style['locale'] ) );
	$collator->setStrength( Collator::PRIMARY );

	$indexed = array();

	foreach ( $citations as $index => $citation ) {
		$indexed[] = array( $index, $citation );
	}

	usort(
		$indexed,
		static function ( $left, $right ) use ( $style, $collator ) {
			$comparison = bibliography_builder_sort_compare(
				$style['family'],
				$collator,
				bibliography_builder_citation_csl( $left[1] ),
				bibliography_builder_citation_csl( $right[1] )
			);

			return 0 !== $comparison ? $comparison : $left[0] - $right[0];
		}
	);

	return array_column( $indexed, 1 );
}

/**
 * A citation's CSL-JSON object, or an empty array.
 *
 * @param mixed $citation Citation record.
 * @return array
 */
function bibliography_builder_citation_csl( $citation ) {
	return is_array( $citation ) && isset( $citation['csl'] ) && is_array( $citation['csl'] )
		? $citation['csl']
		: array();
}

// ── Display text: src/lib/formatting/index.js ────────────────────────────────

/**
 * `getDisplayText()`.
 *
 * @param array $citation Citation record.
 * @return string
 */
function bibliography_builder_save_display_text( $citation ) {
	foreach ( array( 'displayOverride', 'formattedText' ) as $field ) {
		if ( isset( $citation[ $field ] ) && bibliography_builder_js_truthy( $citation[ $field ] ) ) {
			return bibliography_builder_js_string( $citation[ $field ] );
		}
	}

	$title = bibliography_builder_csl_field( bibliography_builder_citation_csl( $citation ), 'title' );

	return bibliography_builder_js_truthy( $title ) ? bibliography_builder_js_string( $title ) : '';
}

/**
 * `getItalicizedFields()`.
 *
 * @param array $csl CSL-JSON item.
 * @return array
 */
function bibliography_builder_save_italic_fields( $csl ) {
	$title_types     = array(
		'book',
		'broadcast',
		'collection',
		'dataset',
		'entry-dictionary',
		'entry-encyclopedia',
		'graphic',
		'interview',
		'legal_case',
		'legislation',
		'manuscript',
		'map',
		'motion_picture',
		'musical_score',
		'pamphlet',
		'patent',
		'performance',
		'periodical',
		'regulation',
		'report',
		'software',
		'song',
		'speech',
		'standard',
		'thesis',
		'treaty',
		'webpage',
	);
	$container_types = array(
		'article-journal',
		'article-magazine',
		'article-newspaper',
		'chapter',
		'entry',
		'paper-conference',
		'post',
		'post-weblog',
		'review',
		'review-book',
	);
	$type            = bibliography_builder_csl_field( $csl, 'type' );

	if ( in_array( $type, $title_types, true ) ) {
		return array( bibliography_builder_csl_field( $csl, 'title' ) );
	}

	if ( in_array( $type, $container_types, true ) ) {
		return array( bibliography_builder_csl_field( $csl, 'container-title' ) );
	}

	return array();
}

/**
 * `isQuotedAt()`: the match is wrapped in straight or curly double quotes.
 *
 * @param string $text  Display text.
 * @param int    $start Byte offset.
 * @param int    $end   Byte offset.
 * @return bool
 */
function bibliography_builder_save_is_quoted( $text, $start, $end ) {
	$before = substr( $text, 0, $start );
	$after  = substr( $text, $end );

	$opens  = '"' === substr( $before, -1 ) || "\u{201C}" === substr( $before, -3 );
	$closes = '"' === substr( $after, 0, 1 ) || "\u{201D}" === substr( $after, 0, 3 );

	return $opens && $closes;
}

/**
 * `findLastRange()`: the last occurrence of a value that is neither quoted nor
 * overlapping a range already found. Offsets are bytes; UTF-8 substring search
 * finds the same occurrences as JavaScript's UTF-16 search.
 *
 * @param string $text   Display text.
 * @param string $value  Field value.
 * @param array  $ranges Ranges found so far.
 * @return array|null
 */
function bibliography_builder_save_find_last_range( $text, $value, $ranges ) {
	$start = strrpos( $text, $value );

	while ( false !== $start ) {
		$end      = $start + strlen( $value );
		$overlaps = false;

		foreach ( $ranges as $range ) {
			$overlaps = $overlaps || ( $start < $range['end'] && $end > $range['start'] );
		}

		if ( ! bibliography_builder_save_is_quoted( $text, $start, $end ) && ! $overlaps ) {
			return array(
				'start' => $start,
				'end'   => $end,
			);
		}

		if ( 0 === $start ) {
			return null;
		}

		// lastIndexOf( value, start - 1 ): the last match starting before $start.
		$start = strrpos( substr( $text, 0, $start - 1 + strlen( $value ) ), $value );
	}

	return null;
}

/**
 * `getDisplaySegments()`.
 *
 * @param array $citation Citation record.
 * @return array<int, array{text: string, italic: bool}>
 */
function bibliography_builder_save_display_segments( $citation ) {
	$text = bibliography_builder_save_display_text( $citation );

	$override = isset( $citation['displayOverride'] ) && bibliography_builder_js_truthy( $citation['displayOverride'] );

	if ( '' === $text || $override ) {
		return array(
			array(
				'text'   => $text,
				'italic' => false,
			),
		);
	}

	$ranges = array();

	foreach ( bibliography_builder_save_italic_fields( bibliography_builder_citation_csl( $citation ) ) as $value ) {
		if ( ! bibliography_builder_js_truthy( $value ) ) {
			continue;
		}

		$range = bibliography_builder_save_find_last_range( $text, bibliography_builder_js_string( $value ), $ranges );

		if ( null !== $range ) {
			$ranges[] = $range;
		}
	}

	if ( array() === $ranges ) {
		return array(
			array(
				'text'   => $text,
				'italic' => false,
			),
		);
	}

	usort(
		$ranges,
		static function ( $left, $right ) {
			return $left['start'] - $right['start'];
		}
	);

	$segments = array();
	$cursor   = 0;

	foreach ( $ranges as $range ) {
		if ( $range['start'] > $cursor ) {
			$segments[] = array(
				'text'   => substr( $text, $cursor, $range['start'] - $cursor ),
				'italic' => false,
			);
		}

		$segments[] = array(
			'text'   => substr( $text, $range['start'], $range['end'] - $range['start'] ),
			'italic' => true,
		);
		$cursor     = $range['end'];
	}

	if ( $cursor < strlen( $text ) ) {
		$segments[] = array(
			'text'   => substr( $text, $cursor ),
			'italic' => false,
		);
	}

	return $segments;
}

/**
 * `splitTrailingUrlPunctuation()`.
 *
 * @param string $url Matched URL text.
 * @return array{0: string, 1: string} Href and trailing punctuation.
 */
function bibliography_builder_save_split_trailing_punctuation( $url ) {
	$href     = $url;
	$trailing = '';

	while ( '' !== $href ) {
		$last = substr( $href, -1 );

		if ( false !== strpos( '.,;:!?', $last ) ) {
			$trailing = $last . $trailing;
			$href     = substr( $href, 0, -1 );
			continue;
		}

		if ( ')' === $last && substr_count( $href, ')' ) > substr_count( $href, '(' ) ) {
			$trailing = $last . $trailing;
			$href     = substr( $href, 0, -1 );
			continue;
		}

		break;
	}

	return array( $href, $trailing );
}

/**
 * `isLinkableUrl()`: whether `new URL( candidate )` parses with an http(s)
 * scheme. The candidate always starts with `http://` or `https://`, so this
 * only has to reproduce the WHATWG parser's host failures that matter for
 * text a citation can contain.
 *
 * Known limit: an approximation of the WHATWG URL parser, covering empty
 * hosts, forbidden host code points, bad ports, and malformed IPv6 literals.
 *
 * @param string $candidate URL text.
 * @return bool
 */
function bibliography_builder_save_is_linkable_url( $candidate ) {
	if ( 1 !== preg_match( '#^https?:[/\\\\]*([^/\\\\?\#]*)#i', $candidate, $match ) ) {
		return false;
	}

	$authority = $match[1];
	$at        = strrpos( $authority, '@' );
	$host_port = false === $at ? $authority : substr( $authority, $at + 1 );

	if ( '' !== $host_port && '[' === $host_port[0] ) {
		return 1 === preg_match( '/^\[[0-9A-Fa-f:.]+\](?::\d*)?$/', $host_port );
	}

	$colon = strpos( $host_port, ':' );
	$host  = false === $colon ? $host_port : substr( $host_port, 0, $colon );
	$port  = false === $colon ? '' : substr( $host_port, $colon + 1 );

	if ( '' === $host || ( '' !== $port && ( ! ctype_digit( $port ) || (int) $port > 65535 ) ) ) {
		return false;
	}

	$host = rawurldecode( $host );

	return 1 !== preg_match( '/[\x00-\x20\x7F#%\/:<>?@\[\\\\\]^|]/', $host );
}

/**
 * `splitTextIntoLinkParts()`.
 *
 * @param string $text       Segment text.
 * @param string $link_label Accessible label for links.
 * @return array<int, array{text: string, link: bool, href?: string, label?: string}>
 */
function bibliography_builder_save_link_parts( $text, $link_label ) {
	if ( '' === $text ) {
		return array(
			array(
				'text' => '',
				'link' => false,
			),
		);
	}

	$parts  = array();
	$cursor = 0;

	$pattern = '#https?://[^' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+#u';

	preg_match_all( $pattern, $text, $matches, PREG_OFFSET_CAPTURE );

	foreach ( $matches[0] as $match ) {
		list( $url, $start ) = $match;

		if ( $start > $cursor ) {
			$parts[] = array(
				'text' => substr( $text, $cursor, $start - $cursor ),
				'link' => false,
			);
		}

		list( $href, $trailing ) = bibliography_builder_save_split_trailing_punctuation( $url );

		if ( ! bibliography_builder_save_is_linkable_url( $href ) ) {
			$parts[] = array(
				'text' => $url,
				'link' => false,
			);
			$cursor  = $start + strlen( $url );
			continue;
		}

		$parts[] = array(
			'text'  => $href,
			'href'  => $href,
			'link'  => true,
			'label' => $link_label,
		);

		if ( '' !== $trailing ) {
			$parts[] = array(
				'text' => $trailing,
				'link' => false,
			);
		}

		$cursor = $start + strlen( $url );
	}

	if ( $cursor < strlen( $text ) ) {
		$parts[] = array(
			'text' => substr( $text, $cursor ),
			'link' => false,
		);
	}

	return $parts;
}

// ── Metadata: src/lib/jsonld.js, src/lib/coins.js ───────────────────────────

/**
 * `cslToJsonLd()`.
 *
 * @param array $csl CSL-JSON item.
 * @return array
 */
function bibliography_builder_save_csl_to_json_ld( $csl ) {
	$types = array(
		'article-journal'  => 'ScholarlyArticle',
		'book'             => 'Book',
		'chapter'          => 'Chapter',
		'thesis'           => 'Thesis',
		'report'           => 'Report',
		'paper-conference' => 'ScholarlyArticle',
		'review-book'      => 'Review',
		'webpage'          => 'WebPage',
	);
	$type  = bibliography_builder_csl_field( $csl, 'type' );
	$title = bibliography_builder_csl_field( $csl, 'title' );

	$result = array(
		'@context' => 'https://schema.org',
		'@type'    => is_string( $type ) && isset( $types[ $type ] ) ? $types[ $type ] : 'CreativeWork',
		'name'     => bibliography_builder_js_truthy( $title ) ? $title : '',
	);

	$authors = bibliography_builder_csl_field( $csl, 'author' );

	if ( is_array( $authors ) && count( $authors ) > 0 ) {
		$result['author'] = array();

		foreach ( array_values( $authors ) as $author ) {
			$literal = bibliography_builder_name_part( $author, 'literal' );
			$family  = bibliography_builder_name_part( $author, 'family' );
			$given   = bibliography_builder_name_part( $author, 'given' );

			if ( '' !== $literal && '' === $family && '' === $given ) {
				$result['author'][] = array(
					'@type' => 'Organization',
					'name'  => $author['literal'],
				);
				continue;
			}

			$person = array(
				'@type' => 'Person',
				'name'  => '' !== $literal
					? $author['literal']
					: implode( ' ', array_filter( array( $given, $family ), 'strlen' ) ),
			);

			if ( '' !== $family ) {
				$person['familyName'] = $author['family'];
			}

			if ( '' !== $given ) {
				$person['givenName'] = $author['given'];
			}

			$orcid = bibliography_builder_name_part( $author, 'ORCID' );

			if ( '' !== $orcid ) {
				$person['sameAs'] = 0 === strpos( $orcid, 'http' ) ? $orcid : 'https://orcid.org/' . $orcid;
			}

			$result['author'][] = $person;
		}
	}

	$parts = bibliography_builder_csl_first_date_parts( $csl );

	if ( null !== $parts ) {
		$result['datePublished'] = bibliography_builder_join_date_parts( $parts );
	}

	$container = bibliography_builder_csl_field( $csl, 'container-title' );
	$parents   = array(
		'article-journal'  => 'Periodical',
		'chapter'          => 'Book',
		'paper-conference' => 'Event',
	);

	if ( bibliography_builder_js_truthy( $container ) && is_string( $type ) && isset( $parents[ $type ] ) ) {
		$result['isPartOf'] = array(
			'@type' => $parents[ $type ],
			'name'  => $container,
		);

		$issn = bibliography_builder_csl_field( $csl, 'ISSN' );

		if ( 'article-journal' === $type && bibliography_builder_js_truthy( $issn ) ) {
			$first = is_array( $issn ) ? ( isset( $issn[0] ) ? $issn[0] : null ) : $issn;

			// JSON.stringify drops a property whose value is undefined.
			if ( null !== $first ) {
				$result['isPartOf']['issn'] = $first;
			}
		}
	}

	$publisher = bibliography_builder_csl_field( $csl, 'publisher' );

	if ( bibliography_builder_js_truthy( $publisher ) ) {
		$result['publisher'] = array(
			'@type' => 'Organization',
			'name'  => $publisher,
		);
	}

	$doi = bibliography_builder_csl_field( $csl, 'DOI' );

	if ( bibliography_builder_js_truthy( $doi ) ) {
		$result['identifier'] = array(
			'@type'      => 'PropertyValue',
			'propertyID' => 'DOI',
			'value'      => $doi,
		);
		$result['url']        = 'https://doi.org/'
			. bibliography_builder_encode_uri_component( bibliography_builder_js_string( $doi ) );
	}

	$isbn = bibliography_builder_get_primary_identifier( bibliography_builder_csl_field( $csl, 'ISBN' ) );

	if ( '' !== $isbn ) {
		$result['isbn'] = $isbn;
	}

	$url = bibliography_builder_csl_field( $csl, 'URL' );

	if ( bibliography_builder_js_truthy( $url ) && ! isset( $result['url'] ) ) {
		$result['url'] = $url;
	}

	return $result;
}

/**
 * `escapeForScriptContext()`.
 *
 * @param string $json Serialized JSON.
 * @return string
 */
function bibliography_builder_escape_for_script( $json ) {
	return strtr(
		$json,
		array(
			'<'        => '\\u003c',
			"\u{2028}" => '\\u2028',
			"\u{2029}" => '\\u2029',
		)
	);
}

/**
 * `getPageBounds()` from coins.js.
 *
 * @param mixed $page CSL page value.
 * @return array{0: string|null, 1: string|null}|null
 */
function bibliography_builder_save_page_bounds( $page ) {
	if ( ! bibliography_builder_js_truthy( $page ) ) {
		return null;
	}

	$pieces = array_values(
		array_filter(
			(array) preg_split( BIBLIOGRAPHY_BUILDER_PAGE_RANGE_SEPARATOR, bibliography_builder_js_string( $page ) ),
			'strlen'
		)
	);

	return array(
		isset( $pieces[0] ) ? $pieces[0] : null,
		isset( $pieces[1] ) ? $pieces[1] : null,
	);
}

/**
 * `buildCoins()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_save_build_coins( $csl ) {
	$params = array( 'ctx_ver=Z39.88-2004' );
	$type   = bibliography_builder_csl_field( $csl, 'type' );
	$type   = bibliography_builder_js_truthy( $type ) ? $type : '';
	$add    = static function ( $key, $value ) use ( &$params ) {
		if ( null !== $value && '' !== $value ) {
			$params[] = $key . '='
				. bibliography_builder_encode_uri_component( bibliography_builder_js_string( $value ) );
		}
	};
	$field  = static function ( $name ) use ( $csl ) {
		return bibliography_builder_csl_field( $csl, $name );
	};

	if ( 'book' === $type || 'chapter' === $type ) {
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:book' );

		if ( 'chapter' === $type ) {
			$add( 'rft.btitle', $field( 'container-title' ) );
			$add( 'rft.atitle', $field( 'title' ) );
		} else {
			$add( 'rft.btitle', $field( 'title' ) );
		}

		$add( 'rft.pub', $field( 'publisher' ) );
		$add( 'rft.place', $field( 'publisher-place' ) );
		$add( 'rft.isbn', bibliography_builder_get_primary_identifier( $field( 'ISBN' ) ) );
	} elseif ( 'thesis' === $type ) {
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:dissertation' );
		$add( 'rft.title', $field( 'title' ) );
		$add( 'rft.inst', $field( 'publisher' ) );
		$add( 'rft.degree', $field( 'genre' ) );
	} else {
		$bounds   = bibliography_builder_save_page_bounds( $field( 'page' ) );
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:journal' );
		$add( 'rft.atitle', $field( 'title' ) );
		$add( 'rft.jtitle', $field( 'container-title' ) );
		$add( 'rft.volume', $field( 'volume' ) );
		$add( 'rft.issue', $field( 'issue' ) );
		$add( 'rft.spage', null === $bounds ? null : $bounds[0] );
		$add( 'rft.epage', null === $bounds ? null : $bounds[1] );
	}

	$authors = $field( 'author' );

	if ( is_array( $authors ) && count( $authors ) > 0 ) {
		$first  = array_values( $authors )[0];
		$family = is_array( $first ) && isset( $first['family'] ) && bibliography_builder_js_truthy( $first['family'] )
			? $first['family']
			: null;
		$add( 'rft.aulast', null !== $family ? $family : ( isset( $first['literal'] ) ? $first['literal'] : null ) );
		$add( 'rft.aufirst', is_array( $first ) && isset( $first['given'] ) ? $first['given'] : null );
	}

	$parts = bibliography_builder_csl_first_date_parts( $csl );

	if ( null !== $parts ) {
		$add( 'rft.date', bibliography_builder_join_date_parts( $parts ) );
	}

	$doi = $field( 'DOI' );

	if ( bibliography_builder_js_truthy( $doi ) ) {
		$add( 'rft_id', 'info:doi/' . bibliography_builder_js_string( $doi ) );
	}

	return implode( '&', $params );
}

// ── Cite / Export panel: src/lib/export.js ───────────────────────────────────

/**
 * `slugifyExportName()`.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_save_slugify( $value ) {
	$ws     = BIBLIOGRAPHY_BUILDER_JS_WHITESPACE;
	$string = bibliography_builder_js_truthy( $value ) ? bibliography_builder_js_string( $value ) : '';
	$string = (string) Normalizer::normalize( $string, Normalizer::FORM_KD );
	$string = (string) preg_replace( '/[^A-Za-z0-9_' . $ws . '-]/u', '', $string );
	$string = (string) preg_replace( '/^[' . $ws . ']+|[' . $ws . ']+$/u', '', $string );
	$string = (string) preg_replace( '/[' . $ws . '_]+/u', '-', $string );
	$string = (string) preg_replace( '/-{2,}/', '-', $string );
	$string = (string) preg_replace( '/^-+|-+$/', '', $string );

	return substr( $string, 0, 60 );
}

/**
 * `getCitationExportBasename()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_save_export_basename( $csl ) {
	$key      = bibliography_builder_csl_field( $csl, 'citation-key' );
	$from_key = bibliography_builder_save_slugify( is_string( $key ) ? $key : '' );

	if ( '' !== $from_key ) {
		return $from_key;
	}

	$authors = bibliography_builder_csl_field( $csl, 'author' );
	$first   = is_array( $authors ) && isset( $authors[0] ) ? $authors[0] : array();
	$name    = '';

	foreach ( array( 'family', 'literal', 'given' ) as $part ) {
		$name = '' !== $name ? $name : bibliography_builder_name_part( $first, $part );
	}

	$parts = bibliography_builder_csl_first_date_parts( $csl );
	$year  = null !== $parts && isset( $parts[0] ) && bibliography_builder_js_truthy( $parts[0] )
		? bibliography_builder_js_string( $parts[0] )
		: '';

	$from_author = bibliography_builder_save_slugify( implode( '-', array_filter( array( $name, $year ), 'strlen' ) ) );

	if ( '' !== $from_author ) {
		return $from_author;
	}

	$title = bibliography_builder_csl_field( $csl, 'title' );
	$words = preg_split(
		'/[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+/u',
		bibliography_builder_js_truthy( $title ) ? bibliography_builder_js_string( $title ) : ''
	);

	$from_title = bibliography_builder_save_slugify( implode( ' ', array_slice( (array) $words, 0, 4 ) ) );

	return '' !== $from_title ? $from_title : 'citation';
}

/**
 * `formatRisAuthor()`.
 *
 * @param mixed $name Name object.
 * @return string
 */
function bibliography_builder_save_ris_name( $name ) {
	$literal = bibliography_builder_name_part( $name, 'literal' );
	$family  = bibliography_builder_name_part( $name, 'family' );
	$given   = bibliography_builder_name_part( $name, 'given' );

	if ( '' !== $literal ) {
		return $literal;
	}

	if ( '' !== $family && '' !== $given ) {
		return $family . ', ' . $given;
	}

	return '' !== $family ? $family : $given;
}

/**
 * `cslToRisEntry()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_save_ris_entry( $csl ) {
	$types = array(
		'article-journal'   => 'JOUR',
		'article-magazine'  => 'MGZN',
		'article-newspaper' => 'NEWS',
		'book'              => 'BOOK',
		'chapter'           => 'CHAP',
		'collection'        => 'BOOK',
		'thesis'            => 'THES',
		'report'            => 'RPRT',
		'paper-conference'  => 'CONF',
		'webpage'           => 'ELEC',
		'review'            => 'GEN',
		'review-book'       => 'GEN',
	);
	$lines = array();
	$add   = static function ( $tag, $value ) use ( &$lines ) {
		if ( null !== $value && '' !== $value ) {
			$lines[] = $tag . '  - ' . bibliography_builder_js_string( $value );
		}
	};
	$field = static function ( $name ) use ( $csl ) {
		return bibliography_builder_csl_field( $csl, $name );
	};

	// splitPageRange( page = '' ): the default applies only to undefined.
	$page  = array_key_exists( 'page', $csl ) ? bibliography_builder_js_string( $csl['page'] ) : '';
	$range = preg_split( BIBLIOGRAPHY_BUILDER_PAGE_RANGE_SEPARATOR, $page );
	$type  = $field( 'type' );
	$parts = bibliography_builder_csl_first_date_parts( $csl );
	$year  = null !== $parts && isset( $parts[0] ) ? $parts[0] : null;

	$add( 'TY', is_string( $type ) && isset( $types[ $type ] ) ? $types[ $type ] : 'GEN' );

	foreach ( array(
		'author' => 'AU',
		'editor' => 'A2',
	) as $name_field => $tag ) {
		$names = $field( $name_field );

		foreach ( is_array( $names ) ? $names : array() as $name ) {
			$add( $tag, bibliography_builder_save_ris_name( $name ) );
		}
	}

	$add( 'TI', $field( 'title' ) );
	$add( 'book' === $type ? 'BT' : 'T2', $field( 'container-title' ) );
	$add( 'PB', $field( 'publisher' ) );
	$add( 'PY', $year );
	$add( 'DA', $year );
	$add( 'VL', $field( 'volume' ) );
	$add( 'IS', $field( 'issue' ) );
	$add( 'SP', isset( $range[0] ) ? $range[0] : '' );
	$add( 'EP', isset( $range[1] ) ? $range[1] : '' );
	$add( 'DO', $field( 'DOI' ) );
	$add( 'UR', $field( 'URL' ) );
	$add( 'LA', $field( 'language' ) );

	$isbn = bibliography_builder_get_primary_identifier( $field( 'ISBN' ) );
	$add( 'SN', '' !== $isbn ? $isbn : bibliography_builder_get_primary_identifier( $field( 'ISSN' ) ) );

	$lines[] = 'ER  - ';

	return implode( "\n", $lines );
}

/**
 * One cite-export download link.
 *
 * @param string $mime     Data URI media type.
 * @param string $content  File content.
 * @param string $filename Download filename.
 * @param string $label    Link text.
 * @return string
 */
function bibliography_builder_save_export_link( $mime, $content, $filename, $label ) {
	return '<li><a' . bibliography_builder_save_attributes(
		array(
			'href'                      => 'data:' . $mime . ';charset=utf-8,'
				. bibliography_builder_encode_uri_component( $content ),
			'download'                  => $filename,
			'data-cite-export-filename' => $filename,
			'rel'                       => 'noopener',
		)
	) . '>' . bibliography_builder_escape_save_text( $label ) . '</a></li>';
}

/**
 * The per-entry Cite / Export panel.
 *
 * @param array $citation Citation record.
 * @return string
 */
function bibliography_builder_save_cite_export( $citation ) {
	$csl       = bibliography_builder_citation_csl( $citation );
	$base      = bibliography_builder_save_export_basename( $csl );
	$cite_text = '';

	foreach ( array( 'displayOverride', 'formattedText' ) as $field ) {
		$value = isset( $citation[ $field ] ) ? $citation[ $field ] : null;

		if ( '' === $cite_text && bibliography_builder_js_truthy( $value ) ) {
			$cite_text = bibliography_builder_js_string( $citation[ $field ] );
		}
	}

	$links  = bibliography_builder_save_export_link(
		'application/x-research-info-systems',
		bibliography_builder_save_ris_entry( $csl ),
		$base . '.ris',
		__( 'RIS', 'borges-bibliography-builder' )
	);
	$links .= bibliography_builder_save_export_link(
		'application/vnd.citationstyles.csl+json',
		bibliography_builder_json_stringify( $csl, 2 ) . "\n",
		$base . '.csl.json',
		__( 'CSL-JSON', 'borges-bibliography-builder' )
	);

	foreach ( array(
		'exportBibtex'   => array( '.bib', 'BibTeX' ),
		'exportBiblatex' => array( '.biblatex.bib', 'BibLaTeX' ),
	) as $field => $meta ) {
		if ( isset( $citation[ $field ] ) && bibliography_builder_js_truthy( $citation[ $field ] ) ) {
			$links .= bibliography_builder_save_export_link(
				'text/x-bibtex',
				bibliography_builder_js_string( $citation[ $field ] ),
				$base . $meta[0],
				'BibTeX' === $meta[1]
					? __( 'BibTeX', 'borges-bibliography-builder' )
					: __( 'BibLaTeX', 'borges-bibliography-builder' )
			);
		}
	}

	return '<details class="bibliography-builder-cite-export">'
		. '<summary class="bibliography-builder-cite-export-toggle">'
		. bibliography_builder_escape_save_text( __( 'Cite / Export', 'borges-bibliography-builder' ) )
		. '</summary>'
		. '<div class="bibliography-builder-cite-export-panel">'
		. '<button' . bibliography_builder_save_attributes(
			array(
				'type'              => 'button',
				'class'             => 'bibliography-builder-cite-copy',
				'aria-live'         => 'polite',
				'data-cite-text'    => $cite_text,
				'data-copied-label' => __( 'Copied', 'borges-bibliography-builder' ),
			)
		) . '>'
		. bibliography_builder_escape_save_text( __( 'Copy citation', 'borges-bibliography-builder' ) )
		. '</button>'
		. '<ul class="bibliography-builder-export-links">' . $links . '</ul>'
		. '</div></details>';
}

// ── Block wrapper: useBlockProps.save() with the block's supports ───────────

/**
 * `kebabCase()` as used for preset font-size class names.
 *
 * @param string $value Slug.
 * @return string
 */
function bibliography_builder_save_kebab_case( $value ) {
	$value = (string) preg_replace( '/([a-z])([A-Z])/', '$1-$2', (string) $value );
	$value = (string) preg_replace( '/([A-Za-z])([0-9])/', '$1-$2', $value );
	$value = (string) preg_replace( '/([0-9])([A-Za-z])/', '$1-$2', $value );

	return strtolower( trim( (string) preg_replace( '/[^A-Za-z0-9]+/', '-', $value ), '-' ) );
}

/**
 * A style-engine value: `var:preset|spacing|40` becomes a CSS custom property.
 *
 * @param mixed $value Style value.
 * @return string|null
 */
function bibliography_builder_save_style_value( $value ) {
	if ( ! is_string( $value ) || '' === $value ) {
		return null;
	}

	if ( 0 === strpos( $value, 'var:' ) ) {
		return 'var(--wp--' . str_replace( '|', '--', substr( $value, 4 ) ) . ')';
	}

	return $value;
}

/**
 * Inline style for the supported spacing and typography values, in the order
 * the style engine emits them.
 *
 * @param mixed $style Block `style` attribute.
 * @return string
 */
function bibliography_builder_save_inline_style( $style ) {
	if ( ! is_array( $style ) ) {
		return '';
	}

	$rules = array();

	foreach ( array( 'margin', 'padding' ) as $property ) {
		$value = isset( $style['spacing'][ $property ] ) ? $style['spacing'][ $property ] : null;

		if ( is_string( $value ) ) {
			$css = bibliography_builder_save_style_value( $value );

			if ( null !== $css ) {
				$rules[] = $property . ':' . $css;
			}

			continue;
		}

		if ( is_array( $value ) ) {
			foreach ( array( 'top', 'right', 'bottom', 'left' ) as $side ) {
				$css = isset( $value[ $side ] ) ? bibliography_builder_save_style_value( $value[ $side ] ) : null;

				if ( null !== $css ) {
					$rules[] = $property . '-' . $side . ':' . $css;
				}
			}
		}
	}

	$font_size = isset( $style['typography']['fontSize'] )
		? bibliography_builder_save_style_value( $style['typography']['fontSize'] )
		: null;

	if ( null !== $font_size ) {
		$rules[] = 'font-size:' . $font_size;
	}

	return implode( ';', $rules );
}

/**
 * The `<section>` attributes `useBlockProps.save()` produces.
 *
 * @param array $attrs Block attributes.
 * @return array
 */
function bibliography_builder_save_block_props( $attrs ) {
	$classes = array( 'wp-block-bibliography-builder-bibliography' );

	if ( isset( $attrs['className'] ) && is_string( $attrs['className'] ) && '' !== $attrs['className'] ) {
		$classes[] = $attrs['className'];
	}

	if ( isset( $attrs['fontSize'] ) && is_string( $attrs['fontSize'] ) && '' !== $attrs['fontSize'] ) {
		$classes[] = 'has-' . bibliography_builder_save_kebab_case( $attrs['fontSize'] ) . '-font-size';
	}

	$style = bibliography_builder_save_inline_style( isset( $attrs['style'] ) ? $attrs['style'] : null );
	$props = array(
		'id' => isset( $attrs['anchor'] ) && is_string( $attrs['anchor'] ) && '' !== $attrs['anchor']
			? $attrs['anchor']
			: null,
	);

	// Attribute order follows the order the supports hooks first set each
	// prop: the custom-class-name hook runs before the style hook, while the
	// font-size class and the generated class name are merged in after it.
	if ( count( $classes ) > 1 && isset( $attrs['className'] ) && $classes[1] === $attrs['className'] ) {
		$props['class'] = implode( ' ', $classes );
	}

	$props['style'] = '' !== $style ? $style : null;
	$props['class'] = implode( ' ', $classes );

	return $props;
}

// ── save() ───────────────────────────────────────────────────────────────────

/**
 * One `<li>` entry.
 *
 * @param array $citation     Citation record.
 * @param bool  $output_coins Whether to emit COinS.
 * @param bool  $cite_export  Whether to emit the Cite / Export panel.
 * @return string
 */
function bibliography_builder_save_entry( $citation, $output_coins, $cite_export ) {
	$csl        = bibliography_builder_citation_csl( $citation );
	$link_label = '';

	foreach ( array( 'title', 'container-title' ) as $field ) {
		$value = bibliography_builder_csl_field( $csl, $field );

		if ( '' === $link_label && bibliography_builder_js_truthy( $value ) ) {
			$link_label = bibliography_builder_js_string( $value );
		}
	}

	if ( '' === $link_label ) {
		$link_label = __( 'Link to publication', 'borges-bibliography-builder' );
	}

	$text = '';

	foreach ( bibliography_builder_save_display_segments( $citation ) as $segment ) {
		$content = '';

		foreach ( bibliography_builder_save_link_parts( $segment['text'], $link_label ) as $part ) {
			$content .= $part['link']
				? '<a' . bibliography_builder_save_attributes(
					array(
						'href'       => $part['href'],
						'rel'        => 'nofollow noopener noreferrer',
						'aria-label' => $part['label'] . ' — ' . $part['href'],
					)
				) . '>' . bibliography_builder_escape_save_text( $part['text'] ) . '</a>'
				: bibliography_builder_escape_save_text( $part['text'] );
		}

		$text .= $segment['italic'] ? '<i>' . $content . '</i>' : $content;
	}

	$id       = array_key_exists( 'id', $citation ) ? bibliography_builder_js_string( $citation['id'] ) : 'undefined';
	$language = bibliography_builder_csl_field( $csl, 'language' );
	$html     = '<li' . bibliography_builder_save_attributes(
		array(
			'id'   => 'ref-' . $id,
			'lang' => bibliography_builder_js_truthy( $language ) ? bibliography_builder_js_string( $language ) : null,
		)
	) . '><cite class="bibliography-builder-entry-text">' . $text . '</cite>';

	if ( $output_coins ) {
		$html .= '<span' . bibliography_builder_save_attributes(
			array(
				'class'       => 'Z3988',
				'aria-hidden' => 'true',
				'title'       => bibliography_builder_save_build_coins( $csl ),
			)
		) . '></span>';
	}

	if ( $cite_export ) {
		$html .= bibliography_builder_save_cite_export( $citation );
	}

	return $html . '</li>';
}

/**
 * Render the block's saved inner HTML from its attributes, as the current
 * `save()` would. Returns an empty string when there are no citations, where
 * `save()` returns null.
 *
 * Callers must check bibliography_builder_can_render_save_markup() first.
 *
 * @param array $attrs Block attributes as parse_blocks() returns them.
 * @return string
 */
function bibliography_builder_render_save_markup( $attrs ) {
	$attrs     = is_array( $attrs ) ? $attrs : array();
	$citations = isset( $attrs['citations'] ) && is_array( $attrs['citations'] )
		? array_values( $attrs['citations'] )
		: array();

	if ( array() === $citations ) {
		return '';
	}

	$flag = static function ( $name, $fallback ) use ( $attrs ) {
		return array_key_exists( $name, $attrs ) ? bibliography_builder_js_truthy( $attrs[ $name ] ) : $fallback;
	};

	$style_key = isset( $attrs['citationStyle'] ) ? $attrs['citationStyle'] : 'chicago-notes-bibliography';
	$style     = bibliography_builder_get_save_style_definition( $style_key );
	$heading   = isset( $attrs['headingText'] ) && bibliography_builder_js_truthy( $attrs['headingText'] )
		? bibliography_builder_js_string( $attrs['headingText'] )
		: '';
	$sorted    = bibliography_builder_sort_citations_for_save( $citations, $style_key );
	$csl_array = array_map( 'bibliography_builder_citation_csl', $sorted );
	$list_tag  = $style['listType'];
	$style_css = is_string( $style_key ) && '' !== $style_key ? $style_key : 'undefined';

	$html = '<section' . bibliography_builder_save_attributes(
		array_merge(
			bibliography_builder_save_block_props( $attrs ),
			array(
				'role'       => 'doc-bibliography',
				'aria-label' => '' !== $heading ? $heading : 'Bibliography',
			)
		)
	) . '>';

	if ( '' !== $heading ) {
		$html .= '<p class="bibliography-builder-heading">'
			. bibliography_builder_escape_save_text( $heading )
			. '</p>';
	}

	$html .= '<' . $list_tag . ' class="' . bibliography_builder_escape_save_attribute(
		'bibliography-builder-list bibliography-builder-list-' . ( 'ol' === $list_tag ? 'numeric' : 'unordered' )
		. ' bibliography-builder-list-' . $style_css
	) . '">';

	foreach ( $sorted as $citation ) {
		$html .= bibliography_builder_save_entry(
			is_array( $citation ) ? $citation : array(),
			$flag( 'outputCoins', false ),
			$flag( 'outputCiteExport', false )
		);
	}

	$html .= '</' . $list_tag . '>';

	if ( $flag( 'outputJsonLd', true ) ) {
		$html .= '<script type="application/ld+json">'
			. bibliography_builder_escape_for_script(
				bibliography_builder_json_stringify(
					array_map( 'bibliography_builder_save_csl_to_json_ld', $csl_array )
				)
			)
			. '</script>';
	}

	if ( $flag( 'outputCslJson', false ) ) {
		$html .= '<script type="application/vnd.citationstyles.csl+json">'
			. bibliography_builder_escape_for_script( bibliography_builder_json_stringify( $csl_array ) )
			. '</script>';
	}

	return $html . '</section>';
}
