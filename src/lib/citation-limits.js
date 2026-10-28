import { __, _n, sprintf } from '@wordpress/i18n';
export const MAX_ENTRIES_PER_PASTE = 50;
export const SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY = 100;
export const MAX_CITATIONS_PER_BIBLIOGRAPHY = 200;

export function getBibliographyLimitReachedMessage(
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return sprintf(
		/* translators: %d: maximum citation count. */
		__(
			'This bibliography already has the maximum of %d citations. Remove a citation before adding another.',
			'borges-bibliography-builder'
		),
		limit
	);
}

export function getBibliographyLimitExceededMessage(
	attemptedCount,
	currentCount,
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	const remaining = Math.max( limit - currentCount, 0 );
	const citationLabel = _n(
		'citation',
		'citations',
		attemptedCount,
		'borges-bibliography-builder'
	);
	const slotLabel = _n(
		'slot',
		'slots',
		remaining,
		'borges-bibliography-builder'
	);
	const slotVerb =
		remaining === 1
			? __( 'remains', 'borges-bibliography-builder' )
			: __( 'remain', 'borges-bibliography-builder' );

	return sprintf(
		/* translators: 1: attempted citation count, 2: localized citation/citations label, 3: maximum citation count, 4: remaining slot count, 5: localized slot/slots label, 6: localized remains/remain verb. */
		__(
			'Adding %1$d %2$s would exceed the supported limit of %3$d citations per bibliography. %4$d %5$s %6$s; add fewer items or remove citations first.',
			'borges-bibliography-builder'
		),
		attemptedCount,
		citationLabel,
		limit,
		remaining,
		slotLabel,
		slotVerb
	);
}

export function getBibliographyOverLimitMessage(
	count,
	limit = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return sprintf(
		/* translators: 1: current citation count, 2: maximum citation count. */
		__(
			'This bibliography has %1$d citations, which exceeds the supported limit of %2$d. Remove citations until it is within the supported limit before reformatting.',
			'borges-bibliography-builder'
		),
		count,
		limit
	);
}

export function getBibliographySoftCapWarningMessage(
	count,
	softCap = SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY,
	hardCap = MAX_CITATIONS_PER_BIBLIOGRAPHY
) {
	return sprintf(
		/* translators: 1: current citation count, 2: soft warning threshold, 3: hard citation limit. */
		__(
			'This bibliography has %1$d citations — above the %2$d-entry threshold. Formatting may be slower on shared hosting. The hard limit is %3$d citations.',
			'borges-bibliography-builder'
		),
		count,
		softCap,
		hardCap
	);
}
