<?php

use PHPUnit\Framework\TestCase;

/**
 * PHP half of the save-markup parity contract; see src/save-parity.test.js.
 *
 * Each case in tests/fixtures/save-parity/cases.json is rendered by the PHP
 * port and compared with the committed <name>.html, which the Jest half checks
 * against the JS save(). Regenerate the committed markup with
 * BORGES_WRITE_SAVE_PARITY_FIXTURES=1 and review the diff.
 */
final class SaveMarkupParityTest extends TestCase {
	private const DIR = __DIR__ . '/../fixtures/save-parity';

	public static function cases(): array {
		$data  = json_decode( (string) file_get_contents( self::DIR . '/cases.json' ), true );
		$cases = array();

		foreach ( $data['cases'] as $case ) {
			$cases[ $case['name'] ] = array( $case['name'], $case['attributes'] );
		}

		return $cases;
	}

	/**
	 * @dataProvider cases
	 */
	#[\PHPUnit\Framework\Attributes\DataProvider( 'cases' )]
	public function test_php_render_matches_committed_markup( string $name, array $attributes ): void {
		$this->assertTrue( bibliography_builder_can_render_save_markup() );

		$markup = bibliography_builder_render_save_markup( $attributes );
		$path   = self::DIR . '/' . $name . '.html';

		if ( getenv( 'BORGES_WRITE_SAVE_PARITY_FIXTURES' ) ) {
			file_put_contents( $path, $markup . "\n" );
		}

		$this->assertFileExists( $path );
		$this->assertSame( rtrim( (string) file_get_contents( $path ), "\n" ), $markup );
	}
}
