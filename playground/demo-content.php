<?php
/**
 * Playground demo page builder.
 *
 * `npm run playground:build` inlines this file into each demo blueprint's
 * runPHP step, after defining:
 *
 * - $borges_demo_json  The contents of playground/demo-content.json.
 * - $borges_demo_intro An HTML lead paragraph for that blueprint.
 *
 * It rewrites post 1 as the demo page the blueprint lands on, and turns off
 * the editor's Welcome Guide so the page is visible straight away. Example
 * bibliographies are formatted with the plugin's own citeproc formatter and
 * rendered with its PHP port of save(), so they validate against whatever
 * version is installed. A release without that port (before 1.7.0) gets a
 * note instead.
 *
 * Not part of the plugin package (playground/ is in .distignore).
 *
 * @package BibliographyBuilder
 */

require_once '/wordpress/wp-load.php';

// Write as the admin, and keep kses from stripping the blocks' JSON-LD
// scripts and data attributes: kses_init() ran before any user was set.
wp_set_current_user( 1 );
kses_remove_filters();

$borges_demo = json_decode( $borges_demo_json, true );

$borges_demo_block = static function ( $name, $attrs, $html ) {
	return serialize_block(
		array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $html,
			'innerContent' => array( $html ),
		)
	) . "\n\n";
};

$borges_demo_paragraph = static function ( $html ) use ( $borges_demo_block ) {
	return $borges_demo_block( 'core/paragraph', array(), '<p>' . $html . '</p>' );
};

$borges_demo_heading = static function ( $text, $level ) use ( $borges_demo_block ) {
	$attrs = 2 === $level ? array() : array( 'level' => $level );
	$tag   = 'h' . $level;

	return $borges_demo_block( 'core/heading', $attrs, '<' . $tag . ' class="wp-block-heading">' . esc_html( $text ) . '</' . $tag . '>' );
};

$borges_demo_code = static function ( $text ) use ( $borges_demo_block ) {
	return $borges_demo_block(
		'core/code',
		array(),
		'<pre class="wp-block-code"><code>' . htmlspecialchars( $text, ENT_NOQUOTES, 'UTF-8' ) . '</code></pre>'
	);
};

$borges_demo_list = static function ( $items ) {
	$html = "<!-- wp:list -->\n<ul class=\"wp-block-list\">";

	foreach ( $items as $item ) {
		$html .= "<!-- wp:list-item -->\n<li>" . $item . "</li>\n<!-- /wp:list-item -->";
	}

	return $html . "</ul>\n<!-- /wp:list -->\n\n";
};

$borges_demo_can_prebuild = function_exists( 'bibliography_builder_render_save_markup' )
	&& function_exists( 'bibliography_builder_format_csl_items' )
	&& bibliography_builder_can_render_save_markup();

// Returns the serialized block, or '' when this install cannot build it.
$borges_demo_bibliography = static function ( $example ) use ( $borges_demo_can_prebuild ) {
	if ( ! $borges_demo_can_prebuild ) {
		return '';
	}

	$csl_items = bibliography_builder_validate_and_sanitize_csl_items( $example['citations'] );

	if ( is_wp_error( $csl_items ) ) {
		return '';
	}

	$formatted = bibliography_builder_format_csl_items( $csl_items, $example['attributes']['citationStyle'] );

	if ( is_wp_error( $formatted ) ) {
		return '';
	}

	$citations = array();

	foreach ( array_values( $csl_items ) as $index => $csl ) {
		$citation = array(
			'id'            => $example['attributes']['bibliographyId'] . '-' . ( $index + 1 ),
			'csl'           => $csl,
			'formattedText' => $formatted[ $index ],
		);

		// The editor stores these for Cite / Export; without them it adds
		// them on load and the untouched demo opens with unsaved changes.
		foreach ( array( 'exportBibtex', 'exportBiblatex' ) as $export_key ) {
			if ( isset( $example['exports'][ $index ][ $export_key ] ) ) {
				$citation[ $export_key ] = $example['exports'][ $index ][ $export_key ];
			}
		}

		$citations[] = $citation;
	}

	$attrs = $example['attributes'];
	// Stored in display order, as the editor stores them.
	$attrs['citations'] = bibliography_builder_sort_citations_for_save( $citations, $attrs['citationStyle'] );
	// Render from the attributes as the editor will parse them back.
	$html = bibliography_builder_render_save_markup(
		bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) )
	);

	if ( '' === $html ) {
		return '';
	}

	return serialize_block(
		array(
			'blockName'    => 'bibliography-builder/bibliography',
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $html,
			'innerContent' => array( $html ),
		)
	) . "\n\n";
};

$content = $borges_demo_paragraph( $borges_demo_intro );

$content .= $borges_demo_heading( '1. Paste any supported format', 2 );
$content .= $borges_demo_paragraph(
	'Select the empty <strong>Bibliography</strong> block at the end of this section, open <em>Paste / Import</em>, paste one or more samples, and choose <em>Add</em>. Separate entries with a blank line; up to 50 go in one paste, so you can copy several groups at once.'
);

foreach ( $borges_demo['sampleGroups'] as $group ) {
	$content .= $borges_demo_heading( $group['title'], 3 );
	$content .= $borges_demo_paragraph( $group['description'] );
	$content .= $borges_demo_code( implode( "\n\n", wp_list_pluck( $group['samples'], 'input' ) ) );
}

$content .= $borges_demo_block(
	'bibliography-builder/bibliography',
	array(
		'bibliographyId' => 'demo-try-it',
		'headingText'    => 'References',
	),
	''
);

$content .= $borges_demo_heading( '2. Key features to try', 2 );
$content .= $borges_demo_list( $borges_demo['features'] );

$content .= $borges_demo_heading( '3. Example bibliographies', 2 );

$borges_demo_examples = '';

foreach ( $borges_demo['examples'] as $example ) {
	$block = $borges_demo_bibliography( $example );

	if ( '' === $block ) {
		continue;
	}

	$borges_demo_examples .= $borges_demo_heading( $example['title'], 3 );
	$borges_demo_examples .= $borges_demo_paragraph( $example['description'] );
	$borges_demo_examples .= $block;
}

$content .= '' !== $borges_demo_examples
	? $borges_demo_paragraph( 'Each block below was built from CSL-JSON. Select one to change its style or settings.' ) . $borges_demo_examples
	: $borges_demo_paragraph( 'Pre-built examples need Borges 1.7.0 or later. Paste a few samples from section 1 to build your own.' );

wp_update_post(
	array(
		'ID'           => 1,
		'post_title'   => $borges_demo['title'],
		'post_content' => wp_slash( $content ),
	)
);

// Skip the block editor's Welcome Guide so the demo page is what opens.
$borges_demo_meta_key    = $GLOBALS['wpdb']->get_blog_prefix() . 'persisted_preferences';
$borges_demo_preferences = get_user_meta( 1, $borges_demo_meta_key, true );
$borges_demo_preferences = is_array( $borges_demo_preferences ) ? $borges_demo_preferences : array();

$borges_demo_preferences['core/edit-post'] = array_merge(
	isset( $borges_demo_preferences['core/edit-post'] ) && is_array( $borges_demo_preferences['core/edit-post'] )
		? $borges_demo_preferences['core/edit-post']
		: array(),
	array( 'welcomeGuide' => false )
);
$borges_demo_preferences['_modified'] = gmdate( 'c' );

update_user_meta( 1, $borges_demo_meta_key, $borges_demo_preferences );
