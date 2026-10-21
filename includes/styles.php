<?php
/**
 * The citation style table, shared with JS.
 *
 * `styles.json` beside this file is the one source for each style's CSL
 * template, locale, family, list type, particle rule, and default heading.
 * `src/lib/formatting/style-registry.js` imports the same file, and the
 * formatter, the save() port, and the write routes read it through here.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Read `styles.json`, once per request.
 *
 * @return array{defaultStyle: string, styles: array<string, array<string, mixed>>}
 */
function bibliography_builder_get_style_data() {
	static $data = null;

	if ( null === $data ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file, not a remote URL.
		$json    = file_get_contents( __DIR__ . '/styles.json' );
		$decoded = is_string( $json ) ? json_decode( $json, true ) : null;
		$decoded = is_array( $decoded ) ? $decoded : array();
		$data    = array(
			'defaultStyle' => isset( $decoded['defaultStyle'] ) ? (string) $decoded['defaultStyle'] : '',
			'styles'       => isset( $decoded['styles'] ) && is_array( $decoded['styles'] )
				? $decoded['styles']
				: array(),
		);
	}

	return $data;
}

/**
 * The default citation style key (`DEFAULT_CITATION_STYLE` in JS).
 *
 * @return string
 */
function bibliography_builder_default_style_key() {
	return bibliography_builder_get_style_data()['defaultStyle'];
}
