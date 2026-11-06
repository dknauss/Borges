<?php
/**
 * Render-time microformats (h-cite) for bibliography entries.
 *
 * IndieWeb tools read citations from microformats2 classes in the page's
 * HTML, not from JSON-LD or COinS. This marks each entry, as the block
 * renders, as an `h-cite` built from the same CSL-JSON the other two views
 * come from:
 *
 * - the entry's `<li id="ref-…">` gets the class `h-cite`;
 * - inside it, before the visible text, an empty hidden span holds `<data>`
 *   elements for what the formatted text has no element around: `p-name`
 *   (the title), `p-author` (each author, as an `h-card`), `dt-published`,
 *   `u-uid` and `u-url` (the DOI as `https://doi.org/…`), `u-url` (the
 *   work's URL), `p-publication` (the journal, book, or site it is in), and
 *   `p-publisher`.
 *
 * The visible text is not restructured: a citation style decides where each
 * field falls in it, and some fields (an article title in quotation marks)
 * have no element to mark. The `<data>` elements carry their values in
 * attributes and have no text, so they add nothing that is seen or read
 * aloud.
 *
 * Entries are matched to citations by the citation ID in each `<li id="ref-…">`
 * anchor. The Cite / Export panel's own list items have no such anchor, so
 * they are never marked. The stored content is untouched, so no block
 * deprecation is needed and posts gain the markup without being re-saved.
 * An entry already marked `h-cite` is left alone.
 * `bibliography_builder_enrich_microformats` turns it off. Feeds and email
 * leave it out (see includes/email-output.php).
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class of the hidden span that holds an entry's `<data>` elements.
 *
 * @since 1.19.0
 */
const BIBLIOGRAPHY_BUILDER_MICROFORMATS_CLASS = 'bibliography-builder-microformats';

/**
 * One `<data>` element, or '' for an empty value.
 *
 * @since 1.19.0
 *
 * @param string $classes Microformats classes, space-separated.
 * @param string $value   Plain-text value.
 * @return string
 */
function bibliography_builder_microformats_data( $classes, $value ) {
	if ( '' === $value ) {
		return '';
	}

	return '<data class="' . $classes . '" value="'
		. bibliography_builder_escape_save_attribute( $value ) . '"></data>';
}

/**
 * An ORCID iD as its `https://orcid.org/…` URL, or '' when it is not one.
 *
 * @since 1.19.0
 *
 * @param string $orcid CSL `ORCID` name value, bare or as a URL.
 * @return string
 */
function bibliography_builder_microformats_orcid_url( $orcid ) {
	return preg_match( '#^(?:https?://orcid\.org/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/?$#i', trim( $orcid ), $match )
		? 'https://orcid.org/' . strtoupper( $match[1] )
		: '';
}

/**
 * One CSL name as a `p-author h-card`, or '' for an empty name.
 *
 * A person gets `p-name` (the name as save() displays it), `p-given-name`,
 * and `p-family-name`, plus a `u-url` for an ORCID iD; an organization
 * (a literal name only) gets `p-name` and `p-org`.
 *
 * @since 1.19.0
 *
 * @param mixed $name CSL name object.
 * @return string
 */
function bibliography_builder_microformats_author( $name ) {
	$literal = bibliography_builder_js_trim( bibliography_builder_save_name_part( $name, 'literal' ) );
	$family  = bibliography_builder_js_trim( bibliography_builder_save_name_part( $name, 'family' ) );
	$given   = bibliography_builder_js_trim( bibliography_builder_save_name_part( $name, 'given' ) );

	if ( '' !== $literal && '' === $family && '' === $given ) {
		$parts = bibliography_builder_microformats_data( 'p-name', $literal )
			. bibliography_builder_microformats_data( 'p-org', $literal );
	} else {
		$display = bibliography_builder_js_trim( bibliography_builder_save_display_name( $name ) );

		// A one-part name in `given` ("Plato") has no family name to show.
		if ( '' === $display ) {
			$display = $given;
		}

		if ( '' === $display ) {
			return '';
		}

		$family_name = bibliography_builder_save_join_name_parts(
			array(
				bibliography_builder_save_name_part( $name, 'non-dropping-particle' ),
				$family,
			)
		);

		$parts = bibliography_builder_microformats_data( 'p-name', $display )
			. bibliography_builder_microformats_data( 'p-given-name', '' !== $family ? $given : '' )
			. bibliography_builder_microformats_data( 'p-family-name', $family_name )
			. bibliography_builder_microformats_data(
				'u-url',
				bibliography_builder_microformats_orcid_url( bibliography_builder_save_name_part( $name, 'ORCID' ) )
			);
	}

	return '<span class="p-author h-card">' . $parts . '</span>';
}

/**
 * A CSL item's issued date as an ISO 8601 date, or '' when it has none.
 *
 * Only the parts the record has are written: `2018`, `2018-05`, or
 * `2018-05-14`, never a made-up month or day. Seasons (CSL months 13–24)
 * and out-of-range values end the date where they are.
 *
 * @since 1.19.0
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_microformats_date( $csl ) {
	$parts = bibliography_builder_csl_first_date_parts( $csl );

	if ( null === $parts ) {
		$issued = bibliography_builder_csl_field( $csl, 'issued' );
		$raw    = is_array( $issued ) && isset( $issued['raw'] ) && is_string( $issued['raw'] )
			? trim( $issued['raw'] )
			: '';

		return preg_match( '/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/', $raw ) ? $raw : '';
	}

	$limits = array( 9999, 12, 31 );
	$parts  = array_values( $parts );
	$date   = array();

	foreach ( $limits as $index => $limit ) {
		$part = isset( $parts[ $index ] ) ? $parts[ $index ] : null;

		if ( ! is_int( $part ) && ! ( is_string( $part ) && ctype_digit( $part ) ) ) {
			break;
		}

		$number = (int) $part;

		if ( $number > $limit || ( $index > 0 && $number < 1 ) ) {
			break;
		}

		$date[] = 0 === $index ? sprintf( '%04d', $number ) : sprintf( '%02d', $number );
	}

	if ( 3 === count( $date ) && ! checkdate( (int) $date[1], (int) $date[2], (int) $date[0] ) ) {
		array_pop( $date );
	}

	return implode( '-', $date );
}

/**
 * The hidden span of `<data>` elements for one entry, or '' when the record
 * has nothing to mark.
 *
 * @since 1.19.0
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_microformats_entry( $csl ) {
	$text = static function ( string $field ) use ( $csl ): string {
		return bibliography_builder_js_trim(
			bibliography_builder_save_strip_inline_markup( bibliography_builder_json_ld_csl_string( $csl, $field ) )
		);
	};

	$html = bibliography_builder_microformats_data( 'p-name', $text( 'title' ) );

	$authors = bibliography_builder_csl_field( $csl, 'author' );

	foreach ( is_array( $authors ) ? array_values( $authors ) : array() as $author ) {
		$html .= bibliography_builder_microformats_author( $author );
	}

	$html .= bibliography_builder_microformats_data( 'dt-published', bibliography_builder_microformats_date( $csl ) );

	$doi_url = '';

	foreach ( bibliography_builder_json_ld_identifiers( $csl ) as $identifier ) {
		if ( 'DOI' === $identifier['propertyID'] ) {
			$doi_url = $identifier['url'];
			$html   .= bibliography_builder_microformats_data( 'u-uid u-url', $doi_url );
		}
	}

	$url = bibliography_builder_json_ld_csl_string( $csl, 'URL' );

	if ( preg_match( '#^https?://\S+$#i', $url ) && $url !== $doi_url ) {
		$html .= bibliography_builder_microformats_data( 'u-url', $url );
	}

	$html .= bibliography_builder_microformats_data( 'p-publication', $text( 'container-title' ) )
		. bibliography_builder_microformats_data( 'p-publisher', $text( 'publisher' ) );

	if ( '' === $html ) {
		return '';
	}

	return '<span class="' . BIBLIOGRAPHY_BUILDER_MICROFORMATS_CLASS . '" hidden>' . $html . '</span>';
}

/**
 * Mark the entries of one rendered bibliography block as `h-cite`.
 *
 * Hooked to `render_block_bibliography-builder/bibliography`.
 *
 * @since 1.19.0
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @param array $parsed_block  Parsed block, with its attributes.
 * @return mixed
 */
function bibliography_builder_enrich_rendered_microformats( $block_content, $parsed_block = array() ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, ' id="ref-' ) || is_feed() ) {
		return $block_content;
	}

	/**
	 * Filters whether bibliography entries are marked as microformats
	 * (`h-cite`) as the block renders.
	 *
	 * @since 1.19.0
	 *
	 * @param bool  $enrich       Whether to add the markup. Default true.
	 * @param array $parsed_block The parsed block.
	 */
	if ( ! apply_filters( 'bibliography_builder_enrich_microformats', true, $parsed_block ) ) {
		return $block_content;
	}

	$citations = bibliography_builder_rendered_citation_csl( $parsed_block );

	if ( array() === $citations ) {
		return $block_content;
	}

	// An `<li>` start tag, its attributes read whole so a `>` inside a quoted
	// value cannot end it early.
	$pattern = '#<li\b((?:\s+[^\s"\'>/=]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?)*+)(\s*/?>)#';

	$enriched = preg_replace_callback(
		$pattern,
		static function ( $matches ) use ( $citations ) {
			$attributes = $matches[1];

			if ( ! preg_match( '#\sid="ref-([^"]+)"#', $attributes, $id ) ) {
				return $matches[0];
			}

			$citation_id = html_entity_decode( $id[1], ENT_QUOTES, 'UTF-8' );

			if ( ! isset( $citations[ $citation_id ] ) ) {
				return $matches[0];
			}

			if ( preg_match( '#\sclass="([^"]*)"#', $attributes, $class ) ) {
				if ( in_array( 'h-cite', explode( ' ', $class[1] ), true ) ) {
					return $matches[0];
				}

				$attributes = str_replace(
					$class[0],
					' class="' . ( '' === trim( $class[1] ) ? '' : trim( $class[1] ) . ' ' ) . 'h-cite"',
					$attributes
				);
			} else {
				$attributes .= ' class="h-cite"';
			}

			return '<li' . $attributes . $matches[2]
				. bibliography_builder_microformats_entry( $citations[ $citation_id ] );
		},
		$block_content
	);

	return is_string( $enriched ) ? $enriched : $block_content;
}

add_filter(
	'render_block_bibliography-builder/bibliography',
	'bibliography_builder_enrich_rendered_microformats',
	11,
	2
);
