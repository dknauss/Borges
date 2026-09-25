/**
 * Stable block and citation IDs (Phase 05, Tier 0).
 *
 * Every bibliography block carries a `bibliographyId`, and every citation an
 * `id`, so that future write routes can address them without relying on
 * block position. Citation IDs also become the `ref-<id>` element IDs in the
 * saved markup, so they must be unique on the page, not just within a block.
 *
 * Duplicating or copy-pasting a block copies both, which leaves two blocks in
 * one post sharing a `bibliographyId` and two lists sharing `ref-…` element
 * IDs. The block that comes later in document order yields: it takes a new
 * `bibliographyId` and new citation IDs, and the original keeps its own.
 */

import { createCitationId } from './citation-id';

export const BIBLIOGRAPHY_BLOCK_NAME = 'bibliography-builder/bibliography';

// Generated IDs are UUIDs (or the `citation-…` fallback). Anything else in a
// block ID is replaced, since routes take it as a URL segment. An all-digit
// value is replaced too: in a `{ref}` segment it would read as a block index.
const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const ALL_DIGITS = /^\d+$/u;

// Citation IDs are kept whenever they are usable as an HTML id, so existing
// `#ref-…` links survive; only missing, blank, or whitespace-bearing IDs are
// replaced.
const CITATION_ID_PATTERN = /^\S{1,128}$/u;

export function isStableBlockId(value) {
	return (
		typeof value === 'string' &&
		BLOCK_ID_PATTERN.test(value) &&
		!ALL_DIGITS.test(value)
	);
}

export function isStableCitationId(value) {
	return typeof value === 'string' && CITATION_ID_PATTERN.test(value);
}

/**
 * Whether a block earlier in document order already uses this block's ID.
 *
 * @param {string}                                            clientId       This block's client ID.
 * @param {string}                                            bibliographyId This block's `bibliographyId`.
 * @param {Array<{clientId: string, bibliographyId: string}>} orderedBlocks  Bibliography blocks in document order.
 * @return {boolean} True when this block is the later copy.
 */
export function hasEarlierDuplicate(clientId, bibliographyId, orderedBlocks) {
	if (!bibliographyId) {
		return false;
	}

	for (const block of orderedBlocks) {
		if (block.clientId === clientId) {
			return false;
		}

		if (block.bibliographyId === bibliographyId) {
			return true;
		}
	}

	return false;
}

/**
 * Give every citation a usable ID that is unique within the block.
 *
 * @param {Array}   citations  Current citations.
 * @param {boolean} replaceAll Re-key every citation (duplicated block).
 * @return {{citations: Array, changed: boolean}} Result.
 */
function normalizeCitationIds(citations, replaceAll) {
	const seen = new Set();
	let changed = false;

	const next = (Array.isArray(citations) ? citations : []).map((citation) => {
		if (!citation || typeof citation !== 'object') {
			return citation;
		}

		const keep =
			!replaceAll &&
			isStableCitationId(citation.id) &&
			!seen.has(citation.id);
		const id = keep ? citation.id : createCitationId();

		seen.add(id);

		if (keep) {
			return citation;
		}

		changed = true;

		return { ...citation, id };
	});

	return { citations: next, changed };
}

/**
 * Compute the attribute changes needed for stable, unique IDs.
 *
 * @param {Object}  attributes                 Block attributes.
 * @param {string}  attributes.bibliographyId  Current block ID.
 * @param {Array}   attributes.citations       Current citations.
 * @param {Object}  [options={}]               Options.
 * @param {boolean} [options.isDuplicateBlock] This block is a later copy of
 *                                             another block in the post.
 * @return {Object|null} Only the attributes that change (`bibliographyId`
 *                       and/or `citations`), or null when nothing does.
 */
export function ensureStableIds(
	{ bibliographyId, citations = [] },
	{ isDuplicateBlock = false } = {}
) {
	const replaceBlockId = isDuplicateBlock || !isStableBlockId(bibliographyId);
	const normalized = normalizeCitationIds(citations, isDuplicateBlock);

	if (!replaceBlockId && !normalized.changed) {
		return null;
	}

	return {
		...(replaceBlockId ? { bibliographyId: createCitationId() } : {}),
		...(normalized.changed ? { citations: normalized.citations } : {}),
	};
}
