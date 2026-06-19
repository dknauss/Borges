import { __ } from '@wordpress/i18n';
import { useCallback, useMemo, useState } from '@wordpress/element';
import { findDuplicateCitation } from '../lib/deduplicate';
import {
	buildManualCsl,
	createEmptyManualEntryFields,
	createManualCitationFromCsl,
	MANUAL_ENTRY_TYPE_OPTIONS,
	validateManualEntry,
} from '../lib/manual-entry';
import { sortCitations } from '../lib/sorter';
import { computeExportStrings } from './compute-export-strings';
import {
	MAX_CITATIONS_PER_BIBLIOGRAPHY,
	getBibliographyLimitReachedMessage,
} from '../lib/citation-limits';

const FORMATTER_FALLBACK_MESSAGE = __(
	'Formatter unavailable; added fallback citation text.',
	'borges-bibliography-builder'
);

/**
 * Own manual-entry form state and add/clear mutations.
 *
 * The shared async-operation guard is still injected from `edit.js` so manual
 * add remains coordinated with paste, delete, structured edit, and style
 * changes.
 *
 * @param {Object}   options                         Hook options.
 * @param {Function} options.announce                Notice announcer.
 * @param {Function} options.beginAsyncOperation     Latest-operation starter.
 * @param {string}   options.citationStyle           Current citation style.
 * @param {Object}   options.citationsRef            Mutable citations ref.
 * @param {Function} options.clearNotice             Notice clearer.
 * @param {Object}   options.currentNotice           Current block notice.
 * @param {Function} options.isCurrentAsyncOperation Latest-operation checker.
 * @param {Object}   options.pasteZoneRef            First field/focus ref.
 * @param {Function} options.queueFocus              Focus queue helper.
 * @param {Function} options.setAttributes           Block attribute setter.
 * @return {Object} Manual-entry state and handlers.
 */
export function useManualCitationActions({
	announce,
	beginAsyncOperation,
	citationStyle,
	citationsRef,
	clearNotice,
	currentNotice,
	isCurrentAsyncOperation,
	pasteZoneRef,
	queueFocus,
	setAttributes,
}) {
	const manualTypeOptions = useMemo(() => MANUAL_ENTRY_TYPE_OPTIONS, []);
	const manualFieldDefinitions = useMemo(
		() => [
			{
				key: 'authors',
				label: __('Author(s)', 'borges-bibliography-builder'),
			},
			{
				key: 'title',
				label: __('Title', 'borges-bibliography-builder'),
			},
			{
				key: 'containerTitle',
				label: __('Container', 'borges-bibliography-builder'),
			},
			{
				key: 'publisher',
				label: __('Publisher', 'borges-bibliography-builder'),
			},
			{
				key: 'year',
				label: __('Year', 'borges-bibliography-builder'),
			},
			{
				key: 'page',
				label: __('Pages', 'borges-bibliography-builder'),
			},
			{
				key: 'doi',
				label: __('DOI', 'borges-bibliography-builder'),
			},
			{
				key: 'url',
				label: __('URL', 'borges-bibliography-builder'),
			},
		],
		[]
	);
	const [manualFields, setManualFields] = useState(() =>
		createEmptyManualEntryFields()
	);

	const handleManualFieldChange = useCallback(
		(field, value) => {
			setManualFields((currentFields) => ({
				...currentFields,
				[field]: value,
			}));
			if (currentNotice) {
				clearNotice();
			}
		},
		[clearNotice, currentNotice]
	);

	const handleManualClear = useCallback(() => {
		setManualFields(createEmptyManualEntryFields());
		clearNotice();

		if (pasteZoneRef.current?.focus) {
			pasteZoneRef.current.focus();
		}
	}, [clearNotice, pasteZoneRef]);

	const handleManualAdd = useCallback(async () => {
		const validationMessage = validateManualEntry(manualFields);

		if (validationMessage) {
			announce('warning', validationMessage);
			queueFocus({ type: 'notice' });
			return;
		}

		if (citationsRef.current.length >= MAX_CITATIONS_PER_BIBLIOGRAPHY) {
			announce('warning', getBibliographyLimitReachedMessage());
			queueFocus({ type: 'notice' });
			return;
		}

		try {
			const csl = buildManualCsl(manualFields);

			if (findDuplicateCitation({ csl }, citationsRef.current)) {
				announce(
					'warning',
					'No new citations added. Skipped 1 duplicate.'
				);
				queueFocus({ type: 'notice' });
				return;
			}

			const operationId = beginAsyncOperation();

			let formatterFallback = false;
			const entry = await createManualCitationFromCsl(
				csl,
				citationStyle,
				{
					deferFormatting: true,
				}
			);
			const { formatBibliographyEntries } = await import(
				'../lib/formatting/csl'
			);
			const mergedEntries = [...citationsRef.current, entry];
			const formattedTexts = await formatBibliographyEntries(
				mergedEntries.map((citation) => citation.csl),
				citationStyle,
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
				mergedEntries.map((citation) => citation.csl),
				citationStyle
			);
			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			const updated = sortCitations(
				mergedEntries.map((citation, index) => ({
					...citation,
					id: citation.id || crypto.randomUUID(),
					formattedText: formattedTexts[index] || '',
					exportBibtex: exportStrings[index]?.exportBibtex ?? '',
					exportBiblatex: exportStrings[index]?.exportBiblatex ?? '',
				})),
				citationStyle
			);

			citationsRef.current = updated;
			setAttributes({ citations: updated });
			setManualFields(createEmptyManualEntryFields(manualFields.type));
			announce(
				formatterFallback ? 'warning' : 'success',
				formatterFallback
					? `Added 1 citation. ${FORMATTER_FALLBACK_MESSAGE}`
					: 'Added 1 citation.',
				formatterFallback ? {} : { type: 'snackbar' }
			);
			queueFocus(
				formatterFallback
					? { type: 'notice' }
					: { type: 'entry', id: entry.id }
			);
		} catch (error) {
			announce(
				'error',
				'Something went wrong while adding the citation. Please try again.'
			);
			queueFocus({ type: 'notice' });
		}
	}, [
		announce,
		beginAsyncOperation,
		citationStyle,
		citationsRef,
		isCurrentAsyncOperation,
		manualFields,
		queueFocus,
		setAttributes,
	]);

	return {
		handleManualAdd,
		handleManualClear,
		handleManualFieldChange,
		manualFieldDefinitions,
		manualFields,
		manualTypeOptions,
	};
}
