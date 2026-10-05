import { useCallback, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
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
import { createCitationId } from '../lib/citation-id';

const FORMATTER_FALLBACK_MESSAGE = __(
	'Formatter unavailable; using fallback citation text.',
	'borges-bibliography-builder'
);

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
	outputCiteExport = false,
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
		const name =
			author?.family ||
			author?.literal ||
			__('Unknown', 'borges-bibliography-builder');
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
			announce(
				'info',
				__(
					'Editing citation. Press Escape to cancel.',
					'borges-bibliography-builder'
				)
			);
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
			announce(
				'info',
				__(
					'Editing fields. Review and save to reformat.',
					'borges-bibliography-builder'
				)
			);
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

		// A DOI import copies CrossRef's article-number into `number`, which
		// this form does not show and which some styles prefer to `page`. When
		// the user changes Pages, drop that hidden copy so the edit shows.
		if (
			(structuredFields.page || '') !== (citation.csl.page || '') &&
			citation.csl.number &&
			citation.csl.number === citation.csl['article-number']
		) {
			delete updatedCsl.number;
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

		// Only pre-compute the async BibTeX/BibLaTeX export strings when the
		// Cite/Export feature is enabled (RIS/CSL-JSON are built in save()).
		let exportStrings = null;
		if (outputCiteExport) {
			exportStrings = await computeExportStrings(
				nextEntries.map((entry) => entry.csl),
				citationStyle
			);

			// Re-check guards after the export await — a cancel or a newer
			// operation could have arrived while building the export strings.
			if (
				structuredEditingIdRef.current !== activeStructuredEditingId ||
				!isCurrentAsyncOperation(operationId)
			) {
				return;
			}
		}

		const updated = sortCitations(
			nextEntries.map((entry, index) => ({
				...entry,
				id: entry.id || createCitationId(),
				formattedText: formattedTexts[index],
				// A structured edit changes the CSL, so drop any stale export
				// strings; they are recomputed above (when enabled) or backfilled
				// by the editor effect when the feature is on.
				exportBibtex: exportStrings
					? exportStrings[index]?.exportBibtex ?? ''
					: undefined,
				exportBiblatex: exportStrings
					? exportStrings[index]?.exportBiblatex ?? ''
					: undefined,
			})),
			citationStyle
		);

		citationsRef.current = updated;
		setAttributes({ citations: updated });
		announce(
			formatterFallback ? 'warning' : 'success',
			formatterFallback
				? sprintf(
						/* translators: %s: formatter fallback message. */
						__('Fields updated. %s', 'borges-bibliography-builder'),
						FORMATTER_FALLBACK_MESSAGE
				  )
				: __('Fields updated.', 'borges-bibliography-builder'),
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
		outputCiteExport,
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
			announce(
				'success',
				__('Auto-format restored.', 'borges-bibliography-builder'),
				{
					type: 'snackbar',
				}
			);
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
				announce(
					'success',
					sprintf(
						/* translators: %s: citation style label. */
						__(
							'Style changed to %s.',
							'borges-bibliography-builder'
						),
						nextStyleLabel
					),
					{
						type: 'snackbar',
					}
				);
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

			// A style change does not alter the CSL, so existing export strings
			// stay valid; only (re)compute when the feature is enabled.
			let exportStrings = null;
			if (outputCiteExport) {
				exportStrings = await computeExportStrings(
					citationsRef.current.map((citation) => citation.csl),
					nextStyle
				);
				if (!isCurrentAsyncOperation(operationId)) {
					return;
				}
			}

			const updated = sortCitations(
				citationsRef.current.map((citation, index) => ({
					...citation,
					id: citation.id || createCitationId(),
					formattedText: formattedTexts[index],
					// Preserve existing strings when not recomputing (the spread
					// keeps them); a style change never invalidates them.
					...(exportStrings
						? {
								exportBibtex:
									exportStrings[index]?.exportBibtex ?? '',
								exportBiblatex:
									exportStrings[index]?.exportBiblatex ?? '',
						  }
						: {}),
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
				formatterFallback
					? sprintf(
							/* translators: 1: citation style label, 2: reformatted citation count, 3: localized citation/citations label, 4: formatter fallback message. */
							__(
								'Style changed to %1$s. Reformatted %2$d %3$s. %4$s',
								'borges-bibliography-builder'
							),
							nextStyleLabel,
							updated.length,
							_n(
								'citation',
								'citations',
								updated.length,
								'borges-bibliography-builder'
							),
							FORMATTER_FALLBACK_MESSAGE
					  )
					: sprintf(
							/* translators: 1: citation style label, 2: reformatted citation count, 3: localized citation/citations label. */
							__(
								'Style changed to %1$s. Reformatted %2$d %3$s.',
								'borges-bibliography-builder'
							),
							nextStyleLabel,
							updated.length,
							_n(
								'citation',
								'citations',
								updated.length,
								'borges-bibliography-builder'
							)
					  ),
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
			outputCiteExport,
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
