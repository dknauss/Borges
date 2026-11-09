/**
 * MLA 9 and OSCOLA 5 repeated authors.
 *
 * In an MLA works-cited list, an entry by exactly the same author or authors
 * as the entry before it replaces the names with three hyphens: "---. Title".
 * An OSCOLA bibliography replaces the first author's name with a double em
 * dash after that author's first work (§1.7): "—— Punishment and
 * Responsibility (OUP 1968)", "—— and Honoré AM, Causation in the Law (OUP
 * 1959)". Every other bundled style writes the names out again, in its
 * current edition (see docs/csl-styles.md).
 *
 * The substitution depends on the order of the list, which the block decides
 * when it sorts at save time, so it is applied there rather than by the CSL
 * style. It is deliberately strict: an entry gets the hyphens only when its
 * author list matches the previous entry's field for field, it has no manual
 * display text, and both entries start with exactly the names the MLA style
 * writes for that list. Anything else keeps the full names. OSCOLA's rule is
 * as strict about the first author, which must match field for field, and
 * which both entries must start with as OSCOLA writes it ("Hart HLA").
 *
 * Which styles do either is set in includes/styles.json, by a style's
 * `repeatedAuthors`: `allAuthors` (MLA) or `firstAuthor` (OSCOLA).
 *
 * A block can override the style with its `repeatedAuthorMark` setting
 * (since 1.20.0): `style` (the default) keeps the rule above, `none` writes
 * every name out, and a style may offer an older mark from its tradition,
 * listed in its `repeatedAuthorMarks` in includes/styles.json: `dash`, the
 * 3-em dash of Chicago 17 (Chicago styles), or `underscore`, the underscore
 * line of NBR 6023:2002 (ABNT). Both replace the whole author list, under the
 * same strict rules as MLA's hyphens; a mark the style does not offer falls
 * back to `style`, so switching styles never leaves a foreign mark behind.
 *
 * Mirrored by bibliography_builder_save_repeated_author_prefixes() in
 * includes/save-markup.php; the save-parity fixtures pin the two together.
 */

import styleData from '../../includes/styles.json';

/**
 * The style keys whose `repeatedAuthors` in styles.json is the given rule.
 *
 * @param {string} rule `allAuthors` or `firstAuthor`.
 * @return {readonly string[]} Style keys.
 */
function stylesWithRepeatedAuthors( rule ) {
	return Object.freeze(
		Object.keys( styleData.styles ).filter(
			( key ) => styleData.styles[ key ].repeatedAuthors === rule
		)
	);
}

/**
 * Styles that replace an entry's authors with REPEATED_AUTHOR_MARK when they
 * repeat the previous entry's.
 */
export const REPEATED_AUTHOR_STYLES = stylesWithRepeatedAuthors( 'allAuthors' );

/**
 * The mark as saved: three U+2011 non-breaking hyphens, written as plain text.
 * On the front end wptexturize turns ASCII "---" into an em dash, and a "-"
 * alone between tags into an en dash; it leaves U+2011 alone. Being
 * non-breaking, the three also stay on one line without any stylesheet.
 */
export const REPEATED_AUTHOR_MARK = '\u2011\u2011\u2011';

/**
 * Styles that replace a repeated first author with FIRST_AUTHOR_DASH.
 */
export const FIRST_AUTHOR_DASH_STYLES =
	stylesWithRepeatedAuthors( 'firstAuthor' );

/**
 * OSCOLA's double em dash, as saved. wptexturize leaves em dashes alone.
 */
export const FIRST_AUTHOR_DASH = '\u2014\u2014';

/**
 * Chicago 17's 3-em dash, as saved: three U+2014 em dashes, which run
 * together in nearly every font (U+2E3B, the single three-em dash, is missing
 * from many) and which wptexturize leaves alone.
 */
export const THREE_EM_DASH = '———';

/**
 * NBR 6023:2002's underscore line, as saved: six underscores, the "traço
 * sublinear equivalente a seis espaços". wptexturize leaves them alone.
 */
export const UNDERSCORE_LINE = '______';

/**
 * Values of the block's `repeatedAuthorMark` attribute (block.json).
 */
export const REPEATED_AUTHOR_MARK_SETTINGS = Object.freeze( [
	'style',
	'dash',
	'underscore',
	'none',
] );

/**
 * The repeated-author rule a block follows: its style's `repeatedAuthors`,
 * unless its `repeatedAuthorMark` setting turns marks off (`none`) or picks
 * an older mark the style offers in `repeatedAuthorMarks`.
 *
 * @param {string} styleKey          Citation style.
 * @param {string} [setting='style'] The block's `repeatedAuthorMark`.
 * @return {string|null} `allAuthors`, `firstAuthor`, `dash`, `underscore`,
 *                       or null for full names.
 */
export function getRepeatedAuthorRule( styleKey, setting = 'style' ) {
	const style = styleData.styles[ styleKey ] || {};

	if ( setting === 'none' ) {
		return null;
	}

	if (
		setting !== 'style' &&
		Array.isArray( style.repeatedAuthorMarks ) &&
		style.repeatedAuthorMarks.includes( setting )
	) {
		return setting;
	}

	return style.repeatedAuthors || null;
}

/**
 * The marks a style offers besides its own rule, for the block setting.
 *
 * @param {string} styleKey Citation style.
 * @return {string[]} `dash`, `underscore`, or neither.
 */
export function getOptionalRepeatedAuthorMarks( styleKey ) {
	const marks = styleData.styles[ styleKey ]?.repeatedAuthorMarks;

	return Array.isArray( marks ) ? marks : [];
}

/**
 * The mark a style replaces repeated authors with.
 *
 * @param {string} styleKey          Citation style.
 * @param {string} [setting='style'] The block's `repeatedAuthorMark`.
 * @return {string} Three non-breaking hyphens, OSCOLA's double em dash,
 *                  Chicago's 3-em dash, or ABNT's underscore line.
 */
export function getRepeatedAuthorMark( styleKey, setting = 'style' ) {
	switch ( getRepeatedAuthorRule( styleKey, setting ) ) {
		case 'firstAuthor':
			return FIRST_AUTHOR_DASH;
		case 'dash':
			return THREE_EM_DASH;
		case 'underscore':
			return UNDERSCORE_LINE;
		default:
			return REPEATED_AUTHOR_MARK;
	}
}

const NAME_KEYS = [
	'family',
	'given',
	'literal',
	'suffix',
	'dropping-particle',
	'non-dropping-particle',
	// Two people can share a name; a differing ORCID tells them apart.
	'ORCID',
];

function namePart( name, key ) {
	return name && typeof name[ key ] === 'string' ? name[ key ] : '';
}

function getNameKey( name ) {
	return NAME_KEYS.map( ( key ) => namePart( name, key ) ).join( '\u0001' );
}

/**
 * A comparable key for a citation's author list, or null when it has none.
 *
 * @param {Object}  citation          Citation record.
 * @param {boolean} [firstOnly=false] Key only the first author.
 * @return {string|null} Key.
 */
function getAuthorKey( citation, firstOnly = false ) {
	const authors = citation?.csl?.author;

	if ( ! Array.isArray( authors ) || authors.length === 0 ) {
		return null;
	}

	return ( firstOnly ? authors.slice( 0, 1 ) : authors )
		.map( getNameKey )
		.join( '\u0002' );
}

function joinParts( parts ) {
	return parts.filter( ( part ) => part !== '' ).join( ' ' );
}

/**
 * A name as the MLA style writes the first author: "van Gogh, Vincent",
 * "Beauvoir, Simone de", "King, Martin Luther, Jr.".
 *
 * With `demote`, a non-dropping particle moves after the given name, as
 * Chicago's `demote-non-dropping-particle="display-and-sort"` writes it:
 * "Gogh, Vincent van".
 *
 * @param {Object}  name           CSL name.
 * @param {boolean} [demote=false] Demote a non-dropping particle.
 * @return {string} Name, or '' when it has no family name or literal.
 */
function getInvertedName( name, demote = false ) {
	const literal = namePart( name, 'literal' );

	if ( literal !== '' ) {
		return literal;
	}

	if ( namePart( name, 'family' ) === '' ) {
		return '';
	}

	const particle = namePart( name, 'non-dropping-particle' );

	return [
		joinParts( [ demote ? '' : particle, namePart( name, 'family' ) ] ),
		joinParts( [
			namePart( name, 'given' ),
			namePart( name, 'dropping-particle' ),
			demote ? particle : '',
		] ),
		namePart( name, 'suffix' ),
	]
		.filter( ( part ) => part !== '' )
		.join( ', ' );
}

/**
 * A name as the MLA style writes the second author: "James Doe Jr.".
 *
 * @param {Object} name CSL name.
 * @return {string} Name, or '' when it has no family name or literal.
 */
function getDisplayName( name ) {
	const literal = namePart( name, 'literal' );

	if ( literal !== '' ) {
		return literal;
	}

	if ( namePart( name, 'family' ) === '' ) {
		return '';
	}

	return joinParts( [
		namePart( name, 'given' ),
		namePart( name, 'dropping-particle' ),
		namePart( name, 'non-dropping-particle' ),
		namePart( name, 'family' ),
		namePart( name, 'suffix' ),
	] );
}

/**
 * The author names an MLA entry starts with, without the period after them:
 * "Smith, John", "Smith, John, and Jane Smith", "Kim, Ji-woo, et al", or null
 * when a name cannot be written.
 *
 * Built from the CSL names, not searched for in the text, so a title or a
 * suffix that repeats part of a name cannot be mistaken for the names.
 *
 * @param {Array} authors CSL names.
 * @return {string|null} Names.
 */
function getAuthorPrefix( authors ) {
	const first = getInvertedName( authors[ 0 ] );
	let block = first;

	if ( authors.length === 2 ) {
		const second = getDisplayName( authors[ 1 ] );
		block = second === '' ? '' : `${ first }, and ${ second }`;
	} else if ( authors.length >= 3 ) {
		block = `${ first }, et al.`;
	}

	if ( first === '' || block === '' ) {
		return null;
	}

	return withoutFinalPeriod( block );
}

/**
 * A name block without its final period: a name ending in one ("Jr.",
 * "et al.") shares it with the entry.
 *
 * @param {string} block Names.
 * @return {string} Names.
 */
function withoutFinalPeriod( block ) {
	return block.endsWith( '.' ) ? block.slice( 0, -1 ) : block;
}

/**
 * The author names a Chicago bibliography entry starts with (the bundled
 * Chicago CSL files): the first author inverted, the others in display order,
 * a comma before "and" ("Becker, Thomas J., and Yuki Nakamura"), and seven or
 * more cut to three and "et al.". Null when a name cannot be written.
 *
 * @param {Array}   authors CSL names.
 * @param {boolean} demote  The style demotes non-dropping particles.
 * @return {string|null} Names, without the period after them.
 */
function getChicagoAuthorPrefix( authors, demote ) {
	const shown = authors.length >= 7 ? authors.slice( 0, 3 ) : authors;
	const names = shown.map( ( name, index ) =>
		index === 0 ? getInvertedName( name, demote ) : getDisplayName( name )
	);

	if ( names.includes( '' ) ) {
		return null;
	}

	let block = names[ 0 ];

	if ( authors.length >= 7 ) {
		block = `${ names.join( ', ' ) }, et al.`;
	} else if ( names.length >= 2 ) {
		block = `${ names.slice( 0, -1 ).join( ', ' ) }, and ${
			names[ names.length - 1 ]
		}`;
	}

	return withoutFinalPeriod( block );
}

/**
 * The author names an ABNT entry starts with (the bundled ABNT CSL): every
 * name inverted with the family name in capitals, separated by semicolons
 * ("BECKER, Thomas J.; NAKAMURA, Yuki"), and four or more cut to the first
 * and "et al.". A literal name is written in capitals too. Null for a name
 * with a particle or suffix, whose capitals the CSL processor decides.
 *
 * @param {Array} authors CSL names.
 * @return {string|null} Names, without the period after them.
 */
function getAbntAuthorPrefix( authors ) {
	const shown = authors.length >= 4 ? authors.slice( 0, 1 ) : authors;
	const names = shown.map( ( name ) => {
		if (
			namePart( name, 'suffix' ) !== '' ||
			namePart( name, 'dropping-particle' ) !== '' ||
			namePart( name, 'non-dropping-particle' ) !== ''
		) {
			return '';
		}

		const literal = namePart( name, 'literal' );

		if ( literal !== '' ) {
			return literal.toUpperCase();
		}

		const family = namePart( name, 'family' );

		if ( family === '' ) {
			return '';
		}

		return [ family.toUpperCase(), namePart( name, 'given' ) ]
			.filter( ( part ) => part !== '' )
			.join( ', ' );
	} );

	if ( names.includes( '' ) ) {
		return null;
	}

	const block =
		authors.length >= 4 ? `${ names[ 0 ] } et al.` : names.join( '; ' );

	return withoutFinalPeriod( block );
}

/**
 * The names a whole-author-list rule replaces, written as its style writes
 * them, without the period after them.
 *
 * @param {Array}  authors  CSL names.
 * @param {string} rule     `allAuthors`, `dash`, or `underscore`.
 * @param {string} styleKey Citation style.
 * @return {string|null} Names.
 */
function getRuleAuthorPrefix( authors, rule, styleKey ) {
	if ( rule === 'dash' ) {
		return getChicagoAuthorPrefix(
			authors,
			styleData.styles[ styleKey ]?.demoteNonDroppingParticle ===
				'display-and-sort'
		);
	}

	if ( rule === 'underscore' ) {
		return getAbntAuthorPrefix( authors );
	}

	return getAuthorPrefix( authors );
}

/**
 * The text an OSCOLA entry's dash replaces: its first author as the style
 * writes it, "Hart HLA" before " and Honoré AM", or "Hart HLA," with the
 * comma that the dash drops before a title. Null unless the text starts with
 * that name.
 *
 * OSCOLA writes a name as its family name, with any non-dropping particle,
 * then the initials, run together ("Kim J-W"). A name with a suffix or a
 * dropping particle is left alone.
 *
 * @param {Object} name CSL name.
 * @param {string} text Display text.
 * @return {string|null} Prefix.
 */
function getFirstAuthorPrefix( name, text ) {
	if (
		namePart( name, 'suffix' ) !== '' ||
		namePart( name, 'dropping-particle' ) !== ''
	) {
		return null;
	}

	const literal = namePart( name, 'literal' );
	const head =
		literal !== ''
			? literal
			: joinParts( [
					namePart( name, 'non-dropping-particle' ),
					namePart( name, 'family' ),
				] );

	if ( head === '' || ! text.startsWith( head ) ) {
		return null;
	}

	let prefix = head;
	const initials =
		literal === '' && namePart( name, 'given' ) !== ''
			? /^ ([^\s,]+)/.exec( text.slice( head.length ) )
			: null;

	if ( initials ) {
		prefix = `${ head } ${ initials[ 1 ] }`;
	}

	const rest = text.slice( prefix.length );

	if ( rest.startsWith( ', ' ) ) {
		return `${ prefix },`;
	}

	return rest.startsWith( ' and ' ) ? prefix : null;
}

/**
 * Whether a citation's formattedText is missing or only the fallback the
 * editor stores when formatting fails: its title, else its container title
 * (getFallbackText() in src/lib/formatting/csl.js).
 *
 * @param {Object} citation Citation record.
 * @return {boolean} Whether it is unformatted.
 */
function isUnformatted( citation ) {
	const text = citation?.formattedText;

	return (
		! text ||
		text === citation.csl?.title ||
		text === citation.csl?.[ 'container-title' ]
	);
}

/**
 * For each citation in display order, the author names to replace with
 * the style's mark (getRepeatedAuthorMark()), or null.
 *
 * @param {Array}                                       citations                 Citations in display order.
 * @param {string}                                      styleKey                  Citation style.
 * @param {(citation: Object) => string}                displayText               Gives a citation's display text.
 * @param {Object}                                      [options]                 Options.
 * @param {boolean}                                     [options.firstAuthorDash] Apply OSCOLA's dash (default false:
 *                                                                                save() through 1.17.0 wrote OSCOLA
 *                                                                                names in full).
 * @param {(citation: Object) => (number|boolean|null)} [options.listOf]          Gives the list a citation is shown
 *                                                                                in; no mark crosses lists.
 * @param {string}                                      [options.markSetting]     The block's `repeatedAuthorMark`
 *                                                                                (default `style`: save() through
 *                                                                                1.19.x had no setting).
 * @return {Array<string|null>} Per-citation prefix.
 */
export function getRepeatedAuthorPrefixes(
	citations,
	styleKey,
	displayText,
	{ firstAuthorDash = false, listOf = () => null, markSetting = 'style' } = {}
) {
	const rule = getRepeatedAuthorRule( styleKey, markSetting );
	const firstAuthor = firstAuthorDash && rule === 'firstAuthor';

	if ( ! firstAuthor && ( rule === null || rule === 'firstAuthor' ) ) {
		return citations.map( () => null );
	}

	return citations.map( ( citation, index ) => {
		const previous = citations[ index - 1 ];

		// Only formatted entries: a title-only fallback can start with the very
		// names it names.
		if (
			index === 0 ||
			citation.displayOverride ||
			isUnformatted( citation ) ||
			( ! previous?.displayOverride && isUnformatted( previous ) )
		) {
			return null;
		}

		const key = getAuthorKey( citation, firstAuthor );

		if (
			key === null ||
			key !== getAuthorKey( previous, firstAuthor ) ||
			listOf( citation ) !== listOf( previous )
		) {
			return null;
		}

		if ( firstAuthor ) {
			const prefix = getFirstAuthorPrefix(
				citation.csl.author[ 0 ],
				displayText( citation )
			);
			const previousPrefix = getFirstAuthorPrefix(
				previous.csl.author[ 0 ],
				displayText( previous )
			);

			// The same name, whatever follows it ("," or " and ").
			return prefix !== null &&
				previousPrefix !== null &&
				prefix.replace( /,$/, '' ) ===
					previousPrefix.replace( /,$/, '' )
				? prefix
				: null;
		}

		const prefix = getRuleAuthorPrefix(
			citation.csl.author,
			rule,
			styleKey
		);

		if (
			prefix === null ||
			! displayText( citation ).startsWith( `${ prefix }.` ) ||
			! displayText( previous ).startsWith( `${ prefix }.` )
		) {
			return null;
		}

		return prefix;
	} );
}
