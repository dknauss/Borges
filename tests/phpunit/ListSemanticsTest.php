<?php

use PHPUnit\Framework\TestCase;

/**
 * The render filter that keeps the bibliography a list for screen readers
 * (includes/list-semantics.php).
 */
final class ListSemanticsTest extends TestCase {
	private const PARITY = __DIR__ . '/../fixtures/save-parity';

	private function fixture( string $name ): string {
		return rtrim( (string) file_get_contents( self::PARITY . '/' . $name . '.html' ), "\n" );
	}

	public function test_every_bibliography_list_gets_the_list_role(): void {
		foreach ( glob( self::PARITY . '/*.html' ) as $path ) {
			$html     = rtrim( (string) file_get_contents( $path ), "\n" );
			$rendered = bibliography_builder_add_list_roles( $html );
			$lists    = preg_match_all( '/<(?:ul|ol)\s[^>]*class="bibliography-builder-list[\s"]/', $html );
			$this->assertSame(
				$lists,
				preg_match_all( '/<(?:ul|ol) role="list"\s[^>]*class="bibliography-builder-list[\s"]/', $rendered ),
				basename( $path )
			);
		}
	}

	public function test_only_the_opening_tags_change(): void {
		$html     = $this->fixture( 'oscola-tables' );
		$rendered = bibliography_builder_add_list_roles( $html );

		$this->assertNotSame( $html, $rendered );
		$this->assertSame( $html, str_replace( ' role="list"', '', $rendered ) );
		$this->assertStringContainsString( 'role="list" class="bibliography-builder-list bibliography-builder-list-unordered bibliography-builder-list-oscola" aria-labelledby=', $rendered );
	}

	public function test_numbered_lists_get_the_role(): void {
		$html = '<ol class="bibliography-builder-list bibliography-builder-list-numeric bibliography-builder-list-ieee"><li>A</li></ol>';

		$this->assertSame(
			'<ol role="list" class="bibliography-builder-list bibliography-builder-list-numeric bibliography-builder-list-ieee"><li>A</li></ol>',
			bibliography_builder_add_list_roles( $html )
		);
	}

	public function test_other_lists_and_existing_roles_are_left_alone(): void {
		$html = '<ul class="bibliography-builder-export-links"><li>RIS</li></ul>'
			. '<ul role="presentation" class="bibliography-builder-list"><li>A</li></ul>'
			. '<ul class="bibliography-builder-listing"><li>B</li></ul>';

		$this->assertSame( $html, bibliography_builder_add_list_roles( $html ) );
	}

	public function test_non_strings_pass_through(): void {
		$this->assertNull( bibliography_builder_add_list_roles( null ) );
		$this->assertSame( '', bibliography_builder_add_list_roles( '' ) );
	}
}
