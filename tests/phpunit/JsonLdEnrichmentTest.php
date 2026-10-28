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

	public function test_entries_carry_an_item_and_no_url(): void {
		$block    = $this->fixture();
		$html     = $this->render( $block );
		$elements = $this->json_ld( $html )['itemListElement'];

		// Google treats `url` and `item` on one ListItem as mutually exclusive.
		foreach ( $elements as $element ) {
			$this->assertArrayHasKey( 'item', $element );
			$this->assertArrayNotHasKey( 'url', $element );
		}
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

	public function test_page_node_links_the_cited_works_without_an_seo_plugin(): void {
		$post = (object) array( 'post_content' => $this->content() );
		bibliography_builder_test_set_parsed_blocks( $post->post_content, ( new WP_Block_Parser() )->parse( $post->post_content ) );
		$refs = bibliography_builder_get_cited_work_refs( $post, self::PAGE );
		$node = bibliography_builder_page_citation_node( $post, self::PAGE );

		$this->assertSame( 'WebPage', $node['@type'] );
		$this->assertSame( self::PAGE, $node['@id'] );
		$this->assertSame( $refs, $node['citation'] );

		// The same switch as the SEO plugin integrations turns it off.
		add_filter( 'bibliography_builder_link_page_citations', '__return_false' );
		$this->assertNull( bibliography_builder_page_citation_node( $post, self::PAGE ) );
		remove_all_filters( 'bibliography_builder_link_page_citations' );

		// So does returning null from its own filter.
		add_filter(
			'bibliography_builder_page_citation_node',
			static function () {
				return null;
			}
		);
		$this->assertNull( bibliography_builder_page_citation_node( $post, self::PAGE ) );
		remove_all_filters( 'bibliography_builder_page_citation_node' );

		// A post without a bibliography has nothing to link.
		$this->assertNull( bibliography_builder_page_citation_node( (object) array( 'post_content' => '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->' ), self::PAGE ) );
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

	private function enrich( array $csl ): array {
		return bibliography_builder_enrich_json_ld_work( bibliography_builder_save_csl_to_json_ld( $csl ), $csl, 'x', '' );
	}

	public function test_magazine_and_newspaper_articles_join_the_periodical_chain(): void {
		$magazine = $this->enrich(
			array(
				'type'            => 'article-magazine',
				'title'           => 'The Semantic Web',
				'container-title' => 'Scientific American',
				'ISSN'            => array( '0036-8733', '1946-7087' ),
				'volume'          => '284',
				'issue'           => '5',
			)
		);

		$this->assertSame( 'Article', $magazine['@type'] );
		$this->assertSame( 'PublicationIssue', $magazine['isPartOf']['@type'] );
		$this->assertSame( 'PublicationVolume', $magazine['isPartOf']['isPartOf']['@type'] );
		$this->assertSame(
			array(
				'@type' => 'Periodical',
				'name'  => 'Scientific American',
				'issn'  => '0036-8733',
			),
			$magazine['isPartOf']['isPartOf']['isPartOf']
		);

		$newspaper = $this->enrich(
			array(
				'type'            => 'article-newspaper',
				'title'           => 'A story',
				'container-title' => 'The Daily',
			)
		);

		$this->assertSame( 'NewsArticle', $newspaper['@type'] );
		$this->assertSame(
			array(
				'@type' => 'Periodical',
				'name'  => 'The Daily',
			),
			$newspaper['isPartOf']
		);
	}

	public function test_web_pages_and_blog_posts_are_part_of_a_website(): void {
		foreach ( array( 'webpage', 'post-weblog' ) as $type ) {
			$work = $this->enrich(
				array(
					'type'            => $type,
					'title'           => 'Block Editor Handbook',
					'container-title' => 'WordPress Developer Resources',
				)
			);

			$this->assertSame(
				array(
					'@type' => 'WebSite',
					'name'  => 'WordPress Developer Resources',
				),
				$work['isPartOf'],
				$type
			);
		}

		// No container title, no container.
		$this->assertArrayNotHasKey(
			'isPartOf',
			$this->enrich(
				array(
					'type'  => 'webpage',
					'title' => 'A page',
				)
			)
		);
	}

	public function test_reference_entries_are_part_of_their_reference_work(): void {
		foreach ( array( 'entry-encyclopedia', 'entry-dictionary', 'entry' ) as $type ) {
			$work = $this->enrich(
				array(
					'type'            => $type,
					'title'           => 'Isnād',
					'container-title' => 'Encyclopaedia Britannica',
				)
			);

			$this->assertSame(
				array(
					'@type' => 'CreativeWork',
					'name'  => 'Encyclopaedia Britannica',
				),
				$work['isPartOf'],
				$type
			);
		}
	}

	public function test_conference_papers_are_part_of_their_proceedings(): void {
		$paper = $this->enrich(
			array(
				'type'            => 'paper-conference',
				'title'           => 'BERT',
				'container-title' => 'Proceedings of NAACL-HLT 2019',
				'event-title'     => 'NAACL-HLT 2019',
				'event-place'     => 'Minneapolis, Minnesota',
			)
		);

		$this->assertSame(
			array(
				'@type' => 'Book',
				'name'  => 'Proceedings of NAACL-HLT 2019',
			),
			$paper['isPartOf']
		);
		$this->assertSame(
			array(
				'@type'    => 'Event',
				'name'     => 'NAACL-HLT 2019',
				'location' => array(
					'@type' => 'Place',
					'name'  => 'Minneapolis, Minnesota',
				),
			),
			$paper['recordedAt']
		);

		// RIS conference papers often carry only the event, under its CSL 1.0.1 name too.
		$event_only = $this->enrich(
			array(
				'type'  => 'paper-conference',
				'title' => 'A talk',
				'event' => 'WordCamp US',
			)
		);

		$this->assertArrayNotHasKey( 'isPartOf', $event_only );
		$this->assertSame(
			array(
				'@type' => 'Event',
				'name'  => 'WordCamp US',
			),
			$event_only['recordedAt']
		);
	}

	public function test_a_container_save_already_typed_is_kept(): void {
		$chapter = $this->enrich(
			array(
				'type'            => 'chapter',
				'title'           => 'A chapter',
				'container-title' => 'An edited book',
			)
		);

		$this->assertSame( 'Book', $chapter['isPartOf']['@type'] );
		$this->assertArrayNotHasKey( 'recordedAt', $chapter );
	}
}
