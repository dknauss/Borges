import { useCallback } from '@wordpress/element';

function swapEntries(items, fromIndex, toIndex) {
	const next = [...items];
	[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
	return next;
}

function getCitationLabel(citation) {
	const author = citation?.csl?.author?.[0];
	const name = author?.family || author?.literal || 'Unknown';
	const year = citation?.csl?.issued?.['date-parts']?.[0]?.[0] || '';

	return `${name} ${year}`.trim();
}

export function useCitationReorder({
	announce,
	citationsRef,
	queueFocus,
	setAttributes,
}) {
	const moveCitation = useCallback(
		(id, delta, explicitLabel) => {
			const current = citationsRef.current || [];
			const fromIndex = current.findIndex(
				(citation) => citation.id === id
			);

			if (fromIndex === -1) {
				return false;
			}

			const toIndex = fromIndex + delta;
			if (toIndex < 0 || toIndex >= current.length) {
				return false;
			}

			const updated = swapEntries(current, fromIndex, toIndex);
			const movedCitation = updated[toIndex];
			const label = explicitLabel || getCitationLabel(movedCitation);

			citationsRef.current = updated;
			setAttributes({ citations: updated });
			announce(
				'success',
				`Moved '${label}' to position ${toIndex + 1} of ${
					updated.length
				}.`,
				{ type: 'snackbar' }
			);
			queueFocus({ type: 'entry', id });

			return true;
		},
		[announce, citationsRef, queueFocus, setAttributes]
	);

	const moveCitationUp = useCallback(
		(id, label) => moveCitation(id, -1, label),
		[moveCitation]
	);

	const moveCitationDown = useCallback(
		(id, label) => moveCitation(id, 1, label),
		[moveCitation]
	);

	return {
		moveCitationUp,
		moveCitationDown,
	};
}
