/**
 * Helpers shared by the free-text citation patterns: DOI, title, year,
 * edition, and publisher clean-up. Used by `free-text-parser.js` and the
 * per-style pattern modules (`free-text-harvard.js`, `free-text-ieee.js`,
 * `free-text-vancouver.js`).
 */

const DOI_URL_PREFIX =
	/^(?:https?:\/\/(?:dx\.)?doi\.org\/|https?:\/\/doi:|doi:)/i;

export const MONTH_INDEX = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/**
 * The month number for a full or abbreviated English month name: "May",
 * "Sept.", "Oct", "sep".
 *
 * @param {string} name Month name, with or without a full stop.
 * @return {number|undefined} 1 to 12, or undefined when it is not a month.
 */
export function getMonthNumber( name ) {
	const key = name.toLowerCase().replace( /\.$/u, '' );

	if ( key.length < 3 ) {
		return undefined;
	}

	const month = Object.keys( MONTH_INDEX ).find( ( full ) =>
		full.startsWith( key )
	);

	return month ? MONTH_INDEX[ month ] : undefined;
}

/**
 * Remove trailing characters from a set ("., ;"), scanning back from the end.
 *
 * A pattern such as `/[.,\s]+$/` tries every start position in a long run
 * of those characters, which is quadratic; this is linear.
 *
 * @param {string} text  Text to trim.
 * @param {string} chars Characters to remove; white space is always removed.
 * @return {string} Text without them at the end.
 */
export function trimTrailing( text, chars ) {
	let end = text.length;

	while (
		end > 0 &&
		( chars.includes( text[ end - 1 ] ) || /\s/u.test( text[ end - 1 ] ) )
	) {
		end--;
	}

	return text.slice( 0, end );
}

export function normalizeDoi( doiValue ) {
	return doiValue
		.trim()
		.replace( DOI_URL_PREFIX, '' )
		.replace( /[).,;:\s]+$/u, '' );
}

export function normalizeTitle( title ) {
	return title.trim().replace( /[.,]\s*$/u, '' );
}

export function normalizeTrailingSentence( value ) {
	return value.trim().replace( /[.;,:\s]+$/u, '' );
}

export function getIssuedYear( yearText ) {
	return {
		'date-parts': [ [ Number( yearText ) ] ],
	};
}

export function normalizeEdition( editionText ) {
	if ( ! editionText ) {
		return undefined;
	}

	const numberMatch = editionText.match( /\b(\d+)(?:st|nd|rd|th)?\b/iu );

	if ( numberMatch ) {
		return numberMatch[ 1 ];
	}

	return normalizeTrailingSentence(
		editionText.replace( /\bed\.?$/iu, '' ).trim()
	);
}

/**
 * Split Chicago-style "Place: Publisher" publication data.
 *
 * Bibliographies give the place and publisher together, colon-separated
 * ("London: Boyars"); without this the whole string lands in one CSL field.
 * The part before the colon counts as a place only when it is short, starts
 * with a capital, and has no digits, so a publisher name that happens to
 * contain a colon stays whole.
 *
 * @param {string} text Publication text before the year.
 * @return {Object} `publisher`, plus `publisher-place` when a place was split off.
 */
export function getPublisherFields( text ) {
	const value = text.trim();
	const match = value.match(
		/^(?<place>[\p{Lu}][^:\d]{0,60}?)\s*:\s*(?<publisher>\S.*)$/u
	);

	if ( ! match?.groups ) {
		return { publisher: value };
	}

	return {
		'publisher-place': match.groups.place.trim(),
		publisher: match.groups.publisher.trim(),
	};
}
