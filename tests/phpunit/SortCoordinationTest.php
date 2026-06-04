<?php

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

final class SortCoordinationTest extends TestCase {
	#[DataProvider( 'staticCasesProvider' )]
	public function test_static_cases_match_expected_order( array $case ): void {
		$order = $this->render_order_for_style( $case['citations'], $case['style'] );
		$this->assertSame( $case['expectedOrder'], $order, $case['id'] );
	}

	#[DataProvider( 'mutationCasesProvider' )]
	public function test_mutation_sequences_match_expected_order( array $sequence ): void {
		$citations = $this->clone_value( $sequence['initialCitations'] );
		$style     = $sequence['initialStyle'];

		foreach ( $sequence['steps'] as $step ) {
			$citations = $this->apply_mutation_step( $citations, $step );

			if ( 'style-change' === $step['operation'] && ! empty( $step['style'] ) ) {
				$style = $step['style'];
			}

			$order = $this->render_order_for_style( $citations, $style );
			$this->assertSame( $step['expectedOrder'], $order, $sequence['id'] . ':' . $step['operation'] );
		}
	}

	public function test_sanity_check_detects_style_drift_against_fixture_expectations(): void {
		$fixture = null;
		foreach ( self::staticCasesProvider() as $provided_case ) {
			$case = $provided_case[0];
			if ( 'case-09-numeric-input-order' === $case['id'] ) {
				$fixture = $case;
				break;
			}
		}

		$this->assertNotNull( $fixture );

		$drifted_order = $this->render_order_for_style(
			$fixture['citations'],
			'chicago-author-date'
		);

		$this->assertNotSame( $fixture['expectedOrder'], $drifted_order );
	}

	public static function staticCasesProvider(): array {
		$base_path         = dirname( __DIR__ ) . '/fixtures/sort-coordination/';
		$cases             = json_decode( file_get_contents( $base_path . 'cases.json' ), true );
		$excluded_case_ids = array(
			'case-13-s4-leading-article-strip',
		);

		$cases = array_values(
			array_filter(
				$cases,
				static fn( $case ) => ! in_array( $case['id'] ?? '', $excluded_case_ids, true )
			)
		);

		return array_map(
			static fn( $case ) => array( $case ),
			$cases
		);
	}

	public static function mutationCasesProvider(): array {
		$base_path = dirname( __DIR__ ) . '/fixtures/sort-coordination/';
		$cases     = json_decode( file_get_contents( $base_path . 'mutations.json' ), true );
		return array_map(
			static fn( $sequence ) => array( $sequence ),
			$cases
		);
	}

	private function render_order_for_style( array $citations, string $style_key ): array {
		$style           = bibliography_builder_get_formatter_style_definition( sanitize_key( $style_key ) );
		$style_file_name = $style['template'] . '.csl';
		$style_path      = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'vendor/citation-style-language/styles/' . $style_file_name;
		$style_xml       = file_get_contents( $style_path );
		$prepared_items  = array();

		foreach ( array_values( $citations ) as $index => $citation ) {
			$csl       = is_array( $citation['csl'] ?? null ) ? $citation['csl'] : array();
			$source_id = isset( $citation['id'] ) ? (string) $citation['id'] : 'citation-' . $index;
			$csl['id'] = 'coord-' . $source_id;
			$prepared_items[] = $csl;
		}

		$items_for_formatter = json_decode( bibliography_builder_json_encode( $prepared_items ) );
		$markup_extension    = array(
			'bibliography' => array(
				'csl-entry' => static function ( $csl_item, $rendered_text ) {
					$id = isset( $csl_item->id )
						? preg_replace( '/[^A-Za-z0-9_.:-]/', '', (string) $csl_item->id )
						: '';

					return '<span data-borges-csl-id="'
						. htmlspecialchars( $id, ENT_QUOTES, 'UTF-8' )
						. '">' . $rendered_text . '</span>';
				},
			),
		);

		$formatter = new \Seboettg\CiteProc\CiteProc( $style_xml, $style['locale'], $markup_extension );
		$html      = $formatter->render( $items_for_formatter, 'bibliography' );
		$entries   = bibliography_builder_extract_citeproc_entries( $html, $style );

		return array_map(
			static function ( $entry ) {
				$id = (string) ( $entry['id'] ?? '' );
				if ( 0 === strpos( $id, 'coord-' ) ) {
					return substr( $id, 6 );
				}
				return $id;
			},
			$entries
		);
	}

	private function apply_mutation_step( array $citations, array $step ): array {
		switch ( $step['operation'] ) {
			case 'add':
				$citations[] = $this->clone_value( $step['citation'] );
				return $citations;

			case 'delete':
				return array_values(
					array_filter(
						$citations,
						static fn( $citation ) => ( $citation['id'] ?? '' ) !== ( $step['id'] ?? '' )
					)
				);

			case 'edit':
				return array_map(
					function ( $citation ) use ( $step ) {
						if ( ( $citation['id'] ?? '' ) !== ( $step['id'] ?? '' ) ) {
							return $citation;
						}

						$citation['csl'] = array_merge(
							is_array( $citation['csl'] ?? null ) ? $citation['csl'] : array(),
							is_array( $step['patch'] ?? null ) ? $step['patch'] : array()
						);

						return $citation;
					},
					$citations
				);

			case 'reorder':
				$ordered_ids = $step['orderedIds'] ?? array();
				$by_id       = array();

				foreach ( $citations as $citation ) {
					$by_id[ $citation['id'] ] = $citation;
				}

				$reordered = array();
				foreach ( $ordered_ids as $id ) {
					if ( isset( $by_id[ $id ] ) ) {
						$reordered[] = $by_id[ $id ];
					}
				}

				return $reordered;

			case 'style-change':
				return $citations;
		}

		throw new RuntimeException( 'Unsupported mutation operation: ' . $step['operation'] );
	}

	private function clone_value( $value ) {
		return json_decode( json_encode( $value ), true );
	}
}
