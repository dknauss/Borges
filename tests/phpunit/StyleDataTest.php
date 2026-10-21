<?php
/**
 * Tests for the shared citation style table, `includes/styles.json`.
 *
 * The editor imports the same file, so these checks guard both languages.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

/**
 * Shape and consistency of the shared style table.
 */
final class StyleDataTest extends TestCase {
	/**
	 * Every field the editor and the PHP helpers read, with its allowed values
	 * (null for free text).
	 *
	 * @var array<string, array<int, string|bool>|null>
	 */
	private const FIELDS = array(
		'key'                       => null,
		'label'                     => null,
		'enabled'                   => array( true, false ),
		'backend'                   => array( 'csl' ),
		'cslTemplate'               => null,
		'cslLocale'                 => null,
		'locale'                    => null,
		'family'                    => array( 'notes', 'author-date', 'numeric' ),
		'listType'                  => array( 'ul', 'ol' ),
		'inlineCitationMode'        => array( 'note', 'parenthetical', 'numeric' ),
		'demoteNonDroppingParticle' => array( 'never', 'sort-only', 'display-and-sort' ),
		'headingPlaceholder'        => null,
	);

	public function test_the_table_decodes_and_names_an_existing_default(): void {
		$data = bibliography_builder_get_style_data();

		$this->assertNotEmpty( $data['styles'] );
		$this->assertArrayHasKey( $data['defaultStyle'], $data['styles'] );
	}

	public function test_every_style_has_every_field_with_an_allowed_value(): void {
		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			$this->assertSame( array_keys( self::FIELDS ), array_keys( $style ), $key );
			$this->assertSame( $key, $style['key'] );

			foreach ( self::FIELDS as $field => $allowed ) {
				if ( null === $allowed ) {
					$this->assertIsString( $style[ $field ], "$key.$field" );
					$this->assertNotSame( '', $style[ $field ], "$key.$field" );
				} else {
					$this->assertContains( $style[ $field ], $allowed, "$key.$field" );
				}
			}
		}
	}

	public function test_every_template_and_locale_ships_with_the_plugin(): void {
		$root = dirname( __DIR__, 2 ) . '/packages/';

		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			$this->assertFileExists( $root . 'citation-style-language-styles/' . $style['cslTemplate'] . '.csl', $key );
			$this->assertFileExists( $root . 'citation-style-language-locales/locales-' . $style['cslLocale'] . '.xml', $key );
		}
	}

	public function test_the_php_helpers_read_the_table(): void {
		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			$this->assertSame(
				array(
					'template' => $style['cslTemplate'],
					'locale'   => $style['cslLocale'],
					'family'   => $style['family'],
				),
				bibliography_builder_get_formatter_style_definition( $key ),
				$key
			);

			$save = bibliography_builder_get_save_style_definition( $key );
			foreach ( array( 'listType', 'family', 'locale', 'demoteNonDroppingParticle' ) as $field ) {
				$this->assertSame( $style[ $field ], $save[ $field ], "$key.$field" );
			}
		}

		$this->assertSame( 'chicago-notes-bibliography', bibliography_builder_get_save_style_definition( 'unknown-style' )['key'] );
	}
}
