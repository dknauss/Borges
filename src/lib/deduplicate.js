function normalizeWhitespace( value ) {
	return ( value || '' ).trim().replace( /\s+/gu, ' ' );
}

function normalizeText( value ) {
	return normalizeWhitespace( value )
		.toLowerCase()
		.replace( /[^\p{L}\p{N}\s]/gu, '' );
}

function normalizeDoi( value ) {
	return normalizeWhitespace( value )
		.toLowerCase()
		.replace( /^(?:https?:\/\/)?(?:dx\.)?doi\.org\//u, '' )
		.replace( /[).,;:\s]+$/u, '' );
}

function getNormalizedDoi( citation ) {
	return citation?.csl?.DOI ? normalizeDoi( citation.csl.DOI ) : '';
}

function getNormalizedTitle( citation ) {
	return citation?.csl?.title ? normalizeText( citation.csl.title ) : '';
}

function getNormalizedFirstAuthor( citation ) {
	const firstAuthor = citation?.csl?.author?.[ 0 ];

	if ( ! firstAuthor ) {
		return '';
	}

	return normalizeText( firstAuthor.family || firstAuthor.literal || '' );
}

function getYear( citation ) {
	return citation?.csl?.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ] || null;
}

function citationsMatch( candidate, existing ) {
	const candidateDoi = getNormalizedDoi( candidate );
	const existingDoi = getNormalizedDoi( existing );

	if ( candidateDoi && existingDoi && candidateDoi === existingDoi ) {
		return true;
	}

	const candidateTitle = getNormalizedTitle( candidate );
	const existingTitle = getNormalizedTitle( existing );

	if (
		! candidateTitle ||
		! existingTitle ||
		candidateTitle !== existingTitle
	) {
		return false;
	}

	const candidateYear = getYear( candidate );
	const existingYear = getYear( existing );

	if ( candidateYear && existingYear && candidateYear === existingYear ) {
		return true;
	}

	const candidateAuthor = getNormalizedFirstAuthor( candidate );
	const existingAuthor = getNormalizedFirstAuthor( existing );

	if (
		candidateAuthor &&
		existingAuthor &&
		candidateAuthor === existingAuthor
	) {
		return true;
	}

	return (
		! candidateYear &&
		! existingYear &&
		! candidateAuthor &&
		! existingAuthor
	);
}

/**
 * Find a duplicate citation in an existing list.
 *
 * @param {Object} candidate         Citation object to check.
 * @param {Array}  existingCitations List of existing citations.
 * @return {Object|null} The duplicate citation or null.
 *
 * @since 0.1.0
 */
export function findDuplicateCitation( candidate, existingCitations ) {
	return (
		existingCitations.find( ( existing ) =>
			citationsMatch( candidate, existing )
		) || null
	);
}

/**
 * Partition incoming entries into unique and duplicate lists.
 *
 * @param {Array} incomingEntries   New entries to check.
 * @param {Array} existingCitations Existing citations.
 * @return {{uniqueEntries: Array, duplicateEntries: Array}} Partitioned results.
 *
 * @since 0.1.0
 */
export function partitionDuplicateCitations(
	incomingEntries,
	existingCitations
) {
	const uniqueEntries = [];
	const duplicateEntries = [];
	const seenCitations = [ ...existingCitations ];

	for ( const entry of incomingEntries ) {
		if ( findDuplicateCitation( entry, seenCitations ) ) {
			duplicateEntries.push( entry );
			continue;
		}

		uniqueEntries.push( entry );
		seenCitations.push( entry );
	}

	return {
		uniqueEntries,
		duplicateEntries,
	};
}
