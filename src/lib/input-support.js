import { __ } from '@wordpress/i18n';

export const SUPPORTED_INPUT_MESSAGE = __(
	'Paste a DOI, PMID (PubMed ID), PMCID, arXiv ID, ISBN, OCLC or LCCN number, Open Library ID, Internet Archive link, BibTeX entry, RIS record, CSL-JSON, or supported citation for a book, article, chapter, or webpage. Separate multiple formatted citations with a blank line.',
	'borges-bibliography-builder'
);

/**
 * Error for a pasted link Borges can't read, shown when it comes with other
 * input. A link pasted on its own opens Manual Entry instead, with
 * `BARE_URL_MANUAL_ENTRY_MESSAGE` (#293).
 */
export const BARE_URL_MESSAGE = __(
	"A link alone isn't enough for a citation: Borges can't read the title, author, or date from it. Paste the full citation, or add the link under Manual Entry with its title.",
	'borges-bibliography-builder'
);

/**
 * Notice shown when a lone pasted link moves to Manual Entry.
 */
export const BARE_URL_MANUAL_ENTRY_MESSAGE = __(
	"A link alone isn't enough for a citation: Borges can't read the title, author, or date from it. Manual Entry is open with the link filled in. Add the title, and the author and year if the page gives them.",
	'borges-bibliography-builder'
);

/**
 * Review warning for a citation read from pasted text by a low-confidence
 * free-text pattern. Stored in the entry's `parseWarnings`; `edit.js` shows
 * its message and the import notice counts it.
 */
export const FREE_TEXT_LOW_CONFIDENCE_WARNING = 'free-text-low-confidence';
