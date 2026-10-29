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
 * `sentenceCase` is the style's optional sentence-case settings, or null;
 * see includes/sentence-case.php.
 *
 * @return array<string, array{
 *     template: string,
 *     locale: string,
 *     family: string,
 *     yearSuffix: bool,
 *     sentenceCase: array|null
 * }>
 */
function bibliography_builder_get_formatter_style_definitions() {
	$definitions = array();

	foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
		$definitions[ $key ] = array(
			'template'     => (string) $style['cslTemplate'],
			'locale'       => (string) $style['locale'],
			'family'       => (string) $style['family'],
			'yearSuffix'   => (bool) $style['yearSuffix'],
			'sentenceCase' => isset( $style['sentenceCase'] ) && is_array( $style['sentenceCase'] )
				? $style['sentenceCase']
				: null,
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
 * @param mixed              $data  Data to encode.
 * @param int                $flags Optional encoding flags.
 * @param int<1, 2147483647> $depth Optional maximum depth.
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
 * MD5 of a JSON-encoded cache payload, substituting invalid UTF-8 rather than
 * failing on it.
 *
 * @param array $payload Cache key payload.
 * @return string
 */
function bibliography_builder_hash_cache_payload( $payload ) {
	$encoded = bibliography_builder_json_encode( $payload );

	if ( ! is_string( $encoded ) ) {
		$encoded = bibliography_builder_json_encode(
			$payload,
			JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
		);
	}

	return md5( is_string( $encoded ) ? $encoded : '' );
}

/**
 * The parts of a formatter cache key that identify the style.
 *
 * @param string $style_key Requested style key.
 * @param array  $style     Formatter style definition.
 * @return array
 */
function bibliography_builder_get_formatter_style_cache_payload( $style_key, $style ) {
	$template = isset( $style['template'] ) ? (string) $style['template'] : '';

	return array(
		'style'      => sanitize_key( $style_key ),
		'template'   => $template,
		// The bundled styles change between releases (new manual editions), so
		// key on their contents: a cached entry from an older style is never
		// served after an upgrade.
		'style_hash' => bibliography_builder_get_formatter_style_hash( $template ),
		'locale'     => isset( $style['locale'] ) ? (string) $style['locale'] : '',
	)
	// Sentence case changes the text too, so a change to its settings
	// (styles.json `sentenceCase`) or its rules never serves an entry cased
	// the old way.
	+ ( empty( $style['sentenceCase'] ) ? array() : array(
		'sentence_case' => array( 'version' => BIBLIOGRAPHY_BUILDER_SENTENCE_CASE_VERSION ) + $style['sentenceCase'],
	) );
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
	$payload = array( 'version' => 6 )
		+ bibliography_builder_get_formatter_style_cache_payload( $style_key, $style )
		+ array( 'csl_items' => bibliography_builder_sort_for_cache_key( array_values( $csl_items ) ) );

	return 'format_' . bibliography_builder_hash_cache_payload( $payload );
}

/**
 * Cache key for one style's map of formatted entries.
 *
 * Each entry renders on its own (see bibliography_builder_format_csl_items()),
 * so its text depends only on its own CSL item and the style. The map lets a
 * request whose list changed by one entry render only that entry.
 *
 * @param string $style_key Requested style key.
 * @param array  $style     Formatter style definition.
 * @return string
 */
function bibliography_builder_get_formatter_entry_map_key( $style_key, $style ) {
	$payload = array( 'version' => 4 ) + bibliography_builder_get_formatter_style_cache_payload( $style_key, $style );

	return 'entries_' . bibliography_builder_hash_cache_payload( $payload );
}

/**
 * Key for one CSL item in a style's entry map.
 *
 * @param mixed $csl_item CSL-JSON item.
 * @return string
 */
function bibliography_builder_get_formatter_entry_hash( $csl_item ) {
	return bibliography_builder_hash_cache_payload(
		array( 'item' => bibliography_builder_sort_for_cache_key( $csl_item ) )
	);
}

/**
 * Store newly formatted entries in a style's entry map.
 *
 * The entries this request used move to the end, and the map keeps only the
 * last BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT, so the least recently
 * used entries drop out first.
 *
 * @param array<string, string> $map     Entry map read from the cache.
 * @param array<string, string> $entries Formatted text by entry hash, in list order.
 * @return array<string, string>
 */
function bibliography_builder_update_formatter_entry_map( $map, $entries ) {
	foreach ( $entries as $hash => $text ) {
		unset( $map[ $hash ] );
		$map[ $hash ] = $text;
	}

	if ( count( $map ) > BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT ) {
		$map = array_slice( $map, -BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT, null, true );
	}

	return $map;
}

/**
 * Sanitize formatted citation text down to inert plain text.
 *
 * @param mixed $text Text extracted from citeproc output.
 * @return string
 */
function bibliography_builder_sanitize_formatted_text( $text ) {
	$decoded  = html_entity_decode( (string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$stripped = bibliography_builder_strip_bounded( $decoded );

	return trim( (string) preg_replace( '/\s+/u', ' ', $stripped ) );
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
		$text = (string) preg_replace( '/^(?:\[\d+\]|\d+\.)\s+/u', '', $text );
	}

	if ( isset( $style['template'] ) && 'abnt' === $style['template'] ) {
		$text = (string) preg_replace( '/\bv\.\s+vol\.\s+/u', 'v. ', $text );
		$text = (string) preg_replace( '/\bn\.\s+no\.\s+/u', 'n. ', $text );
		$text = (string) preg_replace( '/\bp\.\s+p{1,2}\.\s+/u', 'p. ', $text );
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
	$text = (string) preg_replace( '/([?!])([”’]?)\./u', '$1$2', $text );

	// citeproc-php initializes only capitalized parts of a hyphenated given
	// name, so "Ji-woo" comes out "J.- woo". Initialize the second part too.
	$text = (string) preg_replace_callback(
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
 * - A repository ID whose number repeats its publisher ("arXiv:1706.03762"
 *   with publisher "arXiv") loses the prefix, which APA and IEEE print
 *   beside the publisher.
 * - Years before 1000, BCE years among them: citeproc-php renders none of
 *   them, so such a date becomes a year-only literal. See
 *   bibliography_builder_early_date_literal().
 *
 * @param array  $item                    CSL-JSON item.
 * @param bool   $demote_particle_display Whether the style demotes particles in display.
 * @param string $locale                  The style's locale, for the era labels.
 * @return array
 */
function bibliography_builder_prepare_csl_for_formatter( $item, $demote_particle_display = false, $locale = 'en-US' ) {
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

	// arXiv and other repositories store an ID with its repository prefix
	// ("arXiv:1706.03762"), as Zotero does. Styles that print
	// "publisher:number" (APA 7, IEEE) would repeat it.
	if (
		isset( $item['number'], $item['publisher'] )
		&& is_string( $item['number'] ) && is_string( $item['publisher'] )
		&& '' !== trim( $item['publisher'] )
		&& 0 === stripos( $item['number'], trim( $item['publisher'] ) . ':' )
	) {
		$item['number'] = ltrim( substr( $item['number'], strlen( trim( $item['publisher'] ) ) + 1 ) );
	}

	if ( empty( $item['page-first'] ) && isset( $item['page'] ) && is_scalar( $item['page'] ) ) {
		$pages = preg_split( '/[-\x{2013}\x{2014},&]/u', (string) $item['page'] );
		$first = false === $pages ? '' : trim( $pages[0] );

		if ( '' !== $first ) {
			$item['page-first'] = $first;
		}
	}

	foreach ( bibliography_builder_csl_date_variables() as $variable ) {
		$literal = isset( $item[ $variable ] )
			? bibliography_builder_early_date_literal( $item[ $variable ], $locale )
			: null;

		if ( null !== $literal ) {
			$item[ $variable ] = array( 'literal' => $literal );
		}
	}

	return $item;
}

/**
 * The CSL date variables.
 *
 * @return string[]
 */
function bibliography_builder_csl_date_variables() {
	return array( 'accessed', 'available-date', 'event-date', 'issued', 'original-date', 'submitted' );
}

/**
 * A year-only literal for a CSL date citeproc-php cannot render, else null.
 *
 * The citeproc-php 2.7 library puts an empty date before any date whose year
 * is below 1000 (`Date::createDateTime()`), and then renders that empty date
 * in its place: a lone year of 731 or -334 prints nothing, and a range prints
 * only a dash and its end. Its BC handling (`DatePart::renderYear()`) is never
 * reached. A literal date is printed as given, inside the style's affixes, so
 * the year survives in every style. Month and day are left out: a style that
 * cites a full date (MLA) would place them around the year in its own order,
 * which a literal cannot follow, and early works are cited by year.
 *
 * CSL-JSON writes a BC year as a negative number, so -334 reads "334 BCE"
 * ("334 AEC", antes da Era Comum, in Portuguese). A CE year prints bare
 * unless it ends a range that starts BCE. A range reads "100–44 BCE" when
 * both ends are BCE, else "4 BCE–30 CE".
 *
 * @param mixed  $date   CSL date value, as sanitized.
 * @param string $locale Style locale, such as en-US or pt-BR.
 * @return string|null
 */
function bibliography_builder_early_date_literal( $date, $locale ) {
	if ( ! is_array( $date ) || empty( $date['date-parts'] ) || ! is_array( $date['date-parts'] ) ) {
		return null;
	}

	$years = array();

	foreach ( array_slice( $date['date-parts'], 0, 2 ) as $parts ) {
		// Only `issued` and `accessed` are sanitized to integers; other date
		// variables keep the strings an exporter wrote ("-334").
		$year = is_array( $parts ) && isset( $parts[0] )
			? bibliography_builder_normalize_csl_date_part( $parts[0] )
			: null;

		if ( null !== $year ) {
			$years[] = $year;
		}
	}

	if ( empty( $years ) || min( $years ) >= 1000 ) {
		return null;
	}

	$is_pt = 0 === strpos( strtolower( $locale ), 'pt' );
	$bce   = $is_pt ? 'AEC' : 'BCE';
	$ce    = $is_pt ? 'EC' : 'CE';

	if ( 2 === count( $years ) && $years[0] === $years[1] ) {
		$years = array( $years[0] );
	}

	if ( 2 === count( $years ) && $years[0] < 0 && $years[1] < 0 ) {
		return abs( $years[0] ) . "\u{2013}" . abs( $years[1] ) . ' ' . $bce;
	}

	// A CE year is labeled only beside a BCE one, as the end of a range.
	$mixed  = min( $years ) < 0;
	$labels = array();

	foreach ( $years as $year ) {
		if ( $year < 0 ) {
			$labels[] = abs( $year ) . ' ' . $bce;
		} else {
			$labels[] = $mixed ? $year . ' ' . $ce : (string) $year;
		}
	}

	return implode( "\u{2013}", $labels );
}

/**
 * The year-suffix letters for a position in a group: a–z, then aa, ab, ….
 *
 * @param int $position Zero-based position in the same-author, same-year group.
 * @return string
 */
function bibliography_builder_year_suffix_letters( $position ) {
	$letters = '';
	$number  = $position + 1;

	while ( $number > 0 ) {
		--$number;
		$letters = chr( 97 + ( $number % 26 ) ) . $letters;
		$number  = intdiv( $number, 26 );
	}

	return $letters;
}

/**
 * The key that groups works for year suffixes: every primary contributor
 * (author, else editor, as the sorter compares them) and the year.
 *
 * @param mixed $csl    CSL-JSON item.
 * @param bool  $demote Whether the style demotes name particles for sorting.
 * @return string|null Null for an undated work or one with no contributor.
 */
function bibliography_builder_year_suffix_group_key( $csl, $demote ) {
	$csl          = is_array( $csl ) ? $csl : array();
	$contributors = bibliography_builder_sort_primary_contributors( $csl );
	$year         = bibliography_builder_sort_year( $csl );

	if ( null === $contributors || ! is_finite( $year ) ) {
		return null;
	}

	$names = array_map(
		static fn( $contributor ): string => bibliography_builder_sort_contributor_key( $contributor, $demote ),
		$contributors
	);

	return implode( "\n", $names ) . "\n" . (string) $year;
}

/**
 * Give works by the same authors in the same year their year suffixes.
 *
 * Author-date styles tell same-author, same-year works apart with a letter
 * after the year: "Jones, T. (2020a)", "Jones, T. (2020b)". citeproc-php
 * never assigns these, and each entry renders on its own anyway (see
 * bibliography_builder_render_csl_items()), so the formatter sets CSL's
 * `year-suffix` variable itself and the styles print it after the year.
 *
 * Letters follow the order save() lists the entries in: the items are sorted
 * with the same comparator as bibliography_builder_sort_citations_for_save(),
 * which the coordination fixtures hold equal to the JS sorter, so the request
 * order does not matter and "a" always comes first on the page. Works match
 * when every primary contributor matches (author, else editor, compared as
 * the sorter compares them) and the year matches. Undated works and works
 * with no contributor get no suffix. A `year-suffix` sent with an item is
 * always replaced, so a stale letter cannot survive a reformat.
 *
 * @param array<int, mixed> $csl_items CSL-JSON items, in request order.
 * @param string            $style_key Citation style key.
 * @return array<int, mixed> The items in request order, with `year-suffix` set where it applies.
 */
function bibliography_builder_assign_year_suffixes( $csl_items, $style_key ) {
	$items = array_values( $csl_items );

	foreach ( $items as $index => $item ) {
		if ( is_array( $item ) ) {
			unset( $items[ $index ]['year-suffix'] );
		}
	}

	$records = array();

	foreach ( $items as $index => $item ) {
		$records[] = array(
			'csl'   => is_array( $item ) ? $item : array(),
			'index' => $index,
		);
	}

	$style  = bibliography_builder_get_save_style_definition( $style_key );
	$demote = bibliography_builder_demotes_particle_for_sort( $style['demoteNonDroppingParticle'] );
	$groups = array();

	foreach ( bibliography_builder_sort_citations_for_save( $records, $style_key ) as $record ) {
		$key = bibliography_builder_year_suffix_group_key( $record['csl'], $demote );

		if ( null !== $key ) {
			$groups[ $key ][] = $record['index'];
		}
	}

	foreach ( $groups as $indexes ) {
		if ( count( $indexes ) < 2 ) {
			continue;
		}

		foreach ( $indexes as $position => $index ) {
			$items[ $index ]['year-suffix'] = bibliography_builder_year_suffix_letters( $position );
		}
	}

	return $items;
}

/**
 * Format CSL-JSON items as plain-text bibliography entries.
 *
 * @param array  $csl_items CSL-JSON objects.
 * @param string $style_key Citation style key.
 * @return array|WP_Error Array of formatted text strings in input order.
 */
function bibliography_builder_format_csl_items( $csl_items, $style_key ) {
	$style = bibliography_builder_get_formatter_style_definition( sanitize_key( $style_key ) );

	if ( $style['yearSuffix'] ) {
		$csl_items = bibliography_builder_assign_year_suffixes( $csl_items, sanitize_key( $style_key ) );
	}

	$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style );
	$cached    = bibliography_builder_cache_get( $cache_key, 'bibliography_builder_formatter' );

	if ( $cached['hit'] && is_array( $cached['value'] ) ) {
		return $cached['value'];
	}

	// Entries already formatted in this style, from this or another list.
	$map_key    = bibliography_builder_get_formatter_entry_map_key( $style_key, $style );
	$map_cached = bibliography_builder_cache_get( $map_key, 'bibliography_builder_formatter' );
	$entry_map  = $map_cached['hit'] && is_array( $map_cached['value'] ) ? $map_cached['value'] : array();
	$hashes     = array();
	$formatted  = array();
	$missing    = array();

	foreach ( array_values( $csl_items ) as $index => $item ) {
		$hashes[ $index ] = bibliography_builder_get_formatter_entry_hash( $item );

		if ( isset( $entry_map[ $hashes[ $index ] ] ) && is_string( $entry_map[ $hashes[ $index ] ] ) ) {
			$formatted[ $index ] = $entry_map[ $hashes[ $index ] ];
		} else {
			$missing[ $index ] = $item;
		}
	}

	if ( array() !== $missing ) {
		$rendered = bibliography_builder_render_csl_items( $missing, $style );

		if ( is_wp_error( $rendered ) ) {
			return $rendered;
		}

		$formatted += $rendered;
		$entries    = array();

		ksort( $formatted );

		foreach ( $hashes as $index => $hash ) {
			$entries[ $hash ] = $formatted[ $index ];
		}

		bibliography_builder_cache_set(
			$map_key,
			bibliography_builder_update_formatter_entry_map( $entry_map, $entries ),
			'bibliography_builder_formatter',
			BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
		);
	}

	$formatted = array_values( $formatted );

	bibliography_builder_cache_set(
		$cache_key,
		$formatted,
		'bibliography_builder_formatter',
		BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
	);

	return $formatted;
}

/**
 * Render CSL-JSON items with citeproc-php, one entry at a time.
 *
 * @param array<int, mixed> $csl_items CSL-JSON objects, keyed by their index in the request.
 * @param array             $style     Formatter style definition.
 * @return array<int, string>|WP_Error Formatted text keyed like $csl_items.
 */
function bibliography_builder_render_csl_items( $csl_items, $style ) {
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
	// citeproc-php ignores `strip-periods` on <text>, so a style that asks for
	// it on the journal abbreviation (Vancouver: NLM's "Phys Rev Lett") gets
	// the periods removed here.
	$strip_short = 1 === preg_match( '/variable="container-title" form="short" strip-periods="true"/', $style_xml );

	foreach ( $csl_items as $index => $item ) {
		$item_array = bibliography_builder_prepare_csl_for_formatter(
			is_array( $item ) ? $item : array(),
			$demote_particle,
			isset( $style['locale'] ) ? (string) $style['locale'] : 'en-US'
		);
		// Titles the style prints in sentence case (APA, Vancouver, IEEE).
		$item_array = bibliography_builder_sentence_case_item(
			$item_array,
			isset( $style['sentenceCase'] ) ? $style['sentenceCase'] : null
		);
		if ( $strip_short && isset( $item_array['container-title-short'] )
			&& is_string( $item_array['container-title-short'] ) ) {
			$item_array['container-title-short'] = str_replace( '.', '', $item_array['container-title-short'] );
		}

		$item_array['id']         = 'bibliography-builder-format-' . $index;
		$prepared_items[ $index ] = $item_array;
	}

	$encoded_items = bibliography_builder_json_encode( array_values( $prepared_items ) );

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
			'csl-entry' =>
				/**
				 * Wrap a rendered entry in a span carrying its CSL id.
				 *
				 * @param object $csl_item      Decoded CSL item.
				 * @param mixed  $rendered_text Entry text rendered by citeproc.
				 * @return string
				 */
				static function ( $csl_item, $rendered_text ): string {
					$id = isset( $csl_item->id )
					? (string) preg_replace( '/[^A-Za-z0-9_.:-]/', '', (string) $csl_item->id )
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
		require_once __DIR__ . '/class-bibliography-builder-reusable-citeproc.php';

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
		$id                  = $item['id'];
		$fallback_text       = isset( $item['title'] ) && is_string( $item['title'] ) ? $item['title'] : '';
		$formatted[ $index ] = isset( $entries_by_id[ $id ] )
			? $entries_by_id[ $id ]
			: bibliography_builder_sanitize_formatted_text( $fallback_text );
	}

	return $formatted;
}
