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
import { stripHtmlTags } from '../lib/csl-sanitize';

const FORMATTER_FALLBACK_MESSAGE = __(
	'Formatter unavailable; using fallback citation text.',
	'borges-bibliography-builder'
);

function getFieldsSavedMessage(replacedOverride) {
	return replacedOverride
		? __(
				'Fields updated. The edited display text was replaced with the reformatted citation.',
				'borges-bibliography-builder'
		  )
		: __('Fields updated.', 'borges-bibliography-builder');
}

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

/**
 * Parse the Author(s) field back into CSL names.
 *
 * A name whose text is unchanged keeps its original CSL object, so editing
 * one author does not re-parse the others: an organization stays a literal,
 * and a suffix or particle the field does not show survives.
 *
 * @param {string} value     Field text, names separated by semicolons.
 * @param {Array}  originals The citation's CSL names before the edit.
 * @return {Array} CSL names.
 */
function parseAuthorFieldList(value, originals = []) {
	const unused = [...originals];
	const comparable = (text) => text.trim().replace(/[.;]\s*$/u, '');

	return value
		.split(/\s*;\s*/u)
		.map((entry) => {
			const index = unused.findIndex(
				(name) =>
					comparable(formatNameForField(name)) === comparable(entry)
			);

			return index === -1
				? parseAuthorFieldEntry(entry)
				: unused.splice(index, 1)[0];
		})
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
	// The fields as the form opened, so a save writes only what was edited.
	const structuredInitialFieldsRef = useRef({});

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

			const fields = {
				authors: formatAuthorListForField(entry.csl.author),
				title: entry.csl.title || '',
				containerTitle: entry.csl['container-title'] || '',
				publisher: entry.csl.publisher || '',
				year:
					String(entry.csl.issued?.['date-parts']?.[0]?.[0] || '') ||
					'',
				page: entry.csl.page || '',
				// CSL allows a numeric number; the field edits text.
				articleNumber:
					entry.csl.type === 'article-journal' &&
					(entry.csl.number || entry.csl.number === 0)
						? String(entry.csl.number)
						: '',
				doi: entry.csl.DOI || '',
				url: entry.csl.URL || '',
			};

			structuredEditingIdRef.current = id;
			structuredInitialFieldsRef.current = fields;
			setStructuredEditingId(id);
			setStructuredFields(fields);
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

		// Only fields that differ from the form as it opened are written: an
		// imported record keeps every value the user did not touch, exactly as
		// imported (identifiers are not re-normalized, dates and names not
		// rebuilt). A text field that loaded with markup still counts as
		// edited, so it is cleaned on save (see fieldText below).
		const initialFields = structuredInitialFieldsRef.current || {};
		const isEdited = (field) =>
			String(structuredFields[field] ?? '') !==
			String(initialFields[field] ?? '');

		const identifierValidationMessage = validateIdentifierFields({
			doi: isEdited('doi') ? structuredFields.doi : '',
			url: isEdited('url') ? structuredFields.url : '',
		});

		if (identifierValidationMessage) {
			announce('warning', identifierValidationMessage);
			queueFocus({ type: 'notice' });
			return;
		}

		// "n.d." (or "no date") clears the date, as an empty field does.
		const yearText = String(structuredFields.year ?? '').trim();
		const year = /^(?:n\.?\s*d\.?|no date)$/iu.test(yearText)
			? ''
			: yearText;

		if (isEdited('year') && year && !/^\d{1,4}$/u.test(year)) {
			announce(
				'warning',
				__(
					'Enter the year as a number, such as 1977, or leave it empty.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
			return;
		}

		const operationId = beginAsyncOperation();

		// Text fields are stored as plain text, as imports and manual entry
		// store them (validateAndSanitizeCsl): markup typed or pasted into
		// the form is dropped, not saved. A field that loaded with tags is
		// cleaned on save as well.
		const fieldText = (field) =>
			stripHtmlTags(String(structuredFields[field] ?? '')).trim();
		const needsWrite = (field) =>
			isEdited(field) ||
			fieldText(field) !== String(initialFields[field] ?? '').trim();

		const updatedCsl = { ...citation.csl };
		const textFields = [
			['title', 'title'],
			['containerTitle', 'container-title'],
			['publisher', 'publisher'],
			['page', 'page'],
		];

		for (const [field, cslKey] of textFields) {
			if (!needsWrite(field)) {
				continue;
			}

			const text = fieldText(field);

			if (text) {
				updatedCsl[cslKey] = text;
			} else if (cslKey !== 'title') {
				delete updatedCsl[cslKey];
			}
		}

		if (needsWrite('authors')) {
			const authors = fieldText('authors');

			if (authors) {
				updatedCsl.author = parseAuthorFieldList(
					authors,
					citation.csl.author
				);
			} else {
				delete updatedCsl.author;
			}
		}

		// A journal's article number (CSL `number`) has its own field; other
		// types keep whatever `number` they carry.
		if (
			citation.csl.type === 'article-journal' &&
			isEdited('articleNumber')
		) {
			const articleNumber = fieldText('articleNumber');

			if (articleNumber) {
				updatedCsl.number = articleNumber;
			} else {
				delete updatedCsl.number;
			}
			// CrossRef's own copy, kept from a DOI import, would now
			// contradict `number` in the CSL-JSON output.
			delete updatedCsl['article-number'];
		}

		if (isEdited('doi')) {
			const normalizedDoi = normalizeDoiValue(structuredFields.doi);

			if (normalizedDoi) {
				updatedCsl.DOI = normalizedDoi;
			} else {
				delete updatedCsl.DOI;
			}
		}

		if (isEdited('url')) {
			const normalizedUrl = normalizeUrlValue(structuredFields.url);

			if (normalizedUrl) {
				updatedCsl.URL = normalizedUrl;
			} else {
				delete updatedCsl.URL;
			}
		}

		// A corrected year keeps the rest of the date (month, day): only the
		// year part changes. A cleared year removes the date.
		if (isEdited('year')) {
			const originalParts = citation.csl.issued?.['date-parts']?.[0];

			if (!year) {
				delete updatedCsl.issued;
			} else if (Array.isArray(originalParts) && originalParts.length) {
				updatedCsl.issued = {
					'date-parts': [[Number(year), ...originalParts.slice(1)]],
				};
			} else {
				updatedCsl.issued = { 'date-parts': [[Number(year)]] };
			}
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

		// Saving unchanged fields keeps a hand-edited display line; saving an
		// edit reformats the entry from its fields, replacing that line.
		const fieldsChanged = Object.keys(structuredFields).some(needsWrite);
		const replacedOverride =
			fieldsChanged && Boolean(citation.displayOverride);
		const nextEntries = citationsRef.current.map((entry) =>
			entry.id === activeStructuredEditingId
				? {
						...entry,
						csl: updatedCsl,
						displayOverride: fieldsChanged
							? null
							: entry.displayOverride,
						parseWarnings: fieldsChanged ? [] : entry.parseWarnings,
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
				: getFieldsSavedMessage(replacedOverride),
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
