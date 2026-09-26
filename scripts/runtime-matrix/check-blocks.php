<?php
/**
 * Runtime smoke: each bibliography block in a post holds exactly the markup
 * save() renders for its attributes, so the editor would open it as valid.
 *
 * Usage: wp eval-file /smoke/check-blocks.php <post_id>
 * Prints "blocks-ok <count>" or "blocks-invalid <index>".
 * PHP 7.4-compatible on purpose.
 *
 * @package BibliographyBuilder
 */

$post_id = isset( $args[0] ) ? (int) $args[0] : 0;
$post    = get_post( $post_id );

if ( ! $post ) {
	echo "blocks-missing-post\n";
	return;
}

if ( ! bibliography_builder_can_render_save_markup() ) {
	echo "blocks-no-intl\n";
	return;
}

$count = 0;

foreach ( parse_blocks( $post->post_content ) as $block ) {
	if ( 'bibliography-builder/bibliography' !== $block['blockName'] ) {
		continue;
	}

	$attrs    = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
	$expected = bibliography_builder_render_save_markup( $attrs );

	if ( $expected !== $block['innerHTML'] ) {
		echo 'blocks-invalid ' . $count . "\n";
		return;
	}

	++$count;
}

echo 'blocks-ok ' . $count . "\n";
