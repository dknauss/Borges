<?php
require_once '/wordpress/wp-load.php';
$cite = static function ( $id, $text ) {
	return '<a class="bibliography-builder-citation h-cite" href="#ref-' . $id . '" data-bibliography-ref="' . $id . '">' . $text . '</a>';
};
$attrs = array(
	'citationStyle'    => 'chicago-notes-bibliography',
	'headingText'      => 'Annotated Bibliography',
	'headingLevel'     => 2,
	'bibliographyId'   => 'demo-annotated',
	'outputCoins'      => true,
	'outputCslJson'    => true,
	'outputCiteExport' => true,
	'showAnnotations'  => true,
	'citations'        => array(
		array(
			'id'            => 'borges',
			'csl'           => array( 'id' => 'borges', 'type' => 'chapter', 'title' => 'The Library of Babel', 'author' => array( array( 'family' => 'Borges', 'given' => 'Jorge Luis' ) ), 'translator' => array( array( 'family' => 'Irby', 'given' => 'James E.' ) ), 'container-title' => 'Labyrinths: Selected Stories and Other Writings', 'editor' => array( array( 'family' => 'Yates', 'given' => 'Donald A.' ), array( 'family' => 'Irby', 'given' => 'James E.' ) ), 'publisher' => 'New Directions', 'publisher-place' => 'New York', 'issued' => array( 'date-parts' => array( array( 1962 ) ) ), 'annote' => "A library containing every possible book, whose librarians search for the one true catalogue.\n\nThe plugin is named after him." ),
			'formattedText' => 'Borges, Jorge Luis. “The Library of Babel.” In <i>Labyrinths: Selected Stories and Other Writings</i>, edited by Donald A. Yates and James E. Irby. Translated by James E. Irby. New Directions, 1962.',
		),
		array(
			'id'            => 'grafton',
			'csl'           => array( 'id' => 'grafton', 'type' => 'book', 'title' => 'The Footnote: A Curious History', 'author' => array( array( 'family' => 'Grafton', 'given' => 'Anthony' ) ), 'publisher' => 'Harvard University Press', 'publisher-place' => 'Cambridge, MA', 'issued' => array( 'date-parts' => array( array( 1997 ) ) ), 'annote' => 'How the footnote became the historian’s proof of work, and what it costs to read one.' ),
			'formattedText' => 'Grafton, Anthony. <i>The Footnote: A Curious History</i>. Harvard University Press, 1997.',
		),
		array(
			'id'            => 'illich',
			'csl'           => array( 'id' => 'illich', 'type' => 'book', 'title' => 'Tools for Conviviality', 'author' => array( array( 'family' => 'Illich', 'given' => 'Ivan' ) ), 'publisher' => 'Harper & Row', 'publisher-place' => 'New York', 'issued' => array( 'date-parts' => array( array( 1973 ) ) ), 'URL' => 'https://archive.org/details/toolsforconvivia00illi', 'annote' => 'A tool is convivial when it widens what people can do for themselves, and manipulative when it narrows it.' ),
			'formattedText' => 'Illich, Ivan. <i>Tools for Conviviality</i>. Harper & Row, 1973. https://archive.org/details/toolsforconvivia00illi.',
		),
	),
);
$bib_html = bibliography_builder_render_save_markup( $attrs );
$blocks   = array(
	array( 'blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<p><strong>What to try:</strong> click a citation to jump to its entry; open this post in the editor and use <em>More → Cite</em> in any paragraph; toggle <em>Show annotations</em> in the bibliography’s settings; view the page source for <code>h-cite</code> on each entry.</p>', 'innerContent' => array() ),
	array( 'blockName' => 'core/heading', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<h2 class="wp-block-heading">An in-text citation</h2>', 'innerContent' => array() ),
	array( 'blockName' => 'core/paragraph', 'attrs' => array( 'className' => 'demo-gloss' ), 'innerBlocks' => array(), 'innerHTML' => '<p class="demo-gloss">Margin note: the footnote has a history of its own, ' . $cite( 'grafton', 'Grafton, <em>The Footnote</em>, 1–2' ) . '.</p>', 'innerContent' => array() ),
	array( 'blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<p>Illich asked whether a tool widens or narrows what people can do for themselves, ' . $cite( 'illich', 'Illich, <em>Tools for Conviviality</em>, 22' ) . '. A bibliography is a tool of that kind: it lets a reader follow a claim back to its source without asking anyone’s permission. Borges imagined the other extreme, a library that holds every possible book and so tells you nothing, ' . $cite( 'borges', 'Borges, “The Library of Babel,” 54' ) . '.</p>', 'innerContent' => array() ),
	array( 'blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<p>The paragraph with the margin note floats it into the right margin, the way Marginalia’s Gloss style does. Its citation is the same Cite format, so it links to the entry below like any other.</p>', 'innerContent' => array() ),
	array( 'blockName' => 'bibliography-builder/bibliography', 'attrs' => $attrs, 'innerBlocks' => array(), 'innerHTML' => $bib_html, 'innerContent' => array() ),
);
foreach ( $blocks as &$b ) {
	$b['innerContent'] = array( $b['innerHTML'] );
}
unset( $b );
$content = serialize_blocks( $blocks );
$id      = wp_insert_post(
	array(
		'import_id'    => 1000,
		'post_title'   => 'Borges preview: citations, annotations and h-cite',
		'post_name'    => 'borges-preview',
		'post_status'  => 'publish',
		'post_content' => wp_slash( $content ),
	)
);
echo is_wp_error( $id ) ? $id->get_error_message() : "post $id";
