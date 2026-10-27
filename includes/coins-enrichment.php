<?php
/**
 * Render-time enrichment of the bibliography's COinS spans.
 *
 * The save() function writes one COinS span (`<span class="Z3988" title="…">`)
 * per entry, with only the first author and a DOI. Reference managers that
 * read COinS, such as Zotero's browser connector, then import every other
 * author as missing. This adds, as the block renders, what save() leaves out:
 *
 * - every author after the first, in order, as `rft.au`. The first author
 *   keeps its `rft.aulast` and `rft.aufirst`, so readers that know only those
 *   see what they did before. See bibliography_builder_coins_enrich_title()
 *   for how this keeps Zotero from listing an author twice or out of order.
 * - an `rft_id` of `info:pmid/…` for a PubMed ID, beside the DOI's.
 *
 * The stored content is untouched, so no block deprecation is needed, and
 * posts gain the fields without being re-saved. Markup that already carries
 * a field is left alone, which keeps the filter safe if save() writes them
 * one day. `bibliography_builder_enrich_coins` turns it off.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * One CSL author as the COinS reader sees it, or null for an empty name.
 *
 * @since 1.16.0
 *
 * @param mixed $author A CSL name object.
 * @return array{corporate: bool, last: string, au: string}|null `last` is
 *     the name a reader files the author under; `au` is the `rft.au` value.
 */
function bibliography_builder_coins_author( $author ) {
	if ( ! is_array( $author ) ) {
		return null;
	}

	$literal = isset( $author['literal'] ) && is_string( $author['literal'] ) ? trim( $author['literal'] ) : '';
	$family  = isset( $author['family'] ) && is_string( $author['family'] ) ? trim( $author['family'] ) : '';
	$given   = isset( $author['given'] ) && is_string( $author['given'] ) ? trim( $author['given'] ) : '';

	if ( '' === $family && '' !== $literal ) {
		// The trailing comma marks the name as inverted with no first name,
		// so readers file all of it as one last name instead of splitting it
		// at its last space ("Organization", first name "World Health").
		return array(
			'corporate' => true,
			'last'      => $literal,
			'au'        => $literal . ',',
		);
	}

	if ( '' === $family && '' === $given ) {
		return null;
	}

	// A one-part name ("Plato", "van der Waals") gets the same trailing comma
	// as an organization, so it is filed whole as a last name, the way save()
	// writes it into `rft.aulast`, and not split at its last space.
	return array(
		'corporate' => false,
		'last'      => '' !== $family ? $family : $given,
		'au'        => '' !== $family && '' !== $given ? $family . ', ' . $given : $family . $given . ',',
	);
}

/**
 * One entry's COinS `title` with what save() leaves out.
 *
 * The save() function writes the first author as `rft.aulast` and
 * `rft.aufirst`. Every later author is added after it, in order, as an
 * `rft.au`, which Z39.88-2004 lets repeat: "Family, Given" for a person, and
 * the name and a comma for an organization or a one-part name. Organizations are not written as
 * `rft.aucorp`: Zotero's OpenURL reader puts every `aucorp` name ahead of
 * all the others, so a corporate coauthor would move to the front.
 *
 * The first author is not repeated as `rft.au`. Zotero's reader puts the
 * `aulast`/`aufirst` name back in its place among the `au` names, and drops
 * it only when an `au` name looks like the same person.
 * That test misses normalized initials and one-part names, so repeating the
 * first author listed it twice. The same test can also drop a first author
 * whose last name a later author shares, or throw when that first author
 * has no first name. So when a later author shares the first author's last
 * name, the saved `aulast`/`aufirst` are replaced by an `rft.au` for every
 * author.
 *
 * A PubMed ID is added as an `rft_id` of `info:pmid/…`. Fields the saved
 * span already has are left alone.
 *
 * @since 1.16.0
 *
 * @param array  $csl   The citation's CSL-JSON.
 * @param string $title The span's `title` as saved, attribute-escaped.
 * @return string The `title`, attribute-escaped; unchanged when nothing is added.
 */
function bibliography_builder_coins_enrich_title( $csl, $title ) {
	// Encoded values hold no `&`, so the escaped separator is the only one.
	$pairs  = explode( '&', str_replace( '&amp;', '&', $title ) );
	$added  = array();
	$listed = false;
	$saved  = '';

	// Readers compare last names with surrounding punctuation trimmed; a
	// looser match here only means the safe all-`rft.au` form is used.
	$key =
		/**
		 * A last name as compared for a shared-name check.
		 *
		 * @param string $name Last name.
		 * @return string
		 */
		static function ( string $name ): string {
			return strtolower( trim( $name, " \t\n.,/[]:" ) );
		};

	foreach ( $pairs as $pair ) {
		if ( 0 === strpos( $pair, 'rft.au=' ) || 0 === strpos( $pair, 'rft.aucorp=' ) ) {
			$listed = true;
		} elseif ( 0 === strpos( $pair, 'rft.aulast=' ) ) {
			$saved = $key( rawurldecode( substr( $pair, strlen( 'rft.aulast=' ) ) ) );
		}
	}

	// Empty names stay in place: save() writes the first entry of the list,
	// even one it can write nothing for.
	$raw     = bibliography_builder_csl_field( $csl, 'author' );
	$authors = array_map( 'bibliography_builder_coins_author', is_array( $raw ) ? array_values( $raw ) : array() );

	if ( ! $listed && count( $authors ) > 1 ) {
		$from = 1;

		foreach ( array_slice( $authors, 1 ) as $author ) {
			if ( null !== $author && '' !== $saved && $key( $author['last'] ) === $saved ) {
				$from  = 0;
				$pairs = array_values(
					array_filter(
						$pairs,
						static function ( $pair ) {
							return 0 !== strpos( $pair, 'rft.aulast=' ) && 0 !== strpos( $pair, 'rft.aufirst=' );
						}
					)
				);
				break;
			}
		}

		foreach ( array_filter( array_slice( $authors, $from ) ) as $author ) {
			$added[] = 'rft.au=' . bibliography_builder_encode_uri_component( $author['au'] );
		}
	}

	$pmid = bibliography_builder_json_ld_csl_string( $csl, 'PMID' );

	if ( preg_match( '/^\d+$/', $pmid ) && false === strpos( $title, 'info%3Apmid' ) ) {
		$added[] = 'rft_id=' . bibliography_builder_encode_uri_component( 'info:pmid/' . $pmid );
	}

	if ( array() === $added ) {
		return $title;
	}

	// Encoded pairs hold no characters that need attribute escaping besides
	// the `&` that joins them.
	return implode( '&amp;', array_merge( $pairs, $added ) );
}

/**
 * Add the missing COinS fields to one rendered bibliography block.
 *
 * Spans are matched to citations through the `<li id="ref-…">` anchors, which
 * save() writes in the same order. COinS is on or off for a whole block, so a
 * block whose spans and anchors do not line up one to one is left as saved.
 *
 * @since 1.16.0
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @param array $parsed_block  Parsed block, with its attributes.
 * @return mixed
 */
function bibliography_builder_enrich_rendered_coins( $block_content, $parsed_block = array() ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, '<span class="Z3988"' ) ) {
		return $block_content;
	}

	/**
	 * Filters whether the bibliography's COinS spans are enriched as it renders.
	 *
	 * @since 1.16.0
	 *
	 * @param bool  $enrich       Whether to enrich. Default true.
	 * @param array $parsed_block The parsed block.
	 */
	if ( ! apply_filters( 'bibliography_builder_enrich_coins', true, $parsed_block ) ) {
		return $block_content;
	}

	$pattern    = '#(<span class="Z3988"[^>]*?\stitle=")([^"]*)(")#';
	$anchor_ids = bibliography_builder_rendered_anchor_ids( $block_content );

	if ( preg_match_all( $pattern, $block_content ) !== count( $anchor_ids ) ) {
		return $block_content;
	}

	$citations = bibliography_builder_rendered_citation_csl( $parsed_block );
	$index     = 0;

	$enriched = preg_replace_callback(
		$pattern,
		static function ( $matches ) use ( $citations, $anchor_ids, &$index ) {
			$citation_id = $anchor_ids[ $index++ ];

			if ( ! isset( $citations[ $citation_id ] ) ) {
				return $matches[0];
			}

			return $matches[1]
				. bibliography_builder_coins_enrich_title( $citations[ $citation_id ], $matches[2] )
				. $matches[3];
		},
		$block_content
	);

	return is_string( $enriched ) ? $enriched : $block_content;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_enrich_rendered_coins', 11, 2 );
