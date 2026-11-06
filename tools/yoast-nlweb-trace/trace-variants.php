<?php
/**
 * Plugin Name: Borges trace variants (test site only)
 * Description: Prototypes for the Yoast/NLWeb trace. Not part of Borges.
 *
 * The `borges_trace_variant` option picks how the cited works reach Yoast
 * SEO's graph, on top of whatever Borges itself does:
 *
 * - '' (default): Borges as it is.
 * - 'embed':  each `citation` reference on the Article becomes the full work.
 * - 'pieces': the full works join Yoast's graph as top-level nodes, and the
 *             Article keeps its short references to them.
 *
 * It also turns off Yoast's schema aggregator cache, so every capture sees
 * the variant it asked for.
 *
 * @package BibliographyBuilder
 */

add_filter( 'wpseo_schema_aggregator_cache_enabled', '__return_false' );

/**
 * The full JSON-LD work for every cited work in a post, keyed by `@id`.
 *
 * @param WP_Post|null $post The post.
 * @return array<string, array>
 */
function borges_trace_full_works( $post ) {
	if ( ! $post instanceof WP_Post ) {
		return array();
	}

	$page_url = get_permalink( $post );
	$works    = array();

	foreach ( bibliography_builder_collect_blocks( parse_blocks( $post->post_content ) ) as $bibliography ) {
		foreach ( $bibliography['citations'] as $citation ) {
			$work = bibliography_builder_enrich_json_ld_work(
				bibliography_builder_save_csl_to_json_ld( $citation['csl'] ),
				$citation['csl'],
				(string) $citation['id'],
				$page_url
			);

			if ( isset( $work['@id'] ) ) {
				$works[ $work['@id'] ] = $work;
			}
		}
	}

	return $works;
}

add_filter(
	'wpseo_schema_article',
	static function ( $data, $context = null ) {
		if ( 'embed' !== get_option( 'borges_trace_variant' ) || empty( $data['citation'] ) || ! is_object( $context ) ) {
			return $data;
		}

		$works = borges_trace_full_works( $context->post );

		foreach ( $data['citation'] as $i => $ref ) {
			if ( isset( $ref['@id'], $works[ $ref['@id'] ] ) ) {
				$data['citation'][ $i ] = $works[ $ref['@id'] ];
			}
		}

		return $data;
	},
	20,
	2
);

add_filter(
	'wpseo_schema_graph',
	static function ( $graph, $context = null ) {
		if ( 'pieces' !== get_option( 'borges_trace_variant' ) || ! is_object( $context ) ) {
			return $graph;
		}

		foreach ( borges_trace_full_works( $context->post ) as $work ) {
			$graph[] = $work;
		}

		return $graph;
	},
	10,
	2
);
