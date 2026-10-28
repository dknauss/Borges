<?php
/**
 * Render-time enrichment of COinS spans (includes/coins-enrichment.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\Attributes\DataProvider;
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

	public function test_later_authors_and_the_pmid_are_added(): void {
		$coins = $this->coins( $this->render( $this->fixture() ) );

		// The first author stays in rft.aulast and rft.aufirst only.
		$this->assertContains( array( 'rft.aulast', 'Alpha' ), $coins[0] );
		$this->assertNotContains( array( 'rft.au', 'Alpha, Ada' ), $coins[0] );
		$this->assertContains( array( 'rft.au', 'Test & Co.,' ), $coins[0] );
		$this->assertStringNotContainsString( 'rft.aucorp', implode( '&', array_column( $coins[0], 0 ) ) );
		$this->assertNotContains( array( 'rft_id', 'info:pmid/31452104' ), $coins[0] );

		$this->assertNotContains( array( 'rft.au', 'Zeta, Zoe' ), $coins[1] );
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

	/**
	 * The author list a COinS reader builds from one span, in order.
	 *
	 * A model of how Zotero's OpenURL reader (zotero/utilities, openurl.js)
	 * reads authors, the reader Zotero's browser connector uses for COinS:
	 *
	 * - `rft.au` names are listed in the order they come, split at the comma
	 *   into last and first name (a trailing comma leaves no first name), or
	 *   at the last space without one. Zotero also trims other punctuation
	 *   and spaces out initials, which this model leaves out.
	 * - `rft.aulast`, `rft.aufirst`, and `rft.aucorp` build a second list:
	 *   `aulast` and `aufirst` fill in the latest name there when it lacks
	 *   that part, and otherwise start a new one. An `aulast`/`aufirst` name
	 *   remembers how many `rft.au` names came before it and is put back at
	 *   that place; an `aucorp` name remembers nothing and goes to the front.
	 * - A name from the second list is dropped when an `rft.au` name has its
	 *   last name and a non-empty first name that starts with its first name.
	 *   A dropped-name check against a name with no first name throws.
	 *
	 * zotero-coins.mjs in tools/markup-value runs the same cases through
	 * Zotero's own reader, which is AGPL-licensed and so not kept here.
	 *
	 * @return string[] "Last, First", "Last", or "[org] Name".
	 */
	private static function read_authors( string $kev ): array {
		$plain   = array();
		$complex = array();

		foreach ( explode( '&', $kev ) as $pair ) {
			list( $key, $value ) = array_pad( explode( '=', $pair, 2 ), 2, '' );
			$value               = rawurldecode( $value );
			$last                = end( $complex );

			if ( '' === $value ) {
				continue;
			}

			if ( 'rft.au' === $key ) {
				// The comma is looked for before the trim, so "Name," is one last name.
				$inverted = false !== strpos( $value, ',' );
				$value    = trim( $value, " \t," );
				if ( $inverted ) {
					list( $family, $given ) = array_map( 'trim', array_pad( explode( ',', $value, 2 ), 2, '' ) );
				} else {
					$space  = strrpos( $value, ' ' );
					$family = false === $space ? $value : substr( $value, $space + 1 );
					$given  = false === $space ? '' : substr( $value, 0, $space );
				}
				$plain[] = array(
					'last'  => $family,
					'first' => $given,
				);
			} elseif ( 'rft.aulast' === $key && $last && ! isset( $last['last'] ) ) {
				$complex[ count( $complex ) - 1 ]['last'] = $value;
			} elseif ( 'rft.aufirst' === $key && $last && ! isset( $last['first'] ) ) {
				$complex[ count( $complex ) - 1 ]['first'] = $value;
			} elseif ( in_array( $key, array( 'rft.aulast', 'rft.aufirst', 'rft.aucorp' ), true ) ) {
				$complex[] = array(
					( 'rft.aufirst' === $key ? 'first' : 'last' ) => $value,
					'org'                                          => 'rft.aucorp' === $key,
					'offset'                                       => 'rft.aucorp' === $key ? null : count( $plain ),
				);
			}
		}

		$names    = $plain;
		$inserted = 0;

		foreach ( $complex as $name ) {
			foreach ( $plain as $other ) {
				if ( isset( $name['last'] ) && $other['last'] === $name['last'] && '' !== $other['first'] ) {
					if ( ! isset( $name['first'] ) ) {
						throw new RuntimeException( 'Reader fails on ' . $name['last'] );
					}
					if ( 0 === strpos( $other['first'], $name['first'] ) ) {
						continue 2;
					}
				}
			}
			array_splice( $names, null === $name['offset'] ? 0 : $name['offset'] + $inserted, 0, array( $name ) );
			++$inserted;
		}

		return array_map(
			static function ( $name ) {
				$parts = array_filter( array( $name['last'] ?? '', $name['first'] ?? '' ), 'strlen' );
				return ( ! empty( $name['org'] ) ? '[org] ' : '' ) . implode( ', ', $parts );
			},
			$names
		);
	}

	/**
	 * One span saved for the given authors, then enriched, as a decoded KEV string.
	 */
	private static function enriched_kev( array $authors ): string {
		$csl   = array(
			'id'     => 'c',
			'type'   => 'article-journal',
			'title'  => 'T',
			'author' => $authors,
		);
		$saved = bibliography_builder_escape_save_attribute( bibliography_builder_save_build_coins( $csl ) );
		$html  = bibliography_builder_enrich_rendered_coins(
			'<ul><li id="ref-c"><span class="Z3988" aria-hidden="true" title="' . $saved . '"></span></li></ul>',
			array(
				'attrs' => array(
					'citations' => array(
						array(
							'id'  => 'c',
							'csl' => $csl,
						),
					),
				),
			)
		);
		preg_match( '#title="([^"]*)"#', $html, $match );

		return html_entity_decode( $match[1], ENT_QUOTES, 'UTF-8' );
	}

	/**
	 * @return array<string, array{0: array, 1: string[]}>
	 */
	public static function author_lists(): array {
		$ada   = array(
			'family' => 'Alpha',
			'given'  => 'Ada',
		);
		$ben   = array(
			'family' => 'Beta',
			'given'  => 'Ben',
		);
		$org   = array( 'literal' => 'World Health Organization' );
		$plato = array( 'family' => 'Plato' );

		return array(
			'people'                          => array( array( $ada, $ben, array( 'family' => 'Gamma', 'given' => 'G.A.' ) ), array( 'Alpha, Ada', 'Beta, Ben', 'Gamma, G.A.' ) ),
			'organization first'              => array( array( $org, $ben ), array( 'World Health Organization', 'Beta, Ben' ) ),
			'organization among people'       => array( array( $ada, $org, $ben ), array( 'Alpha, Ada', 'World Health Organization', 'Beta, Ben' ) ),
			'one-part name first'             => array( array( $plato, $ben ), array( 'Plato', 'Beta, Ben' ) ),
			'given name only first'           => array( array( array( 'given' => 'Homer' ), $ben ), array( 'Homer', 'Beta, Ben' ) ),
			'one-part names later'            => array( array( $ada, $plato, array( 'given' => 'Homer' ) ), array( 'Alpha, Ada', 'Plato', 'Homer' ) ),
			'compound one-part names later'   => array( array( array( 'family' => 'Waals' ), array( 'family' => 'van der Waals' ), array( 'given' => 'Ali ibn Musa' ) ), array( 'Waals', 'van der Waals', 'Ali ibn Musa' ) ),
			'shared last name, initials'      => array( array( array( 'family' => 'Kim', 'given' => 'J.' ), array( 'family' => 'Kim', 'given' => 'J.-H.' ) ), array( 'Kim, J.', 'Kim, J.-H.' ) ),
			'shared last name, one-part name' => array( array( $plato, array( 'family' => 'Plato', 'given' => 'Jane' ), $org ), array( 'Plato', 'Plato, Jane', 'World Health Organization' ) ),
			'one author'                      => array( array( $ada ), array( 'Alpha, Ada' ) ),
			'empty first name entry'          => array( array( array(), $ada, $ben ), array( 'Alpha, Ada', 'Beta, Ben' ) ),
		);
	}

	#[DataProvider( 'author_lists' )]
	public function test_reader_gets_every_author_once_in_order( array $authors, array $expected ): void {
		$this->assertSame( $expected, self::read_authors( self::enriched_kev( $authors ) ) );
	}

	public function test_reader_model_shows_the_old_duplicates(): void {
		// What listing every author as rft.au gave, which this filter no longer writes.
		$this->assertSame(
			array( 'Plato', 'Plato', 'Beta, Ben' ),
			self::read_authors( 'rft.aulast=Plato&rft.au=Plato&rft.au=Beta%2C%20Ben' )
		);
		$this->assertSame(
			array( '[org] World Health Organization', 'World Health Organization', 'Beta, Ben' ),
			self::read_authors( 'rft.aulast=World%20Health%20Organization&rft.aucorp=World%20Health%20Organization&rft.au=Beta%2C%20Ben' )
		);
		// An organization written as rft.aucorp moves ahead of the first author.
		$this->assertSame(
			array( '[org] CERN', 'Alpha, Ada', 'Beta, Ben' ),
			self::read_authors( 'rft.aulast=Alpha&rft.aufirst=Ada&rft.aucorp=CERN&rft.au=Beta%2C%20Ben' )
		);
	}

	public function test_one_author_leaves_the_span_as_saved(): void {
		$kev = self::enriched_kev(
			array(
				array(
					'family' => 'Alpha',
					'given'  => 'Ada',
				),
			)
		);

		$this->assertStringNotContainsString( 'rft.au=', $kev );
		$this->assertStringContainsString( 'rft.aulast=Alpha&rft.aufirst=Ada', $kev );
	}

	public function test_shared_last_name_lists_everyone_as_au(): void {
		$kev = self::enriched_kev(
			array(
				array(
					'family' => 'Kim',
					'given'  => 'J.',
				),
				array(
					'family' => 'Kim',
					'given'  => 'J.-H.',
				),
			)
		);

		$this->assertStringNotContainsString( 'rft.aulast=', $kev );
		$this->assertStringContainsString( 'rft.au=Kim%2C%20J.&rft.au=Kim%2C%20J.-H.', $kev );
	}

	/**
	 * One CSL item's saved COinS span, enriched as it renders, as key-value
	 * pairs in order.
	 *
	 * @return array<int, array{0: string, 1: string}>
	 */
	private static function enriched_pairs( array $csl ): array {
		$csl['id'] = 'c';
		$saved     = bibliography_builder_escape_save_attribute( bibliography_builder_save_build_coins( $csl ) );
		$html      = bibliography_builder_enrich_rendered_coins(
			'<ul><li id="ref-c"><span class="Z3988" aria-hidden="true" title="' . $saved . '"></span></li></ul>',
			array(
				'attrs' => array(
					'citations' => array(
						array(
							'id'  => 'c',
							'csl' => $csl,
						),
					),
				),
			)
		);
		preg_match( '#title="([^"]*)"#', $html, $match );

		return array_map(
			static function ( $pair ) {
				list( $key, $value ) = explode( '=', $pair, 2 );
				return array( $key, rawurldecode( $value ) );
			},
			explode( '&', html_entity_decode( $match[1], ENT_QUOTES, 'UTF-8' ) )
		);
	}

	public function test_a_chapter_gets_its_genre_and_pages(): void {
		$pairs = self::enriched_pairs(
			array(
				'type'            => 'chapter',
				'title'           => 'The library of Babel',
				'container-title' => 'Labyrinths',
				'publisher'       => 'New Directions',
				'page'            => '51–58',
			)
		);

		$this->assertContains( array( 'rft_val_fmt', 'info:ofi/fmt:kev:mtx:book' ), $pairs );
		$this->assertContains( array( 'rft.genre', 'bookitem' ), $pairs );
		$this->assertContains( array( 'rft.spage', '51' ), $pairs );
		$this->assertContains( array( 'rft.epage', '58' ), $pairs );
		$this->assertContains( array( 'rft.pub', 'New Directions' ), $pairs );
	}

	public function test_a_conference_paper_moves_to_the_book_format(): void {
		$pairs = self::enriched_pairs(
			array(
				'type'            => 'paper-conference',
				'title'           => 'BERT',
				'container-title' => 'Proceedings of NAACL',
				'publisher'       => 'Association for Computational Linguistics',
				'publisher-place' => 'Minneapolis',
				'page'            => '4171-4186',
			)
		);
		$keys  = array_column( $pairs, 0 );

		$this->assertContains( array( 'rft_val_fmt', 'info:ofi/fmt:kev:mtx:book' ), $pairs );
		$this->assertNotContains( 'rft.jtitle', $keys );
		$this->assertContains( array( 'rft.btitle', 'Proceedings of NAACL' ), $pairs );
		$this->assertContains( array( 'rft.atitle', 'BERT' ), $pairs );
		$this->assertContains( array( 'rft.genre', 'proceeding' ), $pairs );
		$this->assertContains( array( 'rft.pub', 'Association for Computational Linguistics' ), $pairs );
		$this->assertContains( array( 'rft.place', 'Minneapolis' ), $pairs );
		$this->assertSame( 1, count( array_keys( $keys, 'rft.spage', true ) ) );
	}

	public function test_a_report_is_titled_in_the_book_format(): void {
		$pairs = self::enriched_pairs(
			array(
				'type'            => 'report',
				'title'           => 'Annual report',
				'container-title' => 'Working papers',
				'publisher'       => 'Institute',
			)
		);
		$keys  = array_column( $pairs, 0 );

		$this->assertContains( array( 'rft.genre', 'report' ), $pairs );
		$this->assertContains( array( 'rft.btitle', 'Annual report' ), $pairs );
		$this->assertContains( array( 'rft.series', 'Working papers' ), $pairs );
		$this->assertNotContains( 'rft.atitle', $keys );
		$this->assertContains( array( 'rft.pub', 'Institute' ), $pairs );
	}

	public function test_book_edition_journal_issn_and_urls_are_added(): void {
		$book = self::enriched_pairs(
			array(
				'type'      => 'book',
				'title'     => 'Introduction to algorithms',
				'edition'   => '3',
				'publisher' => 'MIT Press',
				'page'      => '1292',
			)
		);

		$this->assertContains( array( 'rft.genre', 'book' ), $book );
		$this->assertContains( array( 'rft.edition', '3' ), $book );
		// A book's CSL page count is not a page range.
		$this->assertNotContains( 'rft.pages', array_column( $book, 0 ) );

		$preprint = self::enriched_pairs(
			array(
				'type'  => 'article',
				'title' => 'Attention is all you need',
				'URL'   => 'https://arxiv.org/abs/1706.03762',
				'ISSN'  => '1234-5678',
			)
		);

		$this->assertContains( array( 'rft.genre', 'preprint' ), $preprint );
		$this->assertContains( array( 'rft_id', 'https://arxiv.org/abs/1706.03762' ), $preprint );
		$this->assertContains( array( 'rft.issn', '1234-5678' ), $preprint );

		$article = self::enriched_pairs(
			array(
				'type'  => 'article-journal',
				'title' => 'T',
				'URL'   => 'javascript:alert(1)',
			)
		);

		$this->assertContains( array( 'rft.genre', 'article' ), $article );
		$this->assertNotContains( 'rft_id', array_column( $article, 0 ) );
	}

	public function test_a_web_page_gets_no_genre(): void {
		$pairs = self::enriched_pairs(
			array(
				'type'            => 'webpage',
				'title'           => 'Block editor handbook',
				'container-title' => 'WordPress Developer Resources',
				'URL'             => 'https://developer.wordpress.org/block-editor/',
			)
		);

		$this->assertNotContains( 'rft.genre', array_column( $pairs, 0 ) );
		$this->assertContains( array( 'rft_id', 'https://developer.wordpress.org/block-editor/' ), $pairs );
	}
}
