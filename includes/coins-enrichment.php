<?php
/**
 * Render-time enrichment of the bibliography's COinS spans.
 *
 * The save() function writes one COinS span (`<span class="Z3988" title="…">`)
 * per entry, with only the first author and a DOI. Reference managers that
 * read COinS, such as Zotero's browser connector, then import every other
 * author as missing. This adds, as the block renders, what save() leaves out:
 *
 * - an `rft.au` ("Family, Given") for every person who wrote the work, or an
 *   `rft.aucorp` for an organization, both of which Z39.88-2004 lets repeat.
 *   The first author keeps its `rft.aulast` and `rft.aufirst`, so readers
 *   that know only those see what they did before; Zotero merges the two.
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
 * The COinS key-value pairs save() leaves out of one entry's span.
 *
 * @since 1.16.0
 *
 * @param array  $csl   The citation's CSL-JSON.
 * @param string $title The span's `title` as saved, attribute-escaped.
 * @return string[] Encoded `key=value` pairs, in the order to append them.
 */
function bibliography_builder_coins_missing_params( $csl, $title ) {
	$params = array();
	$add    =
		/**
		 * Append one encoded pair.
		 *
		 * @param string $key   COinS key.
		 * @param string $value Unencoded value.
		 * @return void
		 */
		static function ( $key, $value ) use ( &$params ): void {
			$params[] = $key . '=' . bibliography_builder_encode_uri_component( $value );
		};

	$authors = bibliography_builder_csl_field( $csl, 'author' );
	$listed  = false !== strpos( $title, 'rft.au=' ) || false !== strpos( $title, 'rft.aucorp=' );

	if ( ! $listed && is_array( $authors ) ) {
		foreach ( $authors as $author ) {
			if ( ! is_array( $author ) ) {
				continue;
			}

			$literal = isset( $author['literal'] ) && is_string( $author['literal'] ) ? trim( $author['literal'] ) : '';
			$family  = isset( $author['family'] ) && is_string( $author['family'] ) ? trim( $author['family'] ) : '';
			$given   = isset( $author['given'] ) && is_string( $author['given'] ) ? trim( $author['given'] ) : '';

			if ( '' === $family && '' !== $literal ) {
				$add( 'rft.aucorp', $literal );
			} elseif ( '' !== $family || '' !== $given ) {
				$add( 'rft.au', '' !== $family && '' !== $given ? $family . ', ' . $given : $family . $given );
			}
		}
	}

	$pmid = bibliography_builder_json_ld_csl_string( $csl, 'PMID' );

	if ( preg_match( '/^\d+$/', $pmid ) && false === strpos( $title, 'info%3Apmid' ) ) {
		$add( 'rft_id', 'info:pmid/' . $pmid );
	}

	return $params;
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

			$params = bibliography_builder_coins_missing_params( $citations[ $citation_id ], $matches[2] );

			if ( array() === $params ) {
				return $matches[0];
			}

			// Encoded pairs hold no characters that need attribute escaping
			// besides the `&` that joins them.
			return $matches[1] . $matches[2] . '&amp;' . implode( '&amp;', $params ) . $matches[3];
		},
		$block_content
	);

	return is_string( $enriched ) ? $enriched : $block_content;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_enrich_rendered_coins', 11, 2 );
