export const MAX_ENTRIES_PER_PASTE = 50;
export const MAX_CITATIONS_PER_BIBLIOGRAPHY = 50;

export function getBibliographyLimitReachedMessage(
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return `This bibliography already has the maximum of ${limit} citations. Remove a citation before adding another.`;
}

export function getBibliographyLimitExceededMessage(
	attemptedCount,
	currentCount,
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	const remaining = Math.max(limit - currentCount, 0);
	const citationLabel = attemptedCount === 1 ? 'citation' : 'citations';
	const slotLabel = remaining === 1 ? 'slot' : 'slots';

	return `Adding ${attemptedCount} ${citationLabel} would exceed the supported limit of ${limit} citations per bibliography. ${remaining} ${slotLabel} remain; add fewer items or remove citations first.`;
}

export function getBibliographyOverLimitMessage(
	count,
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return `This bibliography has ${count} citations, which exceeds the supported limit of ${limit}. Remove citations until it is within the supported limit before reformatting.`;
}
