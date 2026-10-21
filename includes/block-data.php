<?php
/**
 * Bibliography block data: finding the blocks in a post and reading their
 * citations as records, plain text, and CSL-JSON.
 *
 * Moved unchanged from bibliography-builder.php (refactor memo, Phase B).
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Return a block's stable `bibliographyId`, or null when it has none yet.
 *
 * The editor assigns a UUID to every bibliography block and keeps it unique
 * within a post (Phase 05, Tier 0). Blocks saved before that, or edited by
 * hand, may carry no ID or an unusable one; those report null rather than a
 * value a client could not safely use as a URL segment.
 *
 * @param array $attrs Block attributes.
 * @return string|null
 */
function bibliography_builder_get_stable_block_id( $attrs ) {
	$id = isset( $attrs['bibliographyId'] ) ? $attrs['bibliographyId'] : null;

	// An all-digit value would read as a block index in `{ref}` URL segments,
	// so it is not a usable ID (the editor then replaces it, as in
	// src/lib/stable-ids.js).
	return bibliography_builder_is_block_id( $id ) ? $id : null;
}

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
				'bibliographyId' => bibliography_builder_get_stable_block_id( $attrs ),
				'citationStyle'  => isset( $attrs['citationStyle'] )
					? (string) $attrs['citationStyle']
					: bibliography_builder_default_style_key(),
				'headingText'    => isset( $attrs['headingText'] )
					? (string) $attrs['headingText']
					: '',
				// The level save() prints: "h3" gives 3, and "p" gives 0.
				'headingLevel'   => (int) substr(
					bibliography_builder_save_heading_tag(
						isset( $attrs['headingLevel'] ) ? $attrs['headingLevel'] : 0
					),
					1
				),
				'outputJsonLd'   => isset( $attrs['outputJsonLd'] ) ? (bool) $attrs['outputJsonLd'] : true,
				'outputCoins'    => ! empty( $attrs['outputCoins'] ),
				'outputCslJson'  => ! empty( $attrs['outputCslJson'] ),
				'citations'      => isset( $attrs['citations'] )
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
	// With two arrays, array_map() always returns a list.
	return array_map(
		static function ( $bibliography, $index ) {
			$bibliography['index']      = $index;
			$bibliography['entryCount'] = count( $bibliography['citations'] );

			return $bibliography;
		},
		$bibliographies,
		array_keys( $bibliographies )
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
		$lines[] = bibliography_builder_strip_bounded( bibliography_builder_get_citation_display_text( $citation ) );
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
