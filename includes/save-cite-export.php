<?php
/**
 * Cite / Export data for the save() port: export file names, RIS, and the
 * `data-cite-*` attributes, mirroring `src/lib/export.js`.
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
	$add   =
		/**
		 * Append one RIS line when the value is present.
		 *
		 * @param string $tag   RIS tag.
		 * @param mixed  $value CSL field value.
		 * @return void
		 */
		static function ( $tag, $value ) use ( &$lines ): void {
			if ( null !== $value && '' !== $value ) {
				$lines[] = $tag . '  - ' . bibliography_builder_js_string( $value );
			}
		};
	$field =
		/**
		 * Read a field from the CSL item.
		 *
		 * @param string $name CSL field name.
		 * @return mixed
		 */
		static function ( $name ) use ( $csl ) {
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
 * The per-entry Cite / Export data, as `data-` attributes for the entry's `<li>`.
 *
 * `getCiteExportData()` in src/save-markup.js. The panel itself is not saved:
 * the view script builds it from these attributes, so email clients and feed
 * readers, which show post content without the script and stylesheet, see
 * only the bibliography.
 *
 * @param array $citation Citation record.
 * @return array Attribute name => value, in serialized order.
 */
function bibliography_builder_save_cite_export_data( $citation ) {
	$csl       = bibliography_builder_citation_csl( $citation );
	$cite_text = '';

	foreach ( array( 'displayOverride', 'formattedText' ) as $field ) {
		$value = isset( $citation[ $field ] ) ? $citation[ $field ] : null;

		if ( '' === $cite_text && bibliography_builder_js_truthy( $value ) ) {
			$cite_text = bibliography_builder_js_string( $citation[ $field ] );
		}
	}

	$csl_json = bibliography_builder_json_stringify( bibliography_builder_citation_raw_csl( $citation ), 2 );
	$data     = array(
		// Strip after choosing, as save() does: an override of nothing but
		// tags copies as empty rather than falling through to the formatted text.
		'data-cite-text'     => bibliography_builder_save_strip_inline_markup( $cite_text ),
		'data-cite-filename' => bibliography_builder_save_export_basename( $csl ),
		'data-cite-ris'      => bibliography_builder_save_ris_entry( $csl ),
		'data-cite-csl-json' => $csl_json . "\n",
		'data-cite-bibtex'   => null,
		'data-cite-biblatex' => null,
	);

	foreach ( array(
		'exportBibtex'   => 'data-cite-bibtex',
		'exportBiblatex' => 'data-cite-biblatex',
	) as $field => $attribute ) {
		if ( isset( $citation[ $field ] ) && bibliography_builder_js_truthy( $citation[ $field ] ) ) {
			$data[ $attribute ] = bibliography_builder_js_string( $citation[ $field ] );
		}
	}

	return $data;
}
