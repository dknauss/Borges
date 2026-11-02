<?php
/**
 * Name the bibliography by its visible heading.
 *
 * Borges 1.17.0 and earlier saved the section's accessible name as an
 * `aria-label` copied from the heading text. That works, but the label is a
 * second copy of the name: browser translation and some screen readers'
 * text tools change the heading and not the label. save() now gives the
 * heading an `id` and points the section's `aria-labelledby` at it, so the
 * name is the heading itself (WCAG technique ARIA11 and the ARIA practice of
 * preferring visible labels).
 *
 * This filter upgrades already-saved blocks as they render, so stored posts
 * and save() stay as they are and no deprecation is involved. It only acts
 * when the section's `aria-label` matches the heading that opens it and the
 * block has a stable `bibliographyId` to build the heading `id` from; a block
 * without a heading, or without an ID, keeps its `aria-label`.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Replace a saved section `aria-label` with `aria-labelledby` on the heading.
 *
 * Hooked to `render_block_bibliography-builder/bibliography`.
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @param mixed $block         The parsed block.
 * @return mixed
 */
function bibliography_builder_label_section_by_heading( $block_content, $block = null ) {
	if ( ! is_string( $block_content )
		|| false === strpos( $block_content, 'class="bibliography-builder-heading">' )
		|| ! is_array( $block )
		|| ! isset( $block['attrs'] )
		|| ! is_array( $block['attrs'] )
	) {
		return $block_content;
	}

	$heading_id = bibliography_builder_save_heading_id( $block['attrs'] );

	if ( null === $heading_id || false !== strpos( $block_content, 'id="' . $heading_id . '"' ) ) {
		return $block_content;
	}

	// 1: section up to its role; 2: the label; 3: the rest of the section's
	// opening tag and the heading's name; 4: the heading's tag; 5: its text.
	$pattern = '/^(\s*<section\s[^>]*?\brole="doc-bibliography") aria-label="([^"]*)"'
		. '([^>]*>\s*<(h[1-6]|p)) class="bibliography-builder-heading">(.*?)<\/\4>/s';
	$result  = preg_replace_callback(
		$pattern,
		static function ( $parts ) use ( $heading_id ) {
			$decode = static function ( string $text ): string {
				return html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			};

			if ( false !== strpos( $parts[3], 'aria-labelledby=' )
				|| false !== strpos( $parts[5], '<' )
				|| $decode( $parts[2] ) !== $decode( $parts[5] )
			) {
				return $parts[0];
			}

			return $parts[1] . ' aria-labelledby="' . $heading_id . '"' . $parts[3]
				. ' class="bibliography-builder-heading" id="' . $heading_id . '">'
				. $parts[5] . '</' . $parts[4] . '>';
		},
		$block_content,
		1
	);

	return null === $result ? $block_content : $result;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_label_section_by_heading', 10, 2 );
