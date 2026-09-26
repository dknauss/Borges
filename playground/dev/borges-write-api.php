<?php
/**
 * Plugin Name: Borges write API (development)
 * Description: Enables the opt-in citation write routes and adds a `borgesWrite` helper to the block editor's browser console. For the development Playground only (playground/blueprint-write-api.json); never install on a real site.
 *
 * @package BibliographyBuilder
 */

add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );

add_action(
	'enqueue_block_editor_assets',
	static function () {
		$helper = __DIR__ . '/borges-write-api-console.js';

		if ( is_readable( $helper ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local file.
			wp_add_inline_script( 'wp-api-fetch', (string) file_get_contents( $helper ) );
		}
	}
);
