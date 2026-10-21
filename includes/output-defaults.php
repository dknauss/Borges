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
 * @since 1.12.0
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
 * @since 1.12.0
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
	 * @since 1.12.0
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
 * Pass the output defaults to the block editor.
 *
 * @since 1.12.0
 *
 * @param array $settings Block editor settings.
 * @return array
 */
function bibliography_builder_editor_output_defaults( $settings ) {
	if ( ! is_array( $settings ) ) {
		return $settings;
	}

	$settings['bibliographyBuilderOutputDefaults'] = bibliography_builder_get_output_defaults();

	return $settings;
}

add_filter( 'block_editor_settings_all', 'bibliography_builder_editor_output_defaults' );
