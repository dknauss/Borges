<?php
/**
 * Keep the bibliography a list for screen readers.
 *
 * The block's stylesheet hides list markers (`list-style: none`) so it can
 * draw its own hanging indents and numbers. WebKit then stops exposing the
 * `<ul>` or `<ol>` as a list: VoiceOver in Safari reads each entry as plain
 * text, with no "list, 12 items" and no "7 of 12". An explicit `role="list"`
 * restores both.
 *
 * The role is added as the block renders, like the JSON-LD and COinS
 * enrichments, so save() and stored posts are unchanged and no deprecation
 * is involved. Only the opening tags save() writes for the bibliography's own
 * lists are touched, and a list that already has a role keeps it.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Add `role="list"` to the bibliography lists in a rendered block.
 *
 * Hooked to `render_block_bibliography-builder/bibliography`.
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @return mixed
 */
function bibliography_builder_add_list_roles( $block_content ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, 'bibliography-builder-list' ) ) {
		return $block_content;
	}

	$result = preg_replace_callback(
		'/<(ul|ol)(\s[^>]*\bclass="bibliography-builder-list[\s"][^>]*)>/',
		static function ( $tag ) {
			if ( preg_match( '/\srole=/', $tag[2] ) ) {
				return $tag[0];
			}

			return '<' . $tag[1] . ' role="list"' . $tag[2] . '>';
		},
		$block_content
	);

	return null === $result ? $block_content : $result;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_add_list_roles' );
