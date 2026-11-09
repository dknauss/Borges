/**
 * Clean up NLM conventions in PubMed and PubMed Central CSL-JSON.
 *
 * NCBI's CSL exporter passes several MEDLINE habits through unchanged, and the
 * formatter prints CSL verbatim, so they reach the bibliography:
 *
 * - Given names as bare initials: "C", "KG", or a fore name followed by a bare
 *   middle initial, "Kristien G". Printed as is they read "Zhao, C, and KG
 *   Claeys" in Chicago, and Vancouver drops the G. Each all-capital token of
 *   one to three letters becomes dotted, spaced initials ("K. G.").
 * - Issues as "Pt 8" (MEDLINE's "part"), printed "no. Pt 8". A leading "Pt"
 *   is dropped; other labels such as "Suppl 2" are kept.
 * - Journal titles with an NLM subtitle, "Brain : a journal of neurology". The
 *   subtitle is dropped when the part before " : " is the record's own
 *   `container-title-short`, which is how the journal prints its name.
 *
 * Only NCBI records go through this (src/lib/parser-resolvers.js); other
 * sources and hand-entered CSL may use capitals for other reasons ("WEI").
 * The PHP REST proxy applies the same rules
 * (`bibliography_builder_normalize_ncbi_csl()` in includes/resolvers.php), so
 * REST clients that never load the editor get the same record. Keep the two
 * in step.
 */

const NAME_LIST_FIELDS = [ 'author', 'editor' ];

/**
 * Dot bare initials in a given name.
 *
 * @param {string} given Given name from NCBI.
 * @return {string} Given name with every bare-initials token dotted.
 */
export function dotBareInitials( given ) {
	if ( typeof given !== 'string' ) {
		return given;
	}

	return given
		.trim()
		.split( /\s+/u )
		.map( ( token ) =>
			/^\p{Lu}{1,3}$/u.test( token )
				? Array.from( token )
						.map( ( letter ) => `${ letter }.` )
						.join( ' ' )
				: token
		)
		.join( ' ' );
}

/**
 * Drop MEDLINE's "Pt" (part) label from an issue.
 *
 * @param {unknown} issue CSL issue.
 * @return {unknown} Issue without a leading "Pt".
 */
export function stripIssuePartLabel( issue ) {
	if ( typeof issue !== 'string' ) {
		return issue;
	}

	return issue.replace( /^\s*pt\.?\s+(?=\S)/iu, '' );
}

/**
 * Drop an NLM subtitle from a journal title when the record's short title
 * shows how the journal names itself.
 *
 * @param {unknown} title      CSL container-title.
 * @param {unknown} shortTitle CSL container-title-short.
 * @return {unknown} Title without the subtitle, or unchanged.
 */
export function stripNlmJournalSubtitle( title, shortTitle ) {
	if ( typeof title !== 'string' || typeof shortTitle !== 'string' ) {
		return title;
	}

	const colon = title.indexOf( ' : ' );

	if ( colon < 1 ) {
		return title;
	}

	const main = title.slice( 0, colon ).trim();

	return main.toLowerCase() === shortTitle.trim().toLowerCase()
		? main
		: title;
}

/**
 * Apply the NLM cleanups to one NCBI CSL-JSON record.
 *
 * @param {Object} csl CSL-JSON from NCBI.
 * @return {Object} A cleaned copy; the input is not changed.
 */
export function normalizeNcbiCsl( csl ) {
	if ( ! csl || typeof csl !== 'object' || Array.isArray( csl ) ) {
		return csl;
	}

	const next = { ...csl };

	for ( const field of NAME_LIST_FIELDS ) {
		if ( Array.isArray( next[ field ] ) ) {
			next[ field ] = next[ field ].map( ( name ) =>
				name && typeof name.given === 'string'
					? { ...name, given: dotBareInitials( name.given ) }
					: name
			);
		}
	}

	if ( 'issue' in next ) {
		next.issue = stripIssuePartLabel( next.issue );
	}

	if ( 'container-title' in next ) {
		next[ 'container-title' ] = stripNlmJournalSubtitle(
			next[ 'container-title' ],
			next[ 'container-title-short' ]
		);
	}

	return next;
}
