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
		$data  = json_decode( (string) file_get_contents( self::DIR . '/cases.json' ) );
		$cases = array();

		foreach ( $data->cases as $case ) {
			// Decode attributes the way a write route must: keeping JSON objects
			// an array cannot represent (empty or list-like keys) as objects.
			$cases[ $case->name ] = array( $case->name, bibliography_builder_normalize_save_json( $case->attributes ) );
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

	public function test_decoder_keeps_objects_an_array_cannot_represent(): void {
		$attributes = bibliography_builder_decode_save_attributes( '{"a":{},"b":{"0":"x"},"c":{"k":{}},"d":[{}],"e":[]}' );

		$this->assertSame( '{"a":{},"b":{"0":"x"},"c":{"k":{}},"d":[{}],"e":[]}', bibliography_builder_json_stringify( $attributes ) );
		$this->assertIsArray( $attributes['c'] );
		$this->assertNull( bibliography_builder_decode_save_attributes( '[1]' ) );
		$this->assertNull( bibliography_builder_decode_save_attributes( 'not json' ) );
	}

	public function test_bracketed_hosts_must_be_valid_ipv6(): void {
		$this->assertTrue( bibliography_builder_save_is_linkable_url( 'https://[::1]/x' ) );
		$this->assertTrue( bibliography_builder_save_is_linkable_url( 'http://[2001:db8::1]:8080' ) );
		$this->assertFalse( bibliography_builder_save_is_linkable_url( 'https://[dead]' ) );
		$this->assertFalse( bibliography_builder_save_is_linkable_url( 'https://[::1]:99999' ) );
		$this->assertFalse( bibliography_builder_save_is_linkable_url( 'https://[bad' ) );
	}
}
