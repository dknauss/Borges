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
 * Mirrored by bibliography_builder_save_repeated_author_prefixes() in
 * includes/save-markup.php; the save-parity fixtures pin the two together.
 */

export const REPEATED_AUTHOR_STYLES = Object.freeze( [ 'mla-9' ] );

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
export const FIRST_AUTHOR_DASH_STYLES = Object.freeze( [ 'oscola' ] );

/**
 * OSCOLA's double em dash, as saved. wptexturize leaves em dashes alone.
 */
export const FIRST_AUTHOR_DASH = '\u2014\u2014';

/**
 * The mark a style replaces repeated authors with.
 *
 * @param {string} styleKey Citation style.
 * @return {string} Three non-breaking hyphens, or OSCOLA's double em dash.
 */
export function getRepeatedAuthorMark( styleKey ) {
	return FIRST_AUTHOR_DASH_STYLES.includes( styleKey )
		? FIRST_AUTHOR_DASH
		: REPEATED_AUTHOR_MARK;
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
 * @param {Object} name CSL name.
 * @return {string} Name, or '' when it has no family name or literal.
 */
function getInvertedName( name ) {
	const literal = namePart( name, 'literal' );

	if ( literal !== '' ) {
		return literal;
	}

	if ( namePart( name, 'family' ) === '' ) {
		return '';
	}

	return [
		joinParts( [
			namePart( name, 'non-dropping-particle' ),
			namePart( name, 'family' ),
		] ),
		joinParts( [
			namePart( name, 'given' ),
			namePart( name, 'dropping-particle' ),
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

	// A name ending in a period ("Jr.", "et al.") shares it with the entry.
	return block.endsWith( '.' ) ? block.slice( 0, -1 ) : block;
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
 * @return {Array<string|null>} Per-citation prefix.
 */
export function getRepeatedAuthorPrefixes(
	citations,
	styleKey,
	displayText,
	{ firstAuthorDash = false, listOf = () => null } = {}
) {
	const firstAuthor =
		firstAuthorDash && FIRST_AUTHOR_DASH_STYLES.includes( styleKey );

	if ( ! firstAuthor && ! REPEATED_AUTHOR_STYLES.includes( styleKey ) ) {
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

		const prefix = getAuthorPrefix( citation.csl.author );

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
