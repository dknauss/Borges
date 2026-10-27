/**
 * Reading a pasted CSL-JSON document into entries, with its error messages.
 *
 * Split from parser.js (refactor memo, Phase E); parser.js re-exports the
 * public names, so importers are unchanged.
 */

import { createCitationId } from './citation-id';
import { MAX_ENTRIES_PER_PASTE } from './citation-limits';
import { validateAndSanitizeCsl } from './csl-sanitize';
import { __, sprintf } from '@wordpress/i18n';
import { normalizeDoiValueForLookup } from './parser-identifiers';

/**
 * The paste parsed as a JSON document, or null when it is not one.
 *
 * A whole-paste JSON document is read as CSL-JSON (a reference manager's
 * "CSL JSON" export, or Borges's own CSL-JSON download). It must not reach
 * the free-text parser, which would turn it into a nonsense webpage citation.
 *
 * @param {string} input Pasted text.
 * @return {Object|Array|null} The parsed object or array.
 */
export function parseJsonDocument(input) {
	const trimmed = input.trim();

	if (!/^[[{]/u.test(trimmed)) {
		return null;
	}

	try {
		const parsed = JSON.parse(trimmed);

		return typeof parsed === 'object' && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

function formatNotCslJsonError() {
	return __(
		'This JSON is not CSL-JSON. Paste a CSL-JSON array, such as a reference manager’s CSL JSON export, or use BibTeX or manual entry.',
		'borges-bibliography-builder'
	);
}

function formatInvalidCslJsonItemsError(positions) {
	return sprintf(
		/* translators: %s: comma-separated positions of the skipped items, such as "2, 5". */
		__(
			'Skipped CSL-JSON items that are not valid citations (item %s).',
			'borges-bibliography-builder'
		),
		positions.join(', ')
	);
}

/**
 * Read a pasted CSL-JSON document: an array of CSL items, or one item.
 *
 * Each item passes through validateAndSanitizeCsl(), as every other import
 * does; an item it rejects is skipped and reported by position. A JSON
 * document with no valid item at all gets its own message rather than the
 * generic help text, so the paste does not look ignored.
 *
 * The items left to retry (skipped as invalid, or over the per-paste limit)
 * stay in the paste box as a CSL-JSON array; the imported ones do not, so a
 * retry cannot duplicate them.
 *
 * @param {Object|Array} document       Parsed JSON.
 * @param {Set<string>}  existingDoiSet Normalized DOIs already in the block.
 * @param {string}       input          The paste, kept whole when nothing in
 *                                      it is CSL-JSON.
 * @return {Object} parsePastedInput() result.
 */
export function readCslJsonDocument(document, existingDoiSet, input) {
	const items = Array.isArray(document) ? document : [document];
	const entries = [];
	const invalidPositions = [];
	const remainingItems = items.slice(MAX_ENTRIES_PER_PASTE);
	let skippedDuplicateCount = 0;

	items.slice(0, MAX_ENTRIES_PER_PASTE).forEach((item, index) => {
		let csl;

		try {
			csl = validateAndSanitizeCsl(item);
		} catch {
			invalidPositions.push(index + 1);
			remainingItems.splice(invalidPositions.length - 1, 0, item);
			return;
		}

		if (
			typeof csl.DOI === 'string' &&
			existingDoiSet.has(normalizeDoiValueForLookup(csl.DOI))
		) {
			skippedDuplicateCount += 1;
			return;
		}

		entries.push({
			id: createCitationId(),
			csl,
			formattedText: null,
			displayOverride: null,
			inputFormat: 'csl-json',
			parseWarnings: [],
		});
	});

	if (!entries.length && !skippedDuplicateCount) {
		return {
			entries,
			errors: [formatNotCslJsonError()],
			truncated: false,
			remainingInput: input.trim(),
			skippedDuplicateCount,
		};
	}

	return {
		entries,
		errors: invalidPositions.length
			? [formatInvalidCslJsonItemsError(invalidPositions)]
			: [],
		truncated: items.length > MAX_ENTRIES_PER_PASTE,
		remainingInput: remainingItems.length
			? JSON.stringify(remainingItems, null, 2)
			: '',
		skippedDuplicateCount,
	};
}
