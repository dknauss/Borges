<?php

use PHPUnit\Framework\TestCase;

/**
 * Render-time JSON-LD enrichment and the page-to-works `citation` edge
 * (includes/json-ld-enrichment.php).
 */
final class JsonLdEnrichmentTest extends TestCase {
	private const PAGE = 'https://example.com/a-post/';

	protected function setUp(): void {
		remove_all_filters( 'bibliography_builder_json_ld_page_url' );
		remove_all_filters( 'bibliography_builder_enrich_json_ld' );
		remove_all_filters( 'bibliography_builder_link_page_citations' );
		add_filter(
			'bibliography_builder_json_ld_page_url',
			static function () {
				return self::PAGE;
			}
		);
	}

	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_json_ld_page_url' );
		remove_all_filters( 'bibliography_builder_enrich_json_ld' );
		remove_all_filters( 'bibliography_builder_link_page_citations' );
	}

	private function content(): string {
		return rtrim( (string) file_get_contents( __DIR__ . '/../fixtures/deprecations/v00-current.html' ), "\n" );
	}

	private function fixture(): array {
		$blocks = array_values(
			array_filter(
				( new WP_Block_Parser() )->parse( $this->content() ),
				static function ( $block ) {
					return ! empty( $block['blockName'] );
				}
			)
		);

		return $blocks[0];
	}

	private function json_ld( string $html ): array {
		$this->assertSame( 1, preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $match ) );

		return json_decode( $match[1], true );
	}

	private function render( array $block ): string {
		return bibliography_builder_enrich_rendered_json_ld( $block['innerHTML'], $block );
	}

	public function test_list_gains_an_id_name_and_count(): void {
		$list = $this->json_ld( $this->render( $this->fixture() ) );

		$this->assertSame( 'ItemList', $list['@type'] );
		$this->assertSame( self::PAGE . '#bibliography-bib-fixture', $list['@id'] );
		$this->assertSame( 'References', $list['name'] );
		$this->assertSame( 2, $list['numberOfItems'] );
	}

	public function test_entries_point_at_their_visible_anchors(): void {
		$block    = $this->fixture();
		$html     = $this->render( $block );
		$elements = $this->json_ld( $html )['itemListElement'];

		$this->assertSame( self::PAGE . '#ref-alpha2018', $elements[0]['url'] );
		$this->assertSame( self::PAGE . '#ref-zeta2020', $elements[1]['url'] );
		$this->assertStringContainsString( 'id="ref-alpha2018"', $html );
	}

	public function test_works_gain_page_ids_and_journal_chain(): void {
		$elements = $this->json_ld( $this->render( $this->fixture() ) )['itemListElement'];
		$book     = $elements[0]['item'];
		$article  = $elements[1]['item'];

		$this->assertSame( self::PAGE . '#ref-alpha2018', $book['@id'] );
		$this->assertSame( 'Cambridge', $book['publisher']['location'] );

		$this->assertSame( 'PublicationIssue', $article['isPartOf']['@type'] );
		$this->assertSame( '2', $article['isPartOf']['issueNumber'] );
		$this->assertSame( 'PublicationVolume', $article['isPartOf']['isPartOf']['@type'] );
		$this->assertSame( '4', $article['isPartOf']['isPartOf']['volumeNumber'] );
		$this->assertSame( 'Journal of Block Testing', $article['isPartOf']['isPartOf']['isPartOf']['name'] );
		$this->assertSame( '10', $article['pageStart'] );
		$this->assertSame( '20', $article['pageEnd'] );
		$this->assertSame( '10-20', $article['pagination'] );
	}

	public function test_only_the_json_ld_script_changes(): void {
		$block = $this->fixture();
		$strip = static function ( string $html ): string {
			return (string) preg_replace( '#<script type="application/ld\+json">.*?</script>#s', '', $html );
		};

		$this->assertSame( $strip( $block['innerHTML'] ), $strip( $this->render( $block ) ) );
	}

	public function test_identifiers_become_same_as_links(): void {
		$work = bibliography_builder_enrich_json_ld_work(
			bibliography_builder_save_csl_to_json_ld(
				array(
					'type'     => 'article-journal',
					'title'    => 'A paper',
					'DOI'      => '10.1000/xyz',
					'PMID'     => '12345',
					'PMCID'    => 'PMC678',
					'language' => 'de',
					'editor'   => array( array( 'family' => 'Ed', 'given' => 'Ida' ) ),
				)
			),
			array(
				'type'     => 'article-journal',
				'title'    => 'A paper',
				'DOI'      => '10.1000/xyz',
				'PMID'     => '12345',
				'PMCID'    => 'PMC678',
				'language' => 'de',
				'editor'   => array( array( 'family' => 'Ed', 'given' => 'Ida' ) ),
			),
			'p1',
			self::PAGE
		);

		$this->assertSame( 'https://doi.org/10.1000/xyz', $work['@id'] );
		$this->assertSame(
			array( 'DOI', 'PMID', 'PMCID' ),
			array_column( $work['identifier'], 'propertyID' )
		);
		$this->assertSame(
			array(
				'https://pubmed.ncbi.nlm.nih.gov/12345/',
				'https://pmc.ncbi.nlm.nih.gov/articles/PMC678/',
			),
			$work['sameAs']
		);
		$this->assertSame( 'de', $work['inLanguage'] );
		$this->assertSame( 'Ida Ed', $work['editor'][0]['name'] );
	}

	public function test_arxiv_and_refined_types(): void {
		$csl  = array(
			'type'   => 'article',
			'title'  => 'A preprint',
			'number' => 'arXiv:2301.00001',
			'URL'    => 'https://arxiv.org/abs/2301.00001v2',
		);
		$work = bibliography_builder_enrich_json_ld_work( bibliography_builder_save_csl_to_json_ld( $csl ), $csl, 'x', '' );

		$this->assertSame( 'ScholarlyArticle', $work['@type'] );
		$this->assertArrayNotHasKey( '@id', $work );
		$this->assertSame( 'arXiv', $work['identifier']['propertyID'] );
		$this->assertSame( 'https://arxiv.org/abs/2301.00001', $work['sameAs'] );

		// A type save() already chose is left alone.
		$book = array(
			'type'  => 'book',
			'title' => 'B',
		);
		$this->assertSame( 'Book', bibliography_builder_enrich_json_ld_work( bibliography_builder_save_csl_to_json_ld( $book ), $book, 'b', '' )['@type'] );
	}

	public function test_filter_turns_enrichment_off(): void {
		add_filter(
			'bibliography_builder_enrich_json_ld',
			static function () {
				return false;
			}
		);
		$block = $this->fixture();

		$this->assertSame( $block['innerHTML'], $this->render( $block ) );
	}

	public function test_misaligned_markup_keeps_its_works(): void {
		$block               = $this->fixture();
		$block['innerHTML']  = str_replace( 'id="ref-alpha2018"', '', $block['innerHTML'] );
		$before              = $this->json_ld( $block['innerHTML'] );
		$list                = $this->json_ld( $this->render( $block ) );

		$this->assertSame( $before['itemListElement'], $list['itemListElement'] );
		$this->assertSame( self::PAGE . '#bibliography-bib-fixture', $list['@id'] );
	}

	public function test_page_refs_match_the_list_ids(): void {
		$post = (object) array( 'post_content' => $this->content() );
		bibliography_builder_test_set_parsed_blocks( $post->post_content, ( new WP_Block_Parser() )->parse( $post->post_content ) );
		$refs = bibliography_builder_get_cited_work_refs( $post, self::PAGE );
		$ids  = array_column( array_column( $this->json_ld( $this->render( $this->fixture() ) )['itemListElement'], 'item' ), '@id' );

		$this->assertEqualsCanonicalizing( $ids, array_column( $refs, '@id' ) );
		$this->assertSame( array( '@type', '@id', 'name' ), array_keys( $refs[0] ) );
	}

	public function test_seo_graph_nodes_gain_citations(): void {
		$refs = array(
			array(
				'@type' => 'Book',
				'@id'   => 'x',
			),
		);

		$this->assertSame( $refs, bibliography_builder_add_citations_to_node( array( '@type' => 'Article' ), $refs )['citation'] );

		$merged = bibliography_builder_add_citations_to_node( array( 'citation' => array( '@id' => 'y' ) ), $refs );
		$this->assertSame( array( array( '@id' => 'y' ), $refs[0] ), $merged['citation'] );

		// Without a singular queried post there is nothing to add.
		$data = array( 'richSnippet' => array( '@type' => 'BlogPosting' ) );
		$this->assertSame( $data, bibliography_builder_rank_math_json_ld( $data ) );
	}
}
