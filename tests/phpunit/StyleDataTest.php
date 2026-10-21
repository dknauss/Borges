<?php
/**
 * The shared style table, `includes/styles.json`.
 *
 * `src/lib/formatting/style-registry.js` imports the same file, so these
 * checks cover both languages: the JSON is complete and well formed, matches
 * `block.json` and the bundled CSL files, and the PHP readers return it.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class StyleDataTest extends TestCase {

	const FIELDS = array(
		'label'                     => null,
		'enabled'                   => null,
		'backend'                   => array( 'csl' ),
		'cslTemplate'               => null,
		'demoteNonDroppingParticle' => array( 'display-and-sort', 'sort-only', 'never' ),
		'listType'                  => array( 'ul', 'ol' ),
		'family'                    => array( 'notes', 'author-date', 'numeric' ),
		'locale'                    => null,
		'inlineCitationMode'        => array( 'note', 'parenthetical', 'numeric' ),
		'headingPlaceholder'        => null,
	);

	private static function root() {
		return dirname( __DIR__, 2 );
	}

	public function test_every_style_has_every_field() {
		$styles = bibliography_builder_get_style_data()['styles'];

		$this->assertNotEmpty( $styles );

		foreach ( $styles as $key => $style ) {
			$this->assertSame( array_keys( self::FIELDS ), array_keys( $style ), $key );
			$this->assertIsBool( $style['enabled'], $key );

			foreach ( self::FIELDS as $field => $allowed ) {
				if ( 'enabled' === $field ) {
					continue;
				}

				$this->assertIsString( $style[ $field ], "$key.$field" );
				$this->assertNotSame( '', $style[ $field ], "$key.$field" );

				if ( null !== $allowed ) {
					$this->assertContains( $style[ $field ], $allowed, "$key.$field" );
				}
			}
		}
	}

	public function test_default_style_matches_block_json() {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$block = json_decode( file_get_contents( self::root() . '/block.json' ), true );

		$this->assertSame( $block['attributes']['citationStyle']['default'], bibliography_builder_default_style_key() );
		$this->assertArrayHasKey( bibliography_builder_default_style_key(), bibliography_builder_get_style_data()['styles'] );
	}

	public function test_templates_and_locales_are_bundled() {
		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			$this->assertFileExists( self::root() . '/packages/citation-style-language-styles/' . $style['cslTemplate'] . '.csl', $key );
			$this->assertFileExists( self::root() . '/packages/citation-style-language-locales/locales-' . $style['locale'] . '.xml', $key );
		}
	}

	public function test_php_readers_return_the_json() {
		$styles = bibliography_builder_get_style_data()['styles'];

		$this->assertSame( array_keys( $styles ), array_keys( bibliography_builder_get_formatter_style_definitions() ) );

		foreach ( $styles as $key => $style ) {
			$this->assertSame(
				array(
					'template' => $style['cslTemplate'],
					'locale'   => $style['locale'],
					'family'   => $style['family'],
				),
				bibliography_builder_get_formatter_style_definition( $key ),
				$key
			);
			$this->assertSame(
				array(
					'key'                       => $key,
					'listType'                  => $style['listType'],
					'family'                    => $style['family'],
					'locale'                    => $style['locale'],
					'demoteNonDroppingParticle' => $style['demoteNonDroppingParticle'],
				),
				bibliography_builder_get_save_style_definition( $key ),
				$key
			);
			$this->assertSame( $style['headingPlaceholder'], bibliography_builder_write_default_heading( $key ), $key );
		}
	}

	public function test_unknown_styles_fall_back_to_the_default() {
		$default = bibliography_builder_default_style_key();

		$this->assertSame( bibliography_builder_get_formatter_style_definition( $default ), bibliography_builder_get_formatter_style_definition( 'nope' ) );
		$this->assertSame( $default, bibliography_builder_get_save_style_definition( 'nope' )['key'] );
		$this->assertSame( $default, bibliography_builder_get_save_style_definition( null )['key'] );
		$this->assertSame( 'Bibliography', bibliography_builder_write_default_heading( 'nope' ) );
	}
}
