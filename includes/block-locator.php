<?php
/**
 * Byte-range locator and splicer for bibliography blocks in post content.
 *
 * The write routes (Phase 05, M2) must change one bibliography block without
 * touching the rest of the post. Re-serializing the whole post with
 * `serialize_blocks( parse_blocks() )` is lossless in meaning but can rewrite
 * other blocks' comment JSON byte for byte, which makes noisy revisions. So a
 * write finds the target block's exact byte range with the block-delimiter
 * grammar `WP_Block_Parser` uses, replaces only that range, and checks by
 * re-parsing that nothing else changed.
 *
 * Blocks are numbered in the order `bibliography_builder_collect_blocks()`
 * walks `parse_blocks()` output (depth-first, parents before their inner
 * blocks), so an index here is the `{index}` the read routes use.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The block delimiter pattern from `WP_Block_Parser::next_token()`.
 */
// phpcs:ignore Generic.Files.LineLength -- Kept identical to core's pattern.
const BIBLIOGRAPHY_BUILDER_BLOCK_DELIMITER_PATTERN = '/<!--\s+(?P<closer>\/)?wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)\s+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}\s+\/?-->).)*+)?}\s+)?(?P<void>\/)?-->/s';

/**
 * Locate every bibliography block in post content.
 *
 * Each range covers the whole serialized block: from its opening delimiter to
 * the end of its closing delimiter, or the self-closing delimiter of a block
 * with no citations. Content the editor itself would not produce (a closer
 * with no opener, a closer for a different block, a block left open at the
 * end) is refused, because a write must never guess where a block ends.
 *
 * @param string $content Post content.
 * @return array|WP_Error List of `{ start, end, attrs }` in index order; byte
 *                        offsets, `end` exclusive, `attrs` the decoded
 *                        attributes (see
 *                        bibliography_builder_decode_save_attributes()).
 */
function bibliography_builder_locate_bibliography_blocks( $content ) {
	$content = (string) $content;
	$target  = 'bibliography-builder/bibliography';
	$offset  = 0;
	$stack   = array();
	$ranges  = array();

	$pattern = BIBLIOGRAPHY_BUILDER_BLOCK_DELIMITER_PATTERN;

	while ( 1 === preg_match( $pattern, $content, $match, PREG_OFFSET_CAPTURE, $offset ) ) {
		$start  = $match[0][1];
		$length = strlen( $match[0][0] );
		$offset = $start + $length;

		$namespace = isset( $match['namespace'] ) && -1 !== $match['namespace'][1] ? $match['namespace'][0] : 'core/';
		$name      = $namespace . $match['name'][0];
		$is_closer = isset( $match['closer'] ) && -1 !== $match['closer'][1];
		$is_void   = isset( $match['void'] ) && -1 !== $match['void'][1];
		$has_attrs = isset( $match['attrs'] ) && -1 !== $match['attrs'][1];

		if ( $is_closer ) {
			$open = array_pop( $stack );

			if ( null === $open || $open['name'] !== $name ) {
				return new WP_Error(
					'bibliography_builder_block_structure',
					sprintf(
						/* translators: %s: block name. */
						__(
							'The post content has an unmatched closing delimiter for %s.',
							'borges-bibliography-builder'
						),
						$name
					),
					array( 'status' => 409 )
				);
			}

			if ( null !== $open['range'] ) {
				$ranges[ $open['range'] ]['end'] = $offset;
			}

			continue;
		}

		$range = null;

		if ( $target === $name ) {
			$range            = count( $ranges );
			$attrs_json       = $has_attrs ? trim( $match['attrs'][0] ) : '{}';
			$ranges[ $range ] = array(
				'start' => $start,
				'end'   => $is_void ? $offset : null,
				'attrs' => bibliography_builder_decode_save_attributes( $attrs_json ),
			);
		}

		if ( ! $is_void ) {
			$stack[] = array(
				'name'  => $name,
				'range' => $range,
			);
		}
	}

	if ( ! empty( $stack ) ) {
		return new WP_Error(
			'bibliography_builder_block_structure',
			__( 'The post content has a block that is never closed.', 'borges-bibliography-builder' ),
			array( 'status' => 409 )
		);
	}

	return $ranges;
}

/**
 * Serialize one bibliography block with the given attributes.
 *
 * @param array  $attrs     Block attributes.
 * @param string $inner_html Saved markup (`''` for a block with no citations).
 * @return string
 */
function bibliography_builder_serialize_bibliography_block( $attrs, $inner_html ) {
	$comment_attrs = empty( $attrs ) ? '' : serialize_block_attributes( $attrs ) . ' ';

	if ( '' === $inner_html ) {
		return '<!-- wp:bibliography-builder/bibliography ' . $comment_attrs . '/-->';
	}

	return '<!-- wp:bibliography-builder/bibliography ' . $comment_attrs . '-->'
		. $inner_html
		. '<!-- /wp:bibliography-builder/bibliography -->';
}

/**
 * Replace one bibliography block in post content, touching nothing else.
 *
 * After splicing, the content is located again to prove the result is sound:
 * the same number of bibliography blocks, every other block's range shifted
 * but its bytes unchanged, and the target block holding exactly the
 * replacement with the attributes it was built from.
 *
 * @param string $content     Post content.
 * @param int    $index       Block index (see the file comment).
 * @param string $replacement Serialized block
 *                            (bibliography_builder_serialize_bibliography_block()).
 * @return string|WP_Error New post content.
 */
function bibliography_builder_splice_bibliography_block( $content, $index, $replacement ) {
	$content = (string) $content;
	$ranges  = bibliography_builder_locate_bibliography_blocks( $content );

	if ( is_wp_error( $ranges ) ) {
		return $ranges;
	}

	if ( ! isset( $ranges[ $index ] ) ) {
		return new WP_Error(
			'bibliography_builder_bibliography_not_found',
			__( 'Bibliography not found.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	$target  = $ranges[ $index ];
	$updated = substr( $content, 0, $target['start'] ) . $replacement . substr( $content, $target['end'] );
	$after   = bibliography_builder_locate_bibliography_blocks( $updated );
	$delta   = strlen( $replacement ) - ( $target['end'] - $target['start'] );

	$failure = new WP_Error(
		'bibliography_builder_splice_failed',
		__(
			'The updated bibliography could not be written without changing other content.',
			'borges-bibliography-builder'
		),
		array( 'status' => 500 )
	);

	if ( is_wp_error( $after ) || count( $after ) !== count( $ranges ) ) {
		return $failure;
	}

	foreach ( $ranges as $position => $range ) {
		$moved = $position === $index
			? array(
				'start' => $range['start'],
				'end'   => $range['start'] + strlen( $replacement ),
			)
			: array(
				'start' => $range['start'] + ( $range['start'] > $target['start'] ? $delta : 0 ),
				'end'   => $range['end'] + ( $range['end'] > $target['start'] ? $delta : 0 ),
			);

		if ( $after[ $position ]['start'] !== $moved['start'] || $after[ $position ]['end'] !== $moved['end'] ) {
			return $failure;
		}
	}

	return $updated;
}
