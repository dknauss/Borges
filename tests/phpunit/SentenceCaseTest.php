<?php
/**
 * Sentence case for APA 7, Vancouver, and IEEE titles
 * (includes/sentence-case.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SentenceCaseTest extends TestCase {

	/**
	 * Title case in, sentence case out, with a capital after a colon (APA,
	 * IEEE) and without one (NLM).
	 *
	 * @return array<string, array{string, string, string}>
	 */
	public static function titles(): array {
		return array(
			'plain'                 => array( 'The Origin of Species', 'The origin of species', 'The origin of species' ),
			'subtitle'              => array( 'The Origin of Species: A New Look', 'The origin of species: A new look', 'The origin of species: a new look' ),
			'question'              => array( 'What Is Life? The Physical Aspect', 'What is life? The physical aspect', 'What is life? the physical aspect' ),
			'em dash'               => array( 'Theory of Everything — An Overview', 'Theory of everything — An overview', 'Theory of everything — an overview' ),
			'acronyms and digits'   => array( 'COVID-19 and DNA Repair in 3D Models', 'COVID-19 and DNA repair in 3D models', 'COVID-19 and DNA repair in 3D models' ),
			'inner capitals'        => array( "McCarthy's iPhone and O'Brien's Mac", "McCarthy's iPhone and O'Brien's mac", "McCarthy's iPhone and O'Brien's mac" ),
			'single capitals'       => array( 'Effects of Vitamin D: A Trial', 'Effects of vitamin D: A trial', 'Effects of vitamin D: a trial' ),
			'pronoun'               => array( 'What I Saw in Books', 'What I saw in books', 'What I saw in books' ),
			'hyphenated'            => array( 'Self-Driving Cars', 'Self-driving cars', 'Self-driving cars' ),
			'abbreviation period'   => array( 'Policy in the U.S. Today', 'Policy in the U.S. today', 'Policy in the U.S. today' ),
			'accented'              => array( 'Notes on Élan Vital', 'Notes on élan vital', 'Notes on élan vital' ),
			'already sentence case' => array( 'The origin of species in Darwin', 'The origin of species in Darwin', 'The origin of species in Darwin' ),
			'all capitals'          => array( 'THE ORIGIN OF SPECIES', 'THE ORIGIN OF SPECIES', 'THE ORIGIN OF SPECIES' ),
			'one word'              => array( 'Bibliographies', 'Bibliographies', 'Bibliographies' ),
			'short words only'      => array( 'The Cat', 'The cat', 'The cat' ),
			'apa title case'        => array( 'Why the Mind Is in the Head', 'Why the mind is in the head', 'Why the mind is in the head' ),
		);
	}

	#[DataProvider( 'titles' )]
	public function test_title_case_becomes_sentence_case( string $title, string $capitalized, string $lowercased ): void {
		$this->assertSame( $capitalized, bibliography_builder_sentence_case( $title ) );
		$this->assertSame( $lowercased, bibliography_builder_sentence_case( $title, false ) );
	}

	/**
	 * The guess the checkbox exists for: a sentence-case title whose only
	 * capital after the first word is a proper noun reads as title case.
	 */
	public function test_a_title_of_names_alone_is_a_known_miss(): void {
		$this->assertSame( 'Darwin and wallace', bibliography_builder_sentence_case( 'Darwin and Wallace' ) );
	}

	private static function style( string $key ): ?array {
		return bibliography_builder_get_formatter_style_definition( $key )['sentenceCase'];
	}

	public function test_apa_converts_works_and_the_book_a_chapter_is_in(): void {
		$chapter = bibliography_builder_sentence_case_item(
			array(
				'type'                  => 'chapter',
				'title'                 => 'Indexing the Infinite',
				'container-title'       => 'Essays on Classification',
				'container-title-short' => 'Essays',
				'publisher'             => 'Delta Academic',
			),
			self::style( 'apa-7' )
		);

		$this->assertSame( 'Indexing the infinite', $chapter['title'] );
		$this->assertSame( 'Essays on classification', $chapter['container-title'] );
		$this->assertSame( 'Delta Academic', $chapter['publisher'] );

		$article = bibliography_builder_sentence_case_item(
			array(
				'type'            => 'article-journal',
				'title'           => 'Metadata Drift in Repositories',
				'container-title' => 'Journal of Library Systems',
			),
			self::style( 'apa-7' )
		);

		$this->assertSame( 'Metadata drift in repositories', $article['title'] );
		$this->assertSame( 'Journal of Library Systems', $article['container-title'] );
	}

	public function test_apa_leaves_proceedings_legal_sources_and_software_alone(): void {
		$paper = bibliography_builder_sentence_case_item(
			array(
				'type'            => 'paper-conference',
				'title'           => 'Fast Deduplication',
				'container-title' => 'Proceedings of the Conference on Digital Libraries',
			),
			self::style( 'apa-7' )
		);

		$this->assertSame( 'Fast deduplication', $paper['title'] );
		$this->assertSame( 'Proceedings of the Conference on Digital Libraries', $paper['container-title'] );

		foreach ( array( 'legal_case', 'legislation', 'periodical', 'software' ) as $type ) {
			$item = array(
				'type'  => $type,
				'title' => 'Brown Versus Board of Education',
			);

			$this->assertSame( $item, bibliography_builder_sentence_case_item( $item, self::style( 'apa-7' ) ), $type );
		}
	}

	public function test_ieee_converts_only_quoted_titles(): void {
		$book = array(
			'type'  => 'book',
			'title' => 'The Architecture of Small Libraries',
		);

		$this->assertSame( $book, bibliography_builder_sentence_case_item( $book, self::style( 'ieee' ) ) );

		$chapter = bibliography_builder_sentence_case_item(
			array(
				'type'            => 'chapter',
				'title'           => 'Indexing the Infinite',
				'container-title' => 'Essays on Classification',
			),
			self::style( 'ieee' )
		);

		$this->assertSame( 'Indexing the infinite', $chapter['title'] );
		$this->assertSame( 'Essays on Classification', $chapter['container-title'] );
	}

	public function test_vancouver_lowercases_a_subtitle(): void {
		$item = bibliography_builder_sentence_case_item(
			array(
				'type'  => 'article-journal',
				'title' => 'Hypertension: Results of the Registry',
			),
			self::style( 'vancouver' )
		);

		$this->assertSame( 'Hypertension: results of the registry', $item['title'] );
	}

	public function test_title_case_styles_keep_the_title(): void {
		$item = array(
			'type'  => 'book',
			'title' => 'The Origin of Species',
		);

		foreach ( array( 'chicago-notes-bibliography', 'chicago-author-date', 'mla-9', 'harvard', 'oscola', 'abnt' ) as $key ) {
			$this->assertNull( self::style( $key ), $key );
			$this->assertSame( $item, bibliography_builder_sentence_case_item( $item, self::style( $key ) ), $key );
		}
	}

	public function test_the_checkbox_and_another_language_keep_the_title(): void {
		$kept = array(
			'type'   => 'book',
			'title'  => 'Darwin and Wallace',
			'custom' => array( BIBLIOGRAPHY_BUILDER_KEEP_TITLE_CASE_KEY => true ),
		);

		$this->assertSame( $kept, bibliography_builder_sentence_case_item( $kept, self::style( 'apa-7' ) ) );

		$german = array(
			'type'     => 'book',
			'title'    => 'Die Entstehung Der Arten',
			'language' => 'de',
		);

		$this->assertSame( $german, bibliography_builder_sentence_case_item( $german, self::style( 'apa-7' ) ) );

		$english = bibliography_builder_sentence_case_item( array( 'language' => 'en-GB' ) + $german, self::style( 'apa-7' ) );

		$this->assertSame( 'Die entstehung der arten', $english['title'] );
	}

	/**
	 * The stored item is never changed: the formatter converts its own copy,
	 * so the same block in Chicago keeps the capitals.
	 */
	public function test_the_formatter_prints_sentence_case_from_a_title_case_record(): void {
		$item = array(
			'type'      => 'book',
			'title'     => 'The Garden of Forking Paths',
			'author'    => array(
				array(
					'family' => 'Borges',
					'given'  => 'Jorge Luis',
				),
			),
			'publisher' => 'Sur',
			'issued'    => array( 'date-parts' => array( array( 1941 ) ) ),
		);

		$apa     = bibliography_builder_format_csl_items( array( $item ), 'apa-7' );
		$chicago = bibliography_builder_format_csl_items( array( $item ), 'chicago-notes-bibliography' );

		$this->assertStringContainsString( 'The garden of forking paths', $apa[0] );
		$this->assertStringContainsString( 'The Garden of Forking Paths', $chicago[0] );
	}
}
