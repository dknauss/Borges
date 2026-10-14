<?php

use PHPUnit\Framework\TestCase;

/**
 * The render filter that nests JSON-LD saved before 1.11.0
 * (includes/frontend-json-ld.php).
 */
final class FrontendJsonLdTest extends TestCase {
	private const DEPRECATIONS = __DIR__ . '/../fixtures/deprecations';
	private const PARITY       = __DIR__ . '/../fixtures/save-parity';

	private function fixture( string $path ): string {
		return rtrim( (string) file_get_contents( $path ), "\n" );
	}

	private function json_ld_script( string $markup ): string {
		$this->assertSame( 1, preg_match( '#<script type="application/ld\+json">.*?</script>#s', $markup, $match ) );

		return $match[0];
	}

	public function test_pre_1_11_markup_renders_the_current_item_list(): void {
		// v12 is save() from before 1.11.0 and v00 the current save(), for the
		// same attributes: once nested, the old JSON-LD must match what save()
		// now writes byte for byte.
		$legacy  = $this->fixture( self::DEPRECATIONS . '/v12-deprecated.html' );
		$current = $this->fixture( self::DEPRECATIONS . '/v00-current.html' );

		$this->assertStringContainsString( '<script type="application/ld+json">[', $legacy );
		$this->assertSame(
			$this->json_ld_script( $current ),
			$this->json_ld_script( bibliography_builder_nest_rendered_json_ld( $legacy ) )
		);
	}

	public function test_only_the_json_ld_script_changes(): void {
		$legacy   = $this->fixture( self::DEPRECATIONS . '/v12-deprecated.html' );
		$rendered = bibliography_builder_nest_rendered_json_ld( $legacy );
		$strip    = static function ( string $html ): string {
			return (string) preg_replace( '#<script type="application/ld\+json">.*?</script>#s', '', $html );
		};

		$this->assertSame( $strip( $legacy ), $strip( $rendered ) );
	}

	public function test_current_markup_passes_through_unchanged(): void {
		foreach ( glob( self::PARITY . '/*.html' ) as $path ) {
			$markup = $this->fixture( $path );
			$this->assertSame( $markup, bibliography_builder_nest_rendered_json_ld( $markup ), basename( $path ) );
		}

		$current = $this->fixture( self::DEPRECATIONS . '/v00-current.html' );
		$this->assertSame( $current, bibliography_builder_nest_rendered_json_ld( $current ) );
	}

	public function test_no_page_like_node_remains_at_the_top_level(): void {
		$legacy = '<section><script type="application/ld+json">[{"@context":"https://schema.org","@type":"WebPage","name":"Nemesis (Das große Glück)","author":[{"@type":"Organization","name":"Albertina"}]}]</script></section>';
		$script = $this->json_ld_script( bibliography_builder_nest_rendered_json_ld( $legacy ) );
		$json   = json_decode( (string) preg_replace( '#^<script[^>]*>|</script>$#', '', $script ), true );

		$this->assertSame( 'ItemList', $json['@type'] );
		$this->assertArrayNotHasKey( '@context', $json['itemListElement'][0]['item'] );
		$this->assertSame( 'Albertina', $json['itemListElement'][0]['item']['author'][0]['name'] );
	}

	public function test_escaping_survives_the_rewrite(): void {
		// Built by concatenation so this file holds a literal backslash and
		// "u003c", the escape save() writes for `<`, not the character itself.
		$lt       = '\\' . 'u003c';
		$payload  = $lt . '/script>' . $lt . 'script>alert(1)' . $lt . '/script>';
		$legacy   = '<script type="application/ld+json">[{"@context":"https://schema.org","@type":"WebPage","name":"' . $payload . '","x":{}}]</script>';
		$rendered = bibliography_builder_nest_rendered_json_ld( $legacy );

		$this->assertStringContainsString( '"@type":"ItemList"', $rendered );
		$this->assertSame( 1, substr_count( $rendered, '</script>' ) );
		$this->assertStringContainsString( $payload, $rendered );
		$this->assertStringContainsString( '"x":{}', $rendered );
	}

	public function test_unrecognized_json_ld_is_left_alone(): void {
		$cases = array(
			'not json'       => '<script type="application/ld+json">[not json</script>',
			'empty list'     => '<script type="application/ld+json">[]</script>',
			'untyped member' => '<script type="application/ld+json">[{"name":"x"}]</script>',
			'scalar member'  => '<script type="application/ld+json">["x"]</script>',
			'no json-ld'     => '<section><p>Plain</p></section>',
		);

		foreach ( $cases as $label => $markup ) {
			$this->assertSame( $markup, bibliography_builder_nest_rendered_json_ld( $markup ), $label );
		}

		$this->assertNull( bibliography_builder_nest_rendered_json_ld( null ) );
	}
}
