import { useCallback, useRef, useState } from '@wordpress/element';
import {
	getAutoFormattedText,
	getDefaultHeadingText,
	getDisplayText,
	getStyleDefinition,
} from '../lib/formatting';
import {
	normalizeDoiValue,
	normalizeUrlValue,
	validateIdentifierFields,
} from '../lib/manual-entry';
import { sortCitations } from '../lib/sorter';
import {
	MAX_CITATIONS_PER_BIBLIOGRAPHY,
	getBibliographyOverLimitMessage,
} from '../lib/citation-limits';
import { computeExportStrings } from './compute-export-strings';

const FORMATTER_FALLBACK_MESSAGE =
	'Formatter unavailable; using fallback citation text.';

function formatNameForField(name) {
	if (!name) {
		return '';
	}

	if (name.literal) {
		return name.literal;
	}

	if (name.family && name.given) {
		return `${name.family}, ${name.given}`;
	}

	return name.family || name.given || '';
}

function formatAuthorListForField(authors = []) {
	return authors.map(formatNameForField).filter(Boolean).join('; ');
}

function parseAuthorFieldEntry(value) {
	const normalized = value.trim().replace(/[.;]\s*$/u, '');

	if (!normalized) {
		return null;
	}

	if (normalized.includes(',')) {
		const [family, given] = normalized.split(/\s*,\s*/, 2);

		if (!family || !given) {
			return {
				literal: normalized,
			};
		}

		return {
			family: family.trim(),
			given: given.trim(),
		};
	}

	const parts = normalized.split(/\s+/u);

	if (parts.length === 1) {
		return {
			literal: normalized,
		};
	}

	return {
		given: parts.slice(0, -1).join(' '),
		family: parts.at(-1),
	};
}

function parseAuthorFieldList(value) {
	return value
		.split(/\s*;\s*/u)
		.map(parseAuthorFieldEntry)
		.filter(Boolean);
}

export function useCitationEditorState({
	announce,
	beginAsyncOperation = () => 0,
	citationStyle,
	citationsRef,
	clearNotice,
	headingText,
	isCurrentAsyncOperation = () => true,
	queueFocus,
	setAttributes,
}) {
	const [editingId, setEditingId] = useState(null);
	const [editText, setEditText] = useState('');
	const [structuredEditingId, setStructuredEditingId] = useState(null);
	const [structuredFields, setStructuredFields] = useState({});
	const isEscapingEditRef = useRef(false);
	const structuredEditingIdRef = useRef(null);

	const getEntryLabel = useCallback((citation) => {
		const author = citation.csl.author?.[0];
		const name = author?.family || author?.literal || 'Unknown';
		const year = citation.csl.issued?.['date-parts']?.[0]?.[0] || '';
		return `${name} ${year}`.trim();
	}, []);

	const getStructuredFieldId = useCallback(
		(citationId, fieldKey) =>
			`bibliography-builder-${citationId}-${fieldKey}`,
		[]
	);

	const handleEditStart = useCallback(
		(id) => {
			const entry = citationsRef.current.find(
				(citation) => citation.id === id
			);
			if (!entry) {
				return;
			}

			isEscapingEditRef.current = false;
			setEditingId(id);
			setEditText(getDisplayText(entry));
			announce('info', 'Editing citation. Press Escape to cancel.');
		},
		[announce, citationsRef]
	);

	const resetEditingState = useCallback(() => {
		setEditingId(null);
		setEditText('');
		setStructuredEditingId(null);
		setStructuredFields({});
	}, []);

	const handleEditConfirm = useCallback(() => {
		if (isEscapingEditRef.current) {
			isEscapingEditRef.current = false;
			return;
		}

		if (!editingId) {
			return;
		}

		const updated = citationsRef.current.map((citation) => {
			if (citation.id !== editingId) {
				return citation;
			}

			const autoFormattedText = getAutoFormattedText(citation);

			return {
				...citation,
				displayOverride:
					editText === autoFormattedText ? null : editText,
			};
		});

		citationsRef.current = updated;
		setAttributes({ citations: updated });
		clearNotice();
		queueFocus({ type: 'entry', id: editingId });
		isEscapingEditRef.current = false;
		setEditingId(null);
		setEditText('');
	}, [
		clearNotice,
		citationsRef,
		editText,
		editingId,
		queueFocus,
		setAttributes,
	]);

	const handleEditCancel = useCallback(() => {
		if (editingId) {
			isEscapingEditRef.current = true;
			clearNotice();
			queueFocus({ type: 'entry', id: editingId });
		}

		setEditingId(null);
		setEditText('');
	}, [clearNotice, editingId, queueFocus]);

	const handleEditKeyDown = useCallback(
		(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				handleEditConfirm();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				handleEditCancel();
			}
		},
		[handleEditCancel, handleEditConfirm]
	);

	const handleStructuredEditStart = useCallback(
		(id) => {
			const entry = citationsRef.current.find(
				(citation) => citation.id === id
			);

			if (!entry) {
				return;
			}

			structuredEditingIdRef.current = id;
			setStructuredEditingId(id);
			setStructuredFields({
				authors: formatAuthorListForField(entry.csl.author),
				title: entry.csl.title || '',
				containerTitle: entry.csl['container-title'] || '',
				publisher: entry.csl.publisher || '',
				year:
					String(entry.csl.issued?.['date-parts']?.[0]?.[0] || '') ||
					'',
				page: entry.csl.page || '',
				doi: entry.csl.DOI || '',
				url: entry.csl.URL || '',
			});
			announce('info', 'Editing fields. Review and save to reformat.');
		},
		[announce, citationsRef]
	);

	const handleStructuredFieldChange = useCallback((field, value) => {
		setStructuredFields((currentFields) => ({
			...currentFields,
			[field]: value,
		}));
	}, []);

	const handleStructuredEditCancel = useCallback(() => {
		if (structuredEditingId) {
			clearNotice();
			queueFocus({ type: 'entry', id: structuredEditingId });
		}

		structuredEditingIdRef.current = null;
		setStructuredEditingId(null);
		setStructuredFields({});
	}, [clearNotice, queueFocus, structuredEditingId]);

	const handleStructuredEditSave = useCallback(async () => {
		const activeStructuredEditingId =
			structuredEditingIdRef.current || structuredEditingId;

		if (!activeStructuredEditingId) {
			return;
		}

		const citation = citationsRef.current.find(
			(entry) => entry.id === activeStructuredEditingId
		);

		if (!citation) {
			return;
		}

		const identifierValidationMessage =
			validateIdentifierFields(structuredFields);

		if (identifierValidationMessage) {
			announce('warning', identifierValidationMessage);
			queueFocus({ type: 'notice' });
			return;
		}

		const operationId = beginAsyncOperation();

		const updatedCsl = {
			...citation.csl,
			title: structuredFields.title || citation.csl.title,
		};

		if (structuredFields.authors) {
			updatedCsl.author = parseAuthorFieldList(structuredFields.authors);
		} else {
			delete updatedCsl.author;
		}

		if (structuredFields.containerTitle) {
			updatedCsl['container-title'] = structuredFields.containerTitle;
		} else {
			delete updatedCsl['container-title'];
		}

		if (structuredFields.publisher) {
			updatedCsl.publisher = structuredFields.publisher;
		} else {
			delete updatedCsl.publisher;
		}

		if (structuredFields.page) {
			updatedCsl.page = structuredFields.page;
		} else {
			delete updatedCsl.page;
		}

		const normalizedDoi = normalizeDoiValue(structuredFields.doi);
		if (normalizedDoi) {
			updatedCsl.DOI = normalizedDoi;
		} else {
			delete updatedCsl.DOI;
		}

		const normalizedUrl = normalizeUrlValue(structuredFields.url);
		if (normalizedUrl) {
			updatedCsl.URL = normalizedUrl;
		} else {
			delete updatedCsl.URL;
		}

		if (structuredFields.year && /^\d{4}$/u.test(structuredFields.year)) {
			updatedCsl.issued = {
				'date-parts': [[Number(structuredFields.year)]],
			};
		} else {
			delete updatedCsl.issued;
		}

		const { formatBibliographyEntries } = await import(
			'../lib/formatting/csl'
		);

		if (
			structuredEditingIdRef.current !== activeStructuredEditingId ||
			!isCurrentAsyncOperation(operationId)
		) {
			return;
		}

		if (
			!citationsRef.current.some(
				(entry) => entry.id === activeStructuredEditingId
			)
		) {
			structuredEditingIdRef.current = null;
			setStructuredEditingId(null);
			setStructuredFields({});
			return;
		}

		const nextEntries = citationsRef.current.map((entry) =>
			entry.id === activeStructuredEditingId
				? {
						...entry,
						csl: updatedCsl,
						displayOverride: null,
						parseWarnings: [],
				  }
				: entry
		);
		if (nextEntries.length > MAX_CITATIONS_PER_BIBLIOGRAPHY) {
			announce(
				'warning',
				getBibliographyOverLimitMessage(nextEntries.length)
			);
			queueFocus({ type: 'notice' });
			return;
		}

		let formatterFallback = false;
		const formattedTexts = await formatBibliographyEntries(
			nextEntries.map((entry) => entry.csl),
			citationStyle,
			{
				onFallback: () => {
					formatterFallback = true;
				},
			}
		);

		// Second cancel guard: a cancel that arrives during formatBibliographyEntries
		// would set structuredEditingIdRef.current to null — don't commit stale data.
		if (
			structuredEditingIdRef.current !== activeStructuredEditingId ||
			!isCurrentAsyncOperation(operationId)
		) {
			return;
		}

		const exportStrings = await computeExportStrings(
			nextEntries.map((entry) => entry.csl),
			citationStyle
		);

		// Re-check guards after the export await — a cancel or a newer operation
		// could have arrived while building the export strings.
		if (
			structuredEditingIdRef.current !== activeStructuredEditingId ||
			!isCurrentAsyncOperation(operationId)
		) {
			return;
		}

		const updated = sortCitations(
			nextEntries.map((entry, index) => ({
				...entry,
				id: entry.id || crypto.randomUUID(),
				formattedText: formattedTexts[index],
				exportBibtex: exportStrings[index]?.exportBibtex ?? '',
				exportBiblatex: exportStrings[index]?.exportBiblatex ?? '',
			})),
			citationStyle
		);

		citationsRef.current = updated;
		setAttributes({ citations: updated });
		announce(
			formatterFallback ? 'warning' : 'success',
			formatterFallback
				? `Fields updated. ${FORMATTER_FALLBACK_MESSAGE}`
				: 'Fields updated.',
			formatterFallback ? {} : { type: 'snackbar' }
		);
		queueFocus(
			formatterFallback
				? { type: 'notice' }
				: { type: 'entry', id: activeStructuredEditingId }
		);
		structuredEditingIdRef.current = null;
		setStructuredEditingId(null);
		setStructuredFields({});
	}, [
		announce,
		beginAsyncOperation,
		citationStyle,
		citationsRef,
		isCurrentAsyncOperation,
		queueFocus,
		setAttributes,
		structuredEditingId,
		structuredFields,
	]);

	const handleResetAutoFormat = useCallback(
		(id) => {
			const updated = citationsRef.current.map((citation) =>
				citation.id === id
					? {
							...citation,
							displayOverride: null,
					  }
					: citation
			);

			citationsRef.current = updated;
			setAttributes({ citations: updated });
			announce('success', 'Auto-format restored.', {
				type: 'snackbar',
			});
			queueFocus({ type: 'entry', id });
		},
		[announce, citationsRef, queueFocus, setAttributes]
	);

	const handleCitationStyleChange = useCallback(
		async (nextStyle) => {
			if (!nextStyle || nextStyle === citationStyle) {
				return;
			}

			const nextStyleLabel = getStyleDefinition(nextStyle).label;
			const prevDefaultHeading = getDefaultHeadingText(citationStyle);
			const nextDefaultHeading = getDefaultHeadingText(nextStyle);
			const headingUpdate =
				headingText === prevDefaultHeading
					? { headingText: nextDefaultHeading }
					: {};

			if (citationsRef.current.length > MAX_CITATIONS_PER_BIBLIOGRAPHY) {
				announce(
					'warning',
					getBibliographyOverLimitMessage(citationsRef.current.length)
				);
				queueFocus({ type: 'notice' });
				return;
			}

			if (!citationsRef.current.length) {
				setAttributes({ citationStyle: nextStyle, ...headingUpdate });
				announce('success', `Style changed to ${nextStyleLabel}.`, {
					type: 'snackbar',
				});
				return;
			}

			const operationId = beginAsyncOperation();

			const { formatBibliographyEntries } = await import(
				'../lib/formatting/csl'
			);
			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			let formatterFallback = false;
			const formattedTexts = await formatBibliographyEntries(
				citationsRef.current.map((citation) => citation.csl),
				nextStyle,
				{
					onFallback: () => {
						formatterFallback = true;
					},
				}
			);
			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			const exportStrings = await computeExportStrings(
				citationsRef.current.map((citation) => citation.csl),
				nextStyle
			);
			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			const updated = sortCitations(
				citationsRef.current.map((citation, index) => ({
					...citation,
					id: citation.id || crypto.randomUUID(),
					formattedText: formattedTexts[index],
					exportBibtex: exportStrings[index]?.exportBibtex ?? '',
					exportBiblatex: exportStrings[index]?.exportBiblatex ?? '',
				})),
				nextStyle
			);

			citationsRef.current = updated;
			setAttributes({
				citationStyle: nextStyle,
				citations: updated,
				...headingUpdate,
			});
			clearNotice();
			resetEditingState();
			announce(
				formatterFallback ? 'warning' : 'success',
				`Style changed to ${nextStyleLabel}. Reformatted ${
					updated.length
				} ${updated.length === 1 ? 'citation' : 'citations'}.${
					formatterFallback ? ` ${FORMATTER_FALLBACK_MESSAGE}` : ''
				}`,
				formatterFallback ? {} : { type: 'snackbar' }
			);
			if (formatterFallback) {
				queueFocus({ type: 'notice' });
			}
		},
		[
			announce,
			beginAsyncOperation,
			citationStyle,
			citationsRef,
			clearNotice,
			headingText,
			isCurrentAsyncOperation,
			queueFocus,
			resetEditingState,
			setAttributes,
		]
	);

	return {
		editText,
		editingId,
		getEntryLabel,
		getStructuredFieldId,
		handleCitationStyleChange,
		handleEditConfirm,
		handleEditKeyDown,
		handleEditStart,
		handleResetAutoFormat,
		handleStructuredEditCancel,
		handleStructuredEditSave,
		handleStructuredEditStart,
		handleStructuredFieldChange,
		resetEditingState,
		setEditText,
		structuredEditingId,
		structuredFields,
	};
}
