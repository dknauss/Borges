/**
 * Short in-text citations, built in the editor from an entry's CSL-JSON.
 *
 * The "Cite" format (src/formats/citation.js) inserts one of these into a
 * paragraph as a link to the bibliography entry. They are a starting point,
 * not CSL output: the text is plain post content, and the writer can edit it
 * after inserting it. The form follows the bibliography's style family:
 *
 * - `notes` (Chicago notes, OSCOLA): a Chicago short note, "Family, Short
 *   Title, locator". Book-like titles are italic; articles, chapters, and
 *   everything else are in quotation marks, with the comma inside them.
 * - `author-date` (Chicago author-date, APA, Harvard, ABNT): "(Family Year,
 *   locator)". MLA, an author-date style with no year, gives "(Family
 *   locator)".
 * - `numeric` (IEEE, Vancouver): "[n]" or "[n, locator]", where n is the
 *   entry's position in its list.
 *
 * Names: one author gives "Family", two give "A and B", three or more give
 * "A et al." (Chicago 18th ed.). Editors stand in when there are no authors;
 * with no names at all, the short title takes the author's place. The locator
 * is added as typed ("12", "p. 12", "chap. 3").
 *
 * Everything here returns plain text segments. The caller turns them into
 * rich text, so no HTML is ever built from entry data.
 */

import { getStyleDefinition } from './formatting/style-registry';
import { stripInlineMarkup } from './formatting';

/**
 * CSL types whose titles are italic in a Chicago short note: works that stand
 * alone, as opposed to parts of a larger work (articles, chapters, web pages),
 * which take quotation marks. Theses and dissertations take quotation marks
 * in Chicago too.
 */
export const ITALIC_TITLE_TYPES = new Set( [
	'book',
	'classic',
	'collection',
	'dataset',
	'graphic',
	'map',
	'motion_picture',
	'musical_score',
	'pamphlet',
	'periodical',
	'report',
	'software',
	'standard',
] );

const OPEN_QUOTE = '“';
const CLOSE_QUOTE = '”';

/**
 * @typedef {Object} ShortFormSegment
 * @property {string}  text   Plain text.
 * @property {boolean} italic Whether the text is italic.
 */

/**
 * @typedef {Object} ShortFormOptions
 * @property {string} [locator] Page or other locator, added as typed.
 * @property {number} [number]  The entry's 1-based position (numeric styles).
 */

/**
 * The style family a bibliography's short citations follow.
 *
 * @param {string} styleKey Bibliography style key.
 * @return {string} `notes`, `author-date`, or `numeric`.
 */
export function getShortFormFamily( styleKey ) {
	return getStyleDefinition( styleKey ).family || 'notes';
}

/**
 * One name as a short citation shows it: the family name with any particle
 * kept in front ("van Gogh"), or an organization's literal name.
 *
 * @param {Object} name CSL name object.
 * @return {string} Display name, or an empty string.
 */
export function getShortName( name ) {
	if ( ! name || typeof name !== 'object' ) {
		return '';
	}

	const family = clean( name.family );

	if ( family ) {
		const particle = clean( name[ 'non-dropping-particle' ] );

		return particle ? `${ particle } ${ family }` : family;
	}

	return clean( name.literal ) || clean( name.given );
}

/**
 * The names a short citation leads with: authors, else editors.
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string[]} Display names, in order.
 */
export function getShortNames( csl ) {
	for ( const role of [ 'author', 'editor' ] ) {
		const names = Array.isArray( csl?.[ role ] )
			? csl[ role ].map( getShortName ).filter( Boolean )
			: [];

		if ( names.length ) {
			return names;
		}
	}

	return [];
}

/**
 * Names joined for a short citation: "A", "A and B", or "A et al.".
 *
 * @param {string[]} names Display names.
 * @return {string} Joined names, or an empty string.
 */
export function joinShortNames( names ) {
	if ( names.length === 0 ) {
		return '';
	}

	if ( names.length === 1 ) {
		return names[ 0 ];
	}

	if ( names.length === 2 ) {
		return `${ names[ 0 ] } and ${ names[ 1 ] }`;
	}

	return `${ names[ 0 ] } et al.`;
}

/**
 * The short title: CSL `title-short`, else the title up to its first colon.
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string} Short title, or an empty string.
 */
export function getShortTitle( csl ) {
	const short = clean( csl?.[ 'title-short' ] );

	if ( short ) {
		return short;
	}

	const title = clean( csl?.title );
	const colon = title.indexOf( ':' );

	return colon > 0 ? title.slice( 0, colon ).trim() : title;
}

/**
 * The year of publication, from `issued`, else "n.d.".
 *
 * @param {Object} csl CSL-JSON item.
 * @return {string} Year, or "n.d.".
 */
export function getShortYear( csl ) {
	const issued = csl?.issued;
	const year = issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ];

	if ( year !== undefined && year !== null && String( year ).trim() ) {
		return String( year ).trim();
	}

	const loose = String( issued?.literal ?? issued?.raw ?? '' ).match(
		/\b\d{4}\b/
	);

	return loose ? loose[ 0 ] : 'n.d.';
}

/**
 * Whether a CSL type's title is italic in a short note.
 *
 * @param {string} type CSL type.
 * @return {boolean} True for book-like types.
 */
export function isItalicTitleType( type ) {
	return ITALIC_TITLE_TYPES.has( type );
}

/**
 * The title as segments: italic for book-like types, else in quotation marks.
 *
 * @param {Object} csl      CSL-JSON item.
 * @param {string} trailing Punctuation that follows the title; it goes
 *                          inside the closing quotation mark.
 * @return {ShortFormSegment[]} Segments, empty when there is no title.
 */
function getTitleSegments( csl, trailing = '' ) {
	const title = getShortTitle( csl );

	if ( ! title ) {
		return trailing ? [ { text: trailing, italic: false } ] : [];
	}

	if ( isItalicTitleType( csl?.type ) ) {
		return [
			{ text: title, italic: true },
			...( trailing ? [ { text: trailing, italic: false } ] : [] ),
		];
	}

	return [
		{
			text: `${ OPEN_QUOTE }${ title }${ trailing }${ CLOSE_QUOTE }`,
			italic: false,
		},
	];
}

/**
 * Join adjacent segments of the same kind and drop empty ones.
 *
 * @param {ShortFormSegment[]} segments Segments.
 * @return {ShortFormSegment[]} Merged segments.
 */
function mergeSegments( segments ) {
	const merged = [];

	for ( const segment of segments ) {
		if ( ! segment.text ) {
			continue;
		}

		const last = merged[ merged.length - 1 ];

		if ( last && last.italic === segment.italic ) {
			last.text += segment.text;
		} else {
			merged.push( { ...segment } );
		}
	}

	return merged;
}

/**
 * A Chicago short note: "Family, Short Title, locator".
 *
 * @param {Object} csl     CSL-JSON item.
 * @param {string} locator Locator, or an empty string.
 * @return {ShortFormSegment[]} Segments.
 */
function getNoteSegments( csl, locator ) {
	const names = joinShortNames( getShortNames( csl ) );
	const hasTitle = Boolean( getShortTitle( csl ) );
	const segments = [];

	if ( names ) {
		segments.push( {
			text: hasTitle ? `${ names }, ` : names,
			italic: false,
		} );
	}

	segments.push( ...getTitleSegments( csl, locator ? ',' : '' ) );

	if ( locator ) {
		segments.push( { text: ` ${ locator }`, italic: false } );
	}

	return segments;
}

/**
 * An author-date citation: "(Family Year, locator)"; MLA: "(Family locator)".
 *
 * @param {Object}  csl      CSL-JSON item.
 * @param {string}  locator  Locator, or an empty string.
 * @param {boolean} withYear Whether the style shows the year.
 * @return {ShortFormSegment[]} Segments.
 */
function getAuthorDateSegments( csl, locator, withYear ) {
	const names = joinShortNames( getShortNames( csl ) );
	const segments = [ { text: '(', italic: false } ];

	if ( names ) {
		segments.push( { text: names, italic: false } );
	} else {
		segments.push( ...getTitleSegments( csl ) );
	}

	if ( withYear ) {
		segments.push( { text: ` ${ getShortYear( csl ) }`, italic: false } );
	}

	if ( locator ) {
		segments.push( {
			text: withYear ? `, ${ locator }` : ` ${ locator }`,
			italic: false,
		} );
	}

	segments.push( { text: ')', italic: false } );

	return segments;
}

/**
 * A short in-text citation for one entry, as text segments.
 *
 * @param {Object}           csl       CSL-JSON item.
 * @param {string}           styleKey  The bibliography's style key.
 * @param {ShortFormOptions} [options] Locator and entry number.
 * @return {ShortFormSegment[]} Segments; never empty.
 */
export function getShortFormSegments( csl, styleKey, options = {} ) {
	const locator = clean( options.locator );
	const family = getShortFormFamily( styleKey );
	let segments;

	if ( family === 'numeric' ) {
		const number =
			Number.isInteger( options.number ) && options.number > 0
				? String( options.number )
				: '?';

		segments = [
			{
				text: locator ? `[${ number }, ${ locator }]` : `[${ number }]`,
				italic: false,
			},
		];
	} else if ( family === 'author-date' ) {
		segments = getAuthorDateSegments( csl, locator, styleKey !== 'mla-9' );
	} else {
		segments = getNoteSegments( csl, locator );
	}

	const merged = mergeSegments( segments );

	return merged.length ? merged : [ { text: '[?]', italic: false } ];
}

/**
 * A short in-text citation as plain text, for previews and labels.
 *
 * @param {Object}           csl       CSL-JSON item.
 * @param {string}           styleKey  The bibliography's style key.
 * @param {ShortFormOptions} [options] Locator and entry number.
 * @return {string} Plain text.
 */
export function getShortFormText( csl, styleKey, options = {} ) {
	return getShortFormSegments( csl, styleKey, options )
		.map( ( segment ) => segment.text )
		.join( '' );
}

/**
 * A field as trimmed plain text, without inline markup.
 *
 * @param {unknown} value Field value.
 * @return {string} Plain text, or an empty string.
 */
function clean( value ) {
	if ( typeof value !== 'string' && typeof value !== 'number' ) {
		return '';
	}

	return stripInlineMarkup( String( value ) ).replace( /\s+/g, ' ' ).trim();
}
