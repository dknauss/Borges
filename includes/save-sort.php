<?php
/**
 * Sorting for the save() port: the style definitions the markup depends on,
 * CSL field helpers, name particles, and the comparators, mirroring
 * `src/lib/sorter.js`, `src/lib/name-particles.js`, and `src/lib/csl-utils.js`.
 *
 * Moved unchanged from save-markup.php (refactor memo, Phase E). The parity
 * fixtures in `tests/fixtures/save-parity/` pin it to the JS output.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Front-end style definitions the save markup depends on.
 *
 * The `listType`, `family`, `locale`, and `demoteNonDroppingParticle` fields
 * of `styles.json`, which `STYLE_DEFINITIONS` in
 * `src/lib/formatting/style-registry.js` is built from.
 *
 * @param mixed $style_key Style key.
 * @return array{key: string, listType: string, family: string, locale: string, demoteNonDroppingParticle: string}
 */
function bibliography_builder_get_save_style_definition( $style_key ) {
	$styles = bibliography_builder_get_style_data()['styles'];
	$key    = is_string( $style_key ) && isset( $styles[ $style_key ] )
		? $style_key
		: bibliography_builder_default_style_key();

	return array(
		'key'                       => $key,
		'listType'                  => (string) $styles[ $key ]['listType'],
		'family'                    => (string) $styles[ $key ]['family'],
		'locale'                    => (string) $styles[ $key ]['locale'],
		'demoteNonDroppingParticle' => (string) $styles[ $key ]['demoteNonDroppingParticle'],
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
 * @param mixed  $csl   CSL-JSON item.
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
 * `getLeadingArticlesPattern()`: the leading articles a style's titles sort
 * without. English ones always, plus those of the locale's language from
 * `leadingArticles` in `styles.json`, per ABNT NBR 6033:1989 §3.4.
 *
 * @param string $locale Style locale, such as pt-BR.
 * @return string[] Lowercase articles.
 */
function bibliography_builder_sort_leading_articles( $locale ) {
	$articles = bibliography_builder_get_style_data()['leadingArticles'];
	$language = strtolower( explode( '-', $locale )[0] );

	return array_values( array_unique( array_merge( $articles['en'] ?? array(), $articles[ $language ] ?? array() ) ) );
}

/**
 * `stripArticles()`.
 *
 * @param mixed    $title    Title.
 * @param string[] $articles Leading articles; English ones when omitted.
 * @return string
 */
function bibliography_builder_sort_strip_articles( $title, $articles = array( 'a', 'an', 'the' ) ) {
	$title   = bibliography_builder_js_truthy( $title ) ? bibliography_builder_js_string( $title ) : '';
	$pattern = implode( '|', array_map( 'preg_quote', $articles ) );

	return (string) preg_replace( '/^(' . $pattern . ')[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+/iu', '', $title );
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
 * @param mixed  $name Name object.
 * @param string $part Part key.
 * @return string
 */
function bibliography_builder_name_part( $name, $part ) {
	return is_array( $name ) && isset( $name[ $part ] ) && bibliography_builder_js_truthy( $name[ $part ] )
		? bibliography_builder_js_string( $name[ $part ] )
		: '';
}

/**
 * JavaScript `trim()` over the whitespace the port recognizes.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_js_trim( $value ) {
	return (string) preg_replace(
		'/^[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+|[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+$/u',
		'',
		$value
	);
}

/**
 * `NAME_PARTICLES` from `src/lib/name-particles.js`: the `nameParticles` list
 * in `styles.json`.
 *
 * @return string[]
 */
function bibliography_builder_name_particles() {
	return bibliography_builder_get_style_data()['nameParticles'];
}

/**
 * `splitNameParticle()`: the lowercase particles that open a family name
 * ("van der Waals", "de la Cruz", "d'Alembert"), or null. A capitalized form
 * is part of the surname ("Van Buren").
 *
 * @param mixed $family Family name.
 * @return array{particle: string, family: string}|null
 */
function bibliography_builder_split_name_particle( $family ) {
	if ( ! is_string( $family ) ) {
		return null;
	}

	if ( 1 === preg_match( "/^([dl]['\x{2019}])(?=\p{Lu})/u", $family, $elided ) ) {
		return array(
			'particle' => $elided[1],
			'family'   => substr( $family, strlen( $elided[1] ) ),
		);
	}

	$words     = array();
	$rest      = bibliography_builder_js_trim( $family );
	$particles = bibliography_builder_name_particles();

	while ( 1 === preg_match( '/^(\S+)\s+(?=\S)/u', $rest, $match ) && in_array( $match[1], $particles, true ) ) {
		$words[] = $match[1];
		$rest    = substr( $rest, strlen( $match[0] ) );
	}

	if ( array() === $words || 1 !== preg_match( '/^\p{Lu}/u', $rest ) ) {
		return null;
	}

	return array(
		'particle' => implode( ' ', $words ),
		'family'   => $rest,
	);
}

/**
 * `getSortFamily()`: the surname proper when the style demotes particles,
 * else the particle and surname together.
 *
 * @param mixed $name   CSL name.
 * @param bool  $demote Whether the style demotes the particle for sorting.
 * @return string
 */
function bibliography_builder_sort_family( $name, $demote ) {
	$family   = is_array( $name ) && isset( $name['family'] ) && is_string( $name['family'] ) ? $name['family'] : '';
	$particle = is_array( $name ) && isset( $name['non-dropping-particle'] ) ? $name['non-dropping-particle'] : '';
	$particle = is_string( $particle ) ? bibliography_builder_js_trim( $particle ) : '';

	if ( '' === $family ) {
		return '';
	}

	if ( '' === $particle ) {
		$split = bibliography_builder_split_name_particle( $family );

		if ( null !== $split ) {
			$particle = $split['particle'];
			$family   = $split['family'];
		}
	}

	if ( '' === $particle || $demote ) {
		return $family;
	}

	return 1 === preg_match( "/['\x{2019}]$/u", $particle ) ? $particle . $family : $particle . ' ' . $family;
}

/**
 * `demotesParticleForSort()`.
 *
 * @param string $demote Style's demote-non-dropping-particle option.
 * @return bool
 */
function bibliography_builder_demotes_particle_for_sort( $demote ) {
	return 'sort-only' === $demote || 'display-and-sort' === $demote;
}

/**
 * `getAuthorSort()` with particle-aware sorting.
 *
 * @param array    $csl      CSL-JSON item.
 * @param bool     $demote   Whether the style demotes particles for sorting.
 * @param string[] $articles Leading articles a title entry sorts without.
 * @return string
 */
function bibliography_builder_sort_author_key( $csl, $demote = false, $articles = array( 'a', 'an', 'the' ) ) {
	$contributors = bibliography_builder_sort_primary_contributors( $csl );

	if ( null === $contributors ) {
		$title = bibliography_builder_csl_field( $csl, 'title' );

		return bibliography_builder_js_truthy( $title )
			? bibliography_builder_js_lower( bibliography_builder_sort_strip_articles( $title, $articles ) )
			: "\u{FFFF}";
	}

	$first = $contributors[0];
	$name  = bibliography_builder_sort_family( $first, $demote );

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
 * @param array    $csl      CSL-JSON item.
 * @param string[] $articles Leading articles to sort without.
 * @return string
 */
function bibliography_builder_sort_title_key( $csl, $articles = array( 'a', 'an', 'the' ) ) {
	return bibliography_builder_js_lower(
		bibliography_builder_sort_strip_articles( bibliography_builder_csl_field( $csl, 'title' ), $articles )
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
 * `normalizeContributorKey()` with particle-aware sorting.
 *
 * @param mixed $contributor Name object.
 * @param bool  $demote      Whether the style demotes particles for sorting.
 * @return string
 */
function bibliography_builder_sort_contributor_key( $contributor, $demote = false ) {
	$family  = bibliography_builder_js_lower( trim( bibliography_builder_sort_family( $contributor, $demote ) ) );
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
 * @param bool     $demote   Whether the style demotes particles for sorting.
 * @param string[] $articles Leading articles titles sort without.
 * @return int
 */
function bibliography_builder_sort_compare(
	$family,
	$collator,
	$a,
	$b,
	$demote = false,
	$articles = array( 'a', 'an', 'the' )
) {
	$authors = bibliography_builder_locale_compare(
		$collator,
		bibliography_builder_sort_author_key( $a, $demote, $articles ),
		bibliography_builder_sort_author_key( $b, $demote, $articles )
	);
	$titles  = static function () use ( $collator, $a, $b, $articles ): int {
		return bibliography_builder_locale_compare(
			$collator,
			bibliography_builder_sort_title_key( $a, $articles ),
			bibliography_builder_sort_title_key( $b, $articles )
		);
	};

	if ( 'notes' === $family ) {
		if ( 0 !== $authors ) {
			return $authors;
		}

		$title_comparison = $titles();

		return 0 !== $title_comparison ? $title_comparison : bibliography_builder_sort_compare_years( $a, $b );
	}

	$key =
		/**
		 * Sort key for one contributor.
		 *
		 * @param mixed $contributor CSL contributor.
		 * @return string
		 */
		static function ( $contributor ) use ( $demote ): string {
			return bibliography_builder_sort_contributor_key( $contributor, $demote );
		};
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
	$demote   = bibliography_builder_demotes_particle_for_sort( $style['demoteNonDroppingParticle'] );
	$articles = bibliography_builder_sort_leading_articles( $style['locale'] );

	$indexed = array();

	foreach ( $citations as $index => $citation ) {
		$indexed[] = array( $index, $citation );
	}

	usort(
		$indexed,
		static function ( $left, $right ) use ( $style, $collator, $demote, $articles ) {
			$comparison = bibliography_builder_sort_compare(
				$style['family'],
				$collator,
				bibliography_builder_citation_csl( $left[1] ),
				bibliography_builder_citation_csl( $right[1] ),
				$demote,
				$articles
			);

			return 0 !== $comparison ? $comparison : $left[0] - $right[0];
		}
	);

	return array_column( $indexed, 1 );
}
