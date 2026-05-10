export const MAX_ENTRIES_PER_PASTE = 50;
export const SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY = 100;
export const MAX_CITATIONS_PER_BIBLIOGRAPHY = 200;

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
	const slotVerb = remaining === 1 ? 'remains' : 'remain';

	return `Adding ${attemptedCount} ${citationLabel} would exceed the supported limit of ${limit} citations per bibliography. ${remaining} ${slotLabel} ${slotVerb}; add fewer items or remove citations first.`;
}

export function getBibliographyOverLimitMessage(
	count,
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return `This bibliography has ${count} citations, which exceeds the supported limit of ${limit}. Remove citations until it is within the supported limit before reformatting.`;
}

export function getBibliographySoftCapWarningMessage(
	count,
	softCap = SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY,
	hardCap = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return `This bibliography has ${count} citations — above the ${softCap}-entry threshold. Formatting may be slower on shared hosting. The hard limit is ${hardCap} citations.`;
}
