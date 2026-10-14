<?php
/**
 * Render-time upgrade of JSON-LD saved before 1.11.0.
 *
 * Before 1.11.0, save() wrote the cited works as a top-level JSON-LD array.
 * A consumer that reads the first top-level WebPage or NewsArticle on a page
 * as the page itself then took a cited work for the post: Mastodon's link
 * cards showed "by <cited author>" as the post's byline. Since 1.11.0, save()
 * nests the works in one schema.org ItemList.
 *
 * Saved markup only changes when a post is next saved in the editor, so this
 * filter rewrites the older shape as the block is rendered. Published posts
 * are corrected without being edited, and the stored content is untouched.
 * Markup that is not the old shape, including anything already nested, passes
 * through unchanged.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Nest a pre-1.11.0 top-level JSON-LD array in a rendered block.
 *
 * @since 1.11.0
 *
 * @param string $block_content Rendered block HTML.
 * @return string
 */
function bibliography_builder_nest_rendered_json_ld( $block_content ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, '<script type="application/ld+json">[' ) ) {
		return $block_content;
	}

	// `<` is always escaped inside the saved JSON, so the first literal
	// `</script>` after the opening tag is the element's end.
	$nested = preg_replace_callback(
		'#(<script type="application/ld\+json">)(\[.*?)(</script>)#s',
		'bibliography_builder_nest_json_ld_match',
		$block_content
	);

	return is_string( $nested ) ? $nested : $block_content;
}

/**
 * `preg_replace_callback()` callback for bibliography_builder_nest_rendered_json_ld().
 *
 * @since 1.11.0
 *
 * @param array<int, string> $matches Opening tag, JSON, closing tag.
 * @return string
 */
function bibliography_builder_nest_json_ld_match( $matches ) {
	// Objects stay stdClass so an empty `{}` re-encodes as `{}`, not `[]`.
	$items = json_decode( $matches[2] );

	if ( ! is_array( $items ) || array() === $items ) {
		return $matches[0];
	}

	$works = array();

	foreach ( $items as $item ) {
		if ( ! $item instanceof stdClass || ! isset( $item->{'@type'} ) ) {
			return $matches[0];
		}

		$works[] = get_object_vars( $item );
	}

	return $matches[1]
		. bibliography_builder_escape_for_script(
			bibliography_builder_json_stringify( bibliography_builder_json_ld_item_list( $works ) )
		)
		. $matches[3];
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_nest_rendered_json_ld' );
