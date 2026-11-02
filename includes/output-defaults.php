<?php
/**
 * Site-wide defaults for the block's output toggles.
 *
 * `block.json` sets JSON-LD on and COinS, CSL-JSON, and the Cite / Export
 * panel off. A site that wants different defaults for every new bibliography
 * returns them from the `bibliography_builder_output_defaults` filter. There
 * is deliberately no settings screen: the plugin persists no settings.
 *
 * The values reach the editor as a block editor setting, and the editor
 * writes them into each newly inserted block as explicit attributes
 * (src/lib/output-defaults.js). Existing blocks keep what they were saved
 * with: changing the defaults in `block.json` instead would change how every
 * saved block parses and invalidate its markup.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The output toggles and their `block.json` defaults.
 *
 * @since 1.13.0
 *
 * @return array<string, bool>
 */
function bibliography_builder_block_output_defaults() {
	return array(
		'outputJsonLd'     => true,
		'outputCoins'      => false,
		'outputCslJson'    => false,
		'outputCiteExport' => false,
	);
}

/**
 * The output toggle defaults for new blocks on this site.
 *
 * @since 1.13.0
 *
 * @return array<string, bool>
 */
function bibliography_builder_get_output_defaults() {
	$defaults = bibliography_builder_block_output_defaults();

	/**
	 * Filters the output toggles a newly inserted bibliography starts with.
	 *
	 * Keys are `outputJsonLd`, `outputCoins`, `outputCslJson`, and
	 * `outputCiteExport`. Only boolean values for those keys are used; anything
	 * else keeps the `block.json` default. Authors can still change each block.
	 *
	 * @since 1.13.0
	 *
	 * @param array<string, bool> $defaults The `block.json` defaults.
	 */
	$filtered = apply_filters( 'bibliography_builder_output_defaults', $defaults );

	if ( ! is_array( $filtered ) ) {
		return $defaults;
	}

	foreach ( array_keys( $defaults ) as $key ) {
		if ( isset( $filtered[ $key ] ) && is_bool( $filtered[ $key ] ) ) {
			$defaults[ $key ] = $filtered[ $key ];
		}
	}

	return $defaults;
}

/**
 * The heading level a newly inserted bibliography starts with.
 *
 * `block.json` defaults to 0 (a paragraph), and stays that way so blocks
 * saved with it keep validating. New blocks start with a real `<h2>`
 * instead, which puts the bibliography in the page's heading outline.
 *
 * @since 1.18.0
 *
 * @return int 0 for a paragraph, or 2 to 6.
 */
function bibliography_builder_get_new_block_heading_level() {
	/**
	 * Filters the heading level a newly inserted bibliography starts with.
	 *
	 * Return 2 to 6 for that heading, or 0 for a paragraph (the pre-1.18.0
	 * default). Any other value keeps 2. Authors can still change each block,
	 * and existing blocks keep what they were saved with.
	 *
	 * @since 1.18.0
	 *
	 * @param int $level Heading level. Default 2.
	 */
	$level = apply_filters( 'bibliography_builder_new_block_heading_level', 2 );

	return is_int( $level ) && in_array( $level, array( 0, 2, 3, 4, 5, 6 ), true ) ? $level : 2;
}

/**
 * Pass the defaults for new blocks to the block editor.
 *
 * @since 1.13.0
 *
 * @param mixed $settings Block editor settings; filters can pass any value.
 * @return mixed
 */
function bibliography_builder_editor_output_defaults( $settings ) {
	if ( ! is_array( $settings ) ) {
		return $settings;
	}

	$settings['bibliographyBuilderOutputDefaults'] = bibliography_builder_get_output_defaults()
		+ array( 'headingLevel' => bibliography_builder_get_new_block_heading_level() );

	return $settings;
}

add_filter( 'block_editor_settings_all', 'bibliography_builder_editor_output_defaults' );
