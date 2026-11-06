/**
 * Annotations: the compiler's own note on an entry, for annotated
 * bibliographies.
 *
 * Stored in the entry's CSL `annote` variable ("reader's notes about the item
 * content", CSL 1.0.2 Appendix IV), so it travels with the CSL-JSON. It is
 * plain text: paragraphs are separated by a blank line (`\n\n`), and it never
 * holds HTML. save() prints it only when the block's "Show annotations"
 * setting is on (see renderBibliographySave() in src/save-markup.js).
 *
 * Mirrored in PHP by bibliography_builder_sanitize_csl_annote() in
 * includes/csl-sanitize.php and bibliography_builder_save_annotation_paragraphs()
 * in includes/save-display.php.
 */

import { __ } from '@wordpress/i18n';
import { normalizeAnnotationText } from './csl-sanitize';

export { normalizeAnnotationText };

/** The CSL variable that holds an annotation. */
export const ANNOTATION_CSL_FIELD = 'annote';

/**
 * The annotation field of the structured editor
 * (src/components/structured-citation-editor.js), shared by the per-entry
 * field editor and manual entry.
 */
export const ANNOTATION_FIELD_DEFINITION = {
	key: 'annotation',
	label: __( 'Annotation', 'borges-bibliography-builder' ),
	help: __(
		'Your note on this work, shown under the entry when "Show annotations" is on. Leave a blank line between paragraphs. It is saved in the entry’s citation data, so the CSL-JSON and BibTeX exports include it even while annotations are hidden.',
		'borges-bibliography-builder'
	),
	control: 'textarea',
};

/**
 * The annotation of a CSL item as stored, for the field editor.
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string} The annotation, or an empty string.
 */
export function getAnnotationText( csl ) {
	const annote = csl?.[ ANNOTATION_CSL_FIELD ];

	return typeof annote === 'string' ? annote : '';
}

/**
 * Set or clear a CSL item's annotation. Returns a new object.
 *
 * @param {Object}  csl   CSL-JSON item.
 * @param {unknown} value Annotation text; empty clears it.
 * @return {Object} CSL item with the annotation set, or without one.
 */
export function setAnnotation( csl, value ) {
	const { [ ANNOTATION_CSL_FIELD ]: previous, ...rest } = csl || {};
	const text = normalizeAnnotationText( value );

	return text ? { ...rest, [ ANNOTATION_CSL_FIELD ]: text } : rest;
}

/**
 * The paragraphs save() prints for an annotation, split on blank lines.
 *
 * Works on whatever is stored, cleaned or not: Windows line endings count,
 * white space around each paragraph is dropped, and a value that is not a
 * string, or holds only white space, gives no paragraphs. A single line break
 * stays inside its paragraph, where HTML shows it as a space.
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string[]} Paragraphs, in order.
 */
export function getAnnotationParagraphs( csl ) {
	const annote = csl?.[ ANNOTATION_CSL_FIELD ];

	if ( typeof annote !== 'string' ) {
		return [];
	}

	return annote
		.replace( /\r\n?/gu, '\n' )
		.split( /\n[ \t]*\n/u )
		.map( ( paragraph ) => paragraph.trim() )
		.filter( Boolean );
}

/**
 * An annotation as one RIS line's value. RIS has one line per tag, so
 * paragraphs are joined with a space.
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string|undefined} The `N1` value, or undefined when there is none.
 */
export function getRisAnnotation( csl ) {
	const paragraphs = getAnnotationParagraphs( csl );

	return paragraphs.length
		? paragraphs.map( ( p ) => p.replace( /\s+/gu, ' ' ) ).join( ' ' )
		: undefined;
}
