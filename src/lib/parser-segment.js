/**
 * Splitting pasted input into items: format detection per chunk, standalone
 * identifier lines, and RIS record and BibTeX entry boundaries.
 *
 * Split from parser.js (refactor memo, Phase E); parser.js re-exports the
 * public names, so importers are unchanged.
 */

import {
	BIBTEX_REGEX,
	DOI_ONLY_REGEX,
	OPEN_LIBRARY_WORK_REGEX,
	PMCID_REGEX,
	PMID_REGEX,
	extractEmbeddedIdentifier,
	getArchiveId,
	getArxivId,
	getCatalogKey,
	getStandaloneIsbn,
} from './parser-identifiers';

/**
 * Detect the format of a single chunk of text.
 *
 * @param {string} chunk Trimmed text segment.
 * @return {{ format: string, value: string, rawValue?: string, fallbackValue?: string }} Detected format descriptor.
 */
function detectFormat( chunk ) {
	if ( PMID_REGEX.test( chunk ) ) {
		return { format: 'pmid', value: chunk };
	}

	if ( PMCID_REGEX.test( chunk ) ) {
		return { format: 'pmcid', value: chunk };
	}

	// Before DOI: arXiv DOIs (10.48550/arXiv.ID) also match DOI_ONLY_REGEX.
	if ( getArxivId( chunk ) ) {
		return { format: 'arxiv', value: chunk };
	}

	if ( getStandaloneIsbn( chunk ) ) {
		return { format: 'isbn', value: chunk };
	}

	if ( getCatalogKey( chunk ) || OPEN_LIBRARY_WORK_REGEX.test( chunk ) ) {
		return { format: 'catalog', value: chunk };
	}

	if ( getArchiveId( chunk ) ) {
		return { format: 'archive', value: chunk };
	}

	if ( DOI_ONLY_REGEX.test( chunk ) ) {
		return { format: 'doi', value: chunk };
	}

	if ( BIBTEX_REGEX.test( chunk ) ) {
		return { format: 'bibtex', value: chunk };
	}

	const embedded = extractEmbeddedIdentifier( chunk );
	if ( embedded ) {
		return { ...embedded, fallbackValue: chunk };
	}

	return { format: 'freetext', value: chunk };
}

export function createDetectedItem(
	format,
	value,
	rawValue = value,
	fallbackValue = undefined
) {
	return {
		format,
		value,
		rawValue,
		...( fallbackValue !== undefined ? { fallbackValue } : {} ),
	};
}

const IDENTIFIER_FORMATS = [
	'doi',
	'pmid',
	'pmcid',
	'arxiv',
	'isbn',
	'catalog',
	'archive',
];

function looksLikeStandaloneCitationLine( line ) {
	const normalizedLine = line.trim();

	if ( ! normalizedLine ) {
		return false;
	}

	const format = detectFormat( normalizedLine ).format;

	if ( IDENTIFIER_FORMATS.includes( format ) ) {
		return true;
	}

	return /(?:\.|[)!?]|https?:\/\/\S+)$/u.test( normalizedLine );
}

export function splitChunkIntoDetectedItems( chunk ) {
	if ( BIBTEX_REGEX.test( chunk ) ) {
		return chunk
			.split( /(?=@\w+\{)/ )
			.map( ( entry ) => entry.trim() )
			.filter( Boolean )
			.map( ( entry ) => createDetectedItem( 'bibtex', entry, entry ) );
	}

	const lines = chunk
		.split( /\n/ )
		.map( ( line ) => line.trim() )
		.filter( Boolean );

	if ( ! lines.length ) {
		return [];
	}

	const allLinesAreIdentifiers =
		lines.length > 1 &&
		lines.every( ( line ) =>
			IDENTIFIER_FORMATS.includes( detectFormat( line ).format )
		);

	if ( allLinesAreIdentifiers ) {
		return lines.map( ( line ) => {
			const detected = detectFormat( line );
			return createDetectedItem( detected.format, line, line );
		} );
	}

	const allLinesLookStandalone =
		lines.length > 1 && lines.every( looksLikeStandaloneCitationLine );

	if ( allLinesLookStandalone ) {
		return lines.map( ( line ) => {
			const detectedLine = detectFormat( line );
			return createDetectedItem(
				detectedLine.format,
				detectedLine.value,
				line,
				detectedLine.fallbackValue
			);
		} );
	}

	const normalizedChunk = lines.join( ' ' );
	const detectedChunk = detectFormat( normalizedChunk );

	return [
		createDetectedItem(
			detectedChunk.format,
			detectedChunk.value,
			chunk.trim(),
			detectedChunk.fallbackValue
		),
	];
}

const BIBTEX_ENTRY_START_REGEX = /@\s*([a-z][\w-]*)\s*\{/giu;
const BIBTEX_IGNORED_ENTRY_TYPES = new Set( [ 'comment', 'preamble' ] );

/**
 * Return the index just past the brace that closes the one at `openIndex`,
 * or the input length when the entry is never closed.
 *
 * @param {string} input     Pasted text.
 * @param {number} openIndex Index of an opening `{`.
 * @return {number} End index (exclusive).
 */
function findBibtexEntryEnd( input, openIndex ) {
	let depth = 0;

	for ( let index = openIndex; index < input.length; index += 1 ) {
		const char = input[ index ];

		if ( char === '\\' ) {
			index += 1;
		} else if ( char === '{' ) {
			depth += 1;
		} else if ( char === '}' ) {
			depth -= 1;

			if ( depth === 0 ) {
				return index + 1;
			}
		}
	}

	return input.length;
}

/**
 * Split pasted input into whole BibTeX entries and the text between them.
 *
 * Entries are lifted out by brace matching before anything splits on blank
 * lines, so a field containing a paragraph break (a multi-paragraph Zotero
 * abstract, say) stays inside its entry. The file-level parts of a
 * reference-manager export are consumed rather than parsed as citations:
 * `@comment` and `@preamble` blocks are dropped, `@string` macros are
 * prepended to every entry so `journal = nature` resolves, and `%` comment
 * lines outside entries (JabRef's `% Encoding:` header) are removed, as
 * BibTeX itself ignores them. When the paste holds any of those file-level
 * blocks, it is a whole `.bib` file rather than a hand-assembled mix, so all
 * other text between entries is dropped too: BibTeX treats it as a comment,
 * and JabRef keeps such comments in the files it saves.
 *
 * @param {string} input Pasted text.
 * @return {Array<{bibtex: boolean, value: string, raw?: string}>} Segments in paste order.
 */
function segmentBibtexInput( input ) {
	const segments = [];
	const macros = [];
	let hasBibtex = false;
	let hasFileLevelBlock = false;
	let cursor = 0;

	for ( const match of input.matchAll( BIBTEX_ENTRY_START_REGEX ) ) {
		if ( match.index < cursor ) {
			continue;
		}

		const end = findBibtexEntryEnd(
			input,
			match.index + match[ 0 ].length - 1
		);
		const entry = input.slice( match.index, end ).trim();
		const entryType = match[ 1 ].toLowerCase();

		segments.push( {
			bibtex: false,
			value: input.slice( cursor, match.index ),
		} );
		hasBibtex = true;
		cursor = end;

		if ( entryType === 'string' ) {
			macros.push( entry );
			hasFileLevelBlock = true;
		} else if ( BIBTEX_IGNORED_ENTRY_TYPES.has( entryType ) ) {
			hasFileLevelBlock = true;
		} else {
			segments.push( { bibtex: true, value: entry, raw: entry } );
		}
	}

	segments.push( { bibtex: false, value: input.slice( cursor ) } );

	return segments
		.map( ( segment ) => {
			if ( segment.bibtex ) {
				return macros.length
					? {
							...segment,
							value: `${ macros.join(
								'\n'
							) }\n${ normalizeBibtexInput( segment.value ) }`,
						}
					: segment;
			}

			if ( hasFileLevelBlock ) {
				return { ...segment, value: '' };
			}

			return hasBibtex
				? {
						...segment,
						value: segment.value.replace( /^[ \t]*%.*$/gmu, '' ),
					}
				: segment;
		} )
		.filter( ( segment ) => segment.value.trim() );
}

const RIS_RECORD_START_REGEX = /^\s*TY {2}- /u;
const RIS_RECORD_END_REGEX = /^\s*ER {2}-/u;

/**
 * Split pasted input into whole RIS records and the text between them.
 *
 * A record runs from its `TY  - ` line to its `ER  - ` line. A record left
 * open ends where the next `TY` line or the input does, so one truncated
 * record does not swallow the next. Line endings in the records are
 * normalized to LF, since Zotero writes RIS with CRLF. Input without a `TY`
 * line is returned as one text part, unchanged.
 *
 * @param {string} input Pasted text.
 * @return {Array<{ris: boolean, value: string}>} Parts in paste order.
 */
function splitRisRecords( input ) {
	const lines = input.split( /\r\n?|\n/u );

	if ( ! lines.some( ( line ) => RIS_RECORD_START_REGEX.test( line ) ) ) {
		return [ { ris: false, value: input } ];
	}

	const parts = [];
	let text = [];
	let record = null;

	const closeRecord = () => {
		if ( record ) {
			parts.push( { ris: true, value: record.join( '\n' ).trim() } );
			record = null;
		}
	};

	for ( const line of lines ) {
		if ( RIS_RECORD_START_REGEX.test( line ) ) {
			closeRecord();
			parts.push( { ris: false, value: text.join( '\n' ) } );
			text = [];
			record = [ line ];
		} else if ( record ) {
			record.push( line );

			if ( RIS_RECORD_END_REGEX.test( line ) ) {
				closeRecord();
			}
		} else {
			text.push( line );
		}
	}

	closeRecord();
	parts.push( { ris: false, value: text.join( '\n' ) } );

	return parts;
}

/**
 * Split pasted input into RIS records, BibTeX entries, and the text between.
 *
 * RIS records are lifted out first, by their `TY` and `ER` lines, so a paste
 * can mix a reference manager's RIS export with DOIs or formatted citations.
 * The rest goes through `segmentBibtexInput()`.
 *
 * @param {string} input Pasted text.
 * @return {Array<{bibtex: boolean, ris?: boolean, value: string, raw?: string}>} Segments in paste order.
 */
export function segmentPastedInput( input ) {
	return splitRisRecords( input ).flatMap( ( part ) =>
		part.ris
			? [
					{
						bibtex: false,
						ris: true,
						value: part.value,
						raw: part.value,
					},
				]
			: segmentBibtexInput( part.value )
	);
}

const BIBTEX_ENTRY_TYPE_ALIASES = {
	artikel: 'article',
	buch: 'book',
	inbuch: 'inbook',
	insammlung: 'incollection',
};

// EndNote's "BibTeX Export" output style writes entries without a cite key
// (`@article{` straight into the fields), and Mendeley writes `@misc{,` for an
// item it has no key for. citation-js rejects both, so a placeholder key is
// added here; the BibTeX backend drops it from the result again.
export const BIBTEX_MISSING_KEY = 'borges-missing-key';

const BIBTEX_FILE_LEVEL_TYPES = new Set( [ 'string', 'comment', 'preamble' ] );

export function normalizeBibtexInput( value ) {
	return value.replace(
		/^(\s*)@([a-z-]+)\s*\{(?:(?=(\s*(?:,|\}|[a-z][\w:.-]*\s*=)))|)/iu,
		( match, leadingWhitespace, entryType, missingKey ) => {
			const type = entryType.toLowerCase();
			const normalizedEntryType =
				BIBTEX_ENTRY_TYPE_ALIASES[ type ] || entryType;
			let key = '';

			if (
				missingKey !== undefined &&
				! BIBTEX_FILE_LEVEL_TYPES.has( type )
			) {
				key = missingKey.trimStart().startsWith( ',' )
					? BIBTEX_MISSING_KEY
					: `${ BIBTEX_MISSING_KEY },`;
			}

			return `${ leadingWhitespace }@${ normalizedEntryType }{${ key }`;
		}
	);
}
