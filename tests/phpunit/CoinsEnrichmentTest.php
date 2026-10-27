<?php
/**
 * Render-time enrichment of COinS spans (includes/coins-enrichment.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class CoinsEnrichmentTest extends TestCase {
	protected function setUp(): void {
		remove_all_filters( 'bibliography_builder_enrich_coins' );
	}

	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_enrich_coins' );
	}

	/**
	 * The current-markup fixture, with its stored CSL changed so the saved
	 * spans lack what the filter adds.
	 */
	private function fixture(): array {
		$content = rtrim( (string) file_get_contents( __DIR__ . '/../fixtures/deprecations/v00-current.html' ), "\n" );
		$blocks  = array_values(
			array_filter(
				( new WP_Block_Parser() )->parse( $content ),
				static function ( $block ) {
					return ! empty( $block['blockName'] );
				}
			)
		);
		$block   = $blocks[0];

		// Stored order (zeta, alpha) differs from the rendered order, so this
		// also checks that spans are matched by anchor, not by position.
		foreach ( $block['attrs']['citations'] as &$citation ) {
			if ( 'alpha2018' === $citation['id'] ) {
				$citation['csl']['author'][] = array( 'literal' => 'Test & Co.' );
			} else {
				$citation['csl']['author'][] = array(
					'family' => 'Ypsilon',
					'given'  => 'Yves',
				);
				$citation['csl']['PMID']     = '31452104';
			}
		}
		unset( $citation );

		return $block;
	}

	/**
	 * Every COinS title in the HTML, decoded into key-value pairs.
	 *
	 * @return array<int, array<int, array{0: string, 1: string}>>
	 */
	private function coins( string $html ): array {
		preg_match_all( '#<span class="Z3988"[^>]*?\stitle="([^"]*)"#', $html, $matches );

		return array_map(
			static function ( $title ) {
				return array_map(
					static function ( $pair ) {
						list( $key, $value ) = explode( '=', $pair, 2 );
						return array( $key, rawurldecode( $value ) );
					},
					explode( '&', html_entity_decode( $title, ENT_QUOTES, 'UTF-8' ) )
				);
			},
			$matches[1]
		);
	}

	private function render( array $block ): string {
		return bibliography_builder_enrich_rendered_coins( $block['innerHTML'], $block );
	}

	public function test_every_author_and_the_pmid_are_added(): void {
		$coins = $this->coins( $this->render( $this->fixture() ) );

		// The first author keeps rft.aulast and rft.aufirst, then every author follows.
		$this->assertContains( array( 'rft.aulast', 'Alpha' ), $coins[0] );
		$this->assertContains( array( 'rft.au', 'Alpha, Ada' ), $coins[0] );
		$this->assertContains( array( 'rft.aucorp', 'Test & Co.' ), $coins[0] );
		$this->assertNotContains( array( 'rft_id', 'info:pmid/31452104' ), $coins[0] );

		$this->assertContains( array( 'rft.au', 'Zeta, Zoe' ), $coins[1] );
		$this->assertContains( array( 'rft.au', 'Ypsilon, Yves' ), $coins[1] );
		$this->assertContains( array( 'rft_id', 'info:pmid/31452104' ), $coins[1] );
	}

	public function test_only_the_coins_titles_change(): void {
		$block = $this->fixture();
		$strip = static function ( string $html ): string {
			return (string) preg_replace( '#(<span class="Z3988"[^>]*?\stitle=")[^"]*"#', '$1"', $html );
		};
		$html  = $this->render( $block );

		$this->assertNotSame( $block['innerHTML'], $html );
		$this->assertSame( $strip( $block['innerHTML'] ), $strip( $html ) );
		$this->assertStringNotContainsString( 'Test & Co', $html );
	}

	public function test_is_idempotent(): void {
		$block = $this->fixture();
		$once  = $this->render( $block );

		$this->assertSame( $once, bibliography_builder_enrich_rendered_coins( $once, $block ) );
	}

	public function test_filter_turns_enrichment_off(): void {
		add_filter(
			'bibliography_builder_enrich_coins',
			static function () {
				return false;
			}
		);
		$block = $this->fixture();

		$this->assertSame( $block['innerHTML'], $this->render( $block ) );
	}

	public function test_misaligned_markup_is_left_as_saved(): void {
		$block              = $this->fixture();
		$block['innerHTML'] = str_replace( 'id="ref-alpha2018"', '', $block['innerHTML'] );

		$this->assertSame( $block['innerHTML'], $this->render( $block ) );
	}

	public function test_markup_without_coins_is_untouched(): void {
		$this->assertSame( '<ul><li id="ref-a">A</li></ul>', bibliography_builder_enrich_rendered_coins( '<ul><li id="ref-a">A</li></ul>', array() ) );
		$this->assertNull( bibliography_builder_enrich_rendered_coins( null, array() ) );
	}

	public function test_names_without_a_family_name(): void {
		$params = bibliography_builder_coins_missing_params(
			array(
				'author' => array(
					array( 'given' => 'Plato' ),
					array(),
					'not a name',
				),
				'PMID'   => 'PMC123',
			),
			'ctx_ver=Z39.88-2004'
		);

		$this->assertSame( array( 'rft.au=Plato' ), $params );
	}
}
