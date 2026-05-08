/**
 * Editor component for the Bibliography block.
 */

import { __ } from '@wordpress/i18n';
import {
	useBlockProps,
	InspectorControls,
	BlockControls,
} from '@wordpress/block-editor';
import {
	BaseControl,
	Button,
	Notice,
	PanelBody,
	Placeholder,
	SelectControl,
	TextControl,
	ToggleControl,
	ToolbarButton,
	ToolbarGroup,
} from '@wordpress/components';
import {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
} from '@wordpress/element';
import { EditorCanvasNotices } from './components/editor-canvas-notices';
import { CitationEntryBody } from './components/citation-entry-body';
import { useBlockNotices } from './hooks/use-block-notices';
import { useCitationEditorState } from './hooks/use-citation-editor-state';
import { useEntryFocus } from './hooks/use-entry-focus';
import { useCitationReorder } from './hooks/use-citation-reorder';
import { copyTextToClipboard } from './lib/clipboard';
import {
	getDisplayText,
	getHeadingPlaceholder,
	getListSemantics,
	getSelectableStyles,
	getStyleDefinition,
} from './lib/formatting';
import {
	findDuplicateCitation,
	partitionDuplicateCitations,
} from './lib/deduplicate';
import { SUPPORTED_INPUT_MESSAGE } from './lib/input-support';
import {
	buildManualCsl,
	createEmptyManualEntryFields,
	createManualCitationFromCsl,
	MANUAL_ENTRY_TYPE_OPTIONS,
	validateManualEntry,
} from './lib/manual-entry';
import {
	buildPlainTextBibliographyContent,
	downloadBibtexExport,
	downloadBiblatexExport,
	downloadCslJsonExport,
	downloadRisExport,
} from './lib/export';
import { sortCitations } from './lib/sorter';
import { StructuredCitationEditor } from './components/structured-citation-editor';
import {
	ChevronDownIcon,
	ChevronUpIcon,
	ManualEntryIcon,
	PasteImportIcon,
} from './lib/wp-icons';

const WARNING_MESSAGES = {
	'review-metadata-incomplete': __(
		'Imported metadata may be incomplete. Verify before publishing.',
		'borges-bibliography-builder'
	),
};

const CITATION_FORM_LABEL = __('Add citations', 'borges-bibliography-builder');
const PASTE_IMPORT_TAB_LABEL = __(
	'Paste / Import',
	'borges-bibliography-builder'
);
const MANUAL_ENTRY_TAB_LABEL = __(
	'Manual Entry',
	'borges-bibliography-builder'
);
const FORMATTER_FALLBACK_MESSAGE = __(
	'Formatter unavailable; added fallback citation text.',
	'borges-bibliography-builder'
);

function pluralize(count, singular, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

function buildParseResultMessage({
	addedCount,
	duplicateCount,
	errorCount,
	reviewWarningCount,
	truncated,
	retainedUnparsedItems,
	formatterFallback,
}) {
	const parts = [];

	if (addedCount > 0) {
		parts.push(`Added ${pluralize(addedCount, 'citation')}.`);
	} else if (duplicateCount > 0 || errorCount > 0 || truncated) {
		parts.push('No new citations added.');
	}

	if (duplicateCount > 0) {
		parts.push(`Skipped ${pluralize(duplicateCount, 'duplicate')}.`);
	}

	if (errorCount > 0) {
		parts.push(`Couldn't parse ${pluralize(errorCount, 'item')}.`);
	}

	if (truncated) {
		parts.push('Only the first 50 items were processed.');
	}

	if (reviewWarningCount > 0) {
		parts.push(
			`Review ${pluralize(
				reviewWarningCount,
				'imported record'
			)} before publishing.`
		);
	}

	if (retainedUnparsedItems) {
		parts.push('Unparsed items remain in the form.');
	}

	if (formatterFallback) {
		parts.push(FORMATTER_FALLBACK_MESSAGE);
	}

	return parts.join(' ');
}

export default function Edit({ attributes, setAttributes }) {
	const {
		citations,
		citationStyle,
		headingText,
		outputJsonLd = true,
		outputCoins = false,
		outputCslJson = false,
	} = attributes;
	const selectableStyles = useMemo(() => getSelectableStyles(), []);
	const manualTypeOptions = useMemo(() => MANUAL_ENTRY_TYPE_OPTIONS, []);
	const blockProps = useBlockProps();
	const headingPlaceholder = getHeadingPlaceholder(citationStyle);
	const listStyleDefinition = getStyleDefinition(citationStyle);
	const isNumericFamily = listStyleDefinition.family === 'numeric';
	const ListTag = getListSemantics(citationStyle);
	const listClassName = `bibliography-builder-list bibliography-builder-list-${
		listStyleDefinition.listType === 'ol' ? 'numeric' : 'unordered'
	} bibliography-builder-list-${citationStyle}`;
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [oscolaNoticeDismissed, setOscolaNoticeDismissed] = useState(false);
	const [isFormOpen, setIsFormOpen] = useState(true);
	const [activeAddMode, setActiveAddMode] = useState('paste');
	const [manualFields, setManualFields] = useState(() =>
		createEmptyManualEntryFields()
	);
	const sortedCitations = useMemo(
		() => sortCitations(citations, citationStyle),
		[citationStyle, citations]
	);
	const citationsRef = useRef(citations);
	const { announce, clearNotice, currentNotice, noticeVersion } =
		useBlockNotices();
	const { noticeRef, pasteZoneRef, queueFocus, setEntryRef } = useEntryFocus({
		citations,
		noticeVersion,
	});
	const {
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
		setEditText,
		structuredEditingId,
		structuredFields,
	} = useCitationEditorState({
		announce,
		citationStyle,
		citationsRef,
		clearNotice,
		headingText,
		queueFocus,
		setAttributes,
	});
	const { moveCitationDown, moveCitationUp } = useCitationReorder({
		announce,
		citationsRef,
		queueFocus,
		setAttributes,
	});

	useEffect(() => {
		citationsRef.current = citations;
	}, [citations]);

	useEffect(() => {
		if (isNumericFamily) {
			return;
		}

		const sortedIds = sortedCitations.map((citation) => citation.id);
		const currentIds = citations.map((citation) => citation.id);

		if (
			sortedIds.length === currentIds.length &&
			sortedIds.every((id, index) => id === currentIds[index])
		) {
			return;
		}

		citationsRef.current = sortedCitations;
		setAttributes({ citations: sortedCitations });
	}, [citations, isNumericFamily, setAttributes, sortedCitations]);

	const updatePasteInput = useCallback(
		(nextValue, { syncDom = false } = {}) => {
			setInputValue(nextValue);

			if (
				syncDom &&
				pasteZoneRef.current &&
				pasteZoneRef.current.value !== nextValue
			) {
				pasteZoneRef.current.value = nextValue;
			}
		},
		[pasteZoneRef]
	);

	const handleParse = useCallback(async () => {
		if (!inputValue.trim()) {
			return;
		}

		setIsLoading(true);
		clearNotice();

		try {
			const { parsePastedInput } = await import('./lib/parser');
			const {
				entries,
				errors,
				truncated,
				remainingInput = '',
			} = await parsePastedInput(inputValue, citationStyle, {
				deferFormatting: true,
			});
			const { uniqueEntries, duplicateEntries } =
				partitionDuplicateCitations(entries, citationsRef.current);
			const retainedUnparsedItems = Boolean(remainingInput.trim());

			if (uniqueEntries.length > 0) {
				const { formatBibliographyEntries } = await import(
					'./lib/formatting/csl'
				);
				const mergedEntries = [
					...citationsRef.current,
					...uniqueEntries,
				];
				let formatterFallback = false;
				const formattedTexts = await formatBibliographyEntries(
					mergedEntries.map((citation) => citation.csl),
					citationStyle,
					{
						onFallback: () => {
							formatterFallback = true;
						},
					}
				);
				const formattedMergedEntries = mergedEntries.map(
					(entry, index) => ({
						...entry,
						formattedText: formattedTexts[index],
					})
				);
				const updated = sortCitations(
					formattedMergedEntries,
					citationStyle
				);
				const reviewWarningCount = uniqueEntries.filter(
					(entry) => (entry.parseWarnings || []).length > 0
				).length;
				const firstNewEntry = updated.find((citation) =>
					uniqueEntries.some((entry) => entry.id === citation.id)
				);

				citationsRef.current = updated;
				setAttributes({ citations: updated });

				const message = buildParseResultMessage({
					addedCount: uniqueEntries.length,
					duplicateCount: duplicateEntries.length,
					errorCount: errors.length,
					reviewWarningCount,
					truncated,
					retainedUnparsedItems,
					formatterFallback,
				});
				announce(
					reviewWarningCount > 0 ||
						duplicateEntries.length > 0 ||
						errors.length > 0 ||
						truncated ||
						formatterFallback
						? 'warning'
						: 'success',
					message,
					reviewWarningCount > 0 ||
						duplicateEntries.length > 0 ||
						errors.length > 0 ||
						truncated ||
						formatterFallback
						? {}
						: { type: 'snackbar' }
				);

				if (
					duplicateEntries.length > 0 ||
					errors.length > 0 ||
					truncated ||
					reviewWarningCount > 0 ||
					formatterFallback
				) {
					queueFocus({ type: 'notice' });
				} else if (firstNewEntry) {
					queueFocus({ type: 'entry', id: firstNewEntry.id });
				}
			} else if (duplicateEntries.length > 0) {
				announce(
					'warning',
					buildParseResultMessage({
						addedCount: 0,
						duplicateCount: duplicateEntries.length,
						errorCount: errors.length,
						reviewWarningCount: 0,
						truncated,
						retainedUnparsedItems,
					})
				);
				queueFocus({ type: 'notice' });
			} else if (errors.length > 0) {
				announce('warning', errors[0]);
				queueFocus({ type: 'notice' });
			} else {
				announce('warning', SUPPORTED_INPUT_MESSAGE);
				queueFocus({ type: 'notice' });
			}

			updatePasteInput(remainingInput, { syncDom: true });
		} catch (err) {
			announce(
				'error',
				'Something went wrong while parsing. Please try again.'
			);
			queueFocus({ type: 'notice' });
		} finally {
			setIsLoading(false);
		}
	}, [
		inputValue,
		citationStyle,
		setAttributes,
		announce,
		clearNotice,
		queueFocus,
		updatePasteInput,
	]);

	const handleDelete = useCallback(
		async (id) => {
			const currentCitations = citationsRef.current;
			const deletedIndex = currentCitations.findIndex((c) => c.id === id);
			const entry = currentCitations[deletedIndex];
			let formatterFallback = false;

			if (!entry) {
				return;
			}

			let updated = currentCitations.filter((c) => c.id !== id);

			if (updated.length > 0 && !isNumericFamily) {
				try {
					const { formatBibliographyEntries } = await import(
						'./lib/formatting/csl'
					);
					const formattedTexts = await formatBibliographyEntries(
						updated.map((citation) => citation.csl),
						citationStyle,
						{
							onFallback: () => {
								formatterFallback = true;
							},
						}
					);

					updated = sortCitations(
						updated.map((citation, index) => ({
							...citation,
							formattedText: formattedTexts[index] || '',
						})),
						citationStyle
					);
				} catch (error) {
					formatterFallback = true;
				}
			}

			citationsRef.current = updated;
			setAttributes({ citations: updated });
			announce(
				formatterFallback ? 'warning' : 'success',
				formatterFallback
					? `Citation removed. ${FORMATTER_FALLBACK_MESSAGE}`
					: 'Citation removed.',
				formatterFallback ? {} : { type: 'snackbar' }
			);

			if (!updated.length) {
				queueFocus({ type: 'paste' });
				return;
			}

			const nextEntry =
				updated[deletedIndex] || updated[deletedIndex - 1];

			if (nextEntry) {
				queueFocus({ type: 'entry', id: nextEntry.id });
			}
		},
		[setAttributes, announce, queueFocus, isNumericFamily, citationStyle]
	);

	const handleInputChange = useCallback(
		(valueOrEvent) => {
			const nextValue =
				typeof valueOrEvent === 'string'
					? valueOrEvent
					: valueOrEvent?.target?.value || '';

			updatePasteInput(nextValue);
			if (currentNotice) {
				clearNotice();
			}
		},
		[clearNotice, currentNotice, updatePasteInput]
	);

	const handleInputFocus = useCallback(() => {
		// Notice is cleared on typing (handleInputChange), not on focus,
		// to avoid a race where programmatic focus after parse clears
		// the notice that was just announced.
	}, []);

	const handlePasteInputKeyDown = useCallback((event) => {
		const isUndoRedoShortcut =
			(event.metaKey || event.ctrlKey) &&
			['z', 'Z', 'y', 'Y'].includes(event.key);

		if (isUndoRedoShortcut) {
			event.stopPropagation();
		}
	}, []);

	const handleAddModeChange = useCallback(
		(mode) => {
			setActiveAddMode(mode);
			setIsFormOpen(true);
			clearNotice();
		},
		[clearNotice]
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

		try {
			const csl = buildManualCsl(manualFields);

			if (
				findDuplicateCitation(
					{
						csl,
					},
					citationsRef.current
				)
			) {
				announce(
					'warning',
					'No new citations added. Skipped 1 duplicate.'
				);
				queueFocus({ type: 'notice' });
				return;
			}

			let formatterFallback = false;
			const entry = await createManualCitationFromCsl(
				csl,
				citationStyle,
				{
					onFormatFallback: () => {
						formatterFallback = true;
					},
				}
			);
			const { formatBibliographyEntries } = await import(
				'./lib/formatting/csl'
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
			const updated = sortCitations(
				mergedEntries.map((citation, index) => ({
					...citation,
					formattedText: formattedTexts[index] || '',
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
	}, [announce, citationStyle, manualFields, queueFocus, setAttributes]);

	const handleCopyBibliography = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await copyTextToClipboard(
				buildPlainTextBibliographyContent(
					citationsRef.current,
					citationStyle
				).trimEnd()
			);
			announce('success', 'Copied bibliography.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce('error', 'Could not copy bibliography in this browser.');
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, queueFocus]);

	const handleDownloadCslJson = useCallback(() => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			downloadCslJsonExport(citationsRef.current, citationStyle);
			announce('success', 'Downloaded CSL-JSON export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download CSL-JSON export in this browser.'
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, queueFocus]);

	const handleDownloadBibtex = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await downloadBibtexExport(citationsRef.current, citationStyle);
			announce('success', 'Downloaded BibTeX export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download BibTeX export in this browser.'
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, queueFocus]);

	const handleDownloadBiblatex = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await downloadBiblatexExport(citationsRef.current, citationStyle);
			announce('success', 'Downloaded BibLaTeX export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download BibLaTeX export in this browser.'
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, queueFocus]);

	const handleDownloadRis = useCallback(() => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			downloadRisExport(citationsRef.current, citationStyle);
			announce('success', 'Downloaded RIS export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce('error', 'Could not download RIS export in this browser.');
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, queueFocus]);

	const handleCopyCitation = useCallback(
		async (citation) => {
			try {
				await copyTextToClipboard(getDisplayText(citation));
				announce('success', 'Copied citation.', {
					type: 'snackbar',
				});
			} catch (error) {
				announce('error', 'Could not copy citation in this browser.');
				queueFocus({ type: 'notice' });
			}
		},
		[announce, queueFocus]
	);

	const isHeuristicCitation = useCallback(
		(citation) => citation.inputFormat === 'freetext',
		[]
	);

	const getCitationWarnings = useCallback(
		(citation) =>
			(citation.parseWarnings || [])
				.map((warningCode) => WARNING_MESSAGES[warningCode])
				.filter(Boolean),
		[]
	);

	const isStructuredEditable = useCallback(
		(citation) =>
			isHeuristicCitation(citation) ||
			getCitationWarnings(citation).length > 0,
		[getCitationWarnings, isHeuristicCitation]
	);

	const handleEntryActivate = useCallback(
		(citation) => {
			if (
				editingId === citation.id ||
				structuredEditingId === citation.id
			) {
				return;
			}

			if (isStructuredEditable(citation)) {
				handleStructuredEditStart(citation.id);
				return;
			}

			handleEditStart(citation.id);
		},
		[
			editingId,
			handleEditStart,
			handleStructuredEditStart,
			isStructuredEditable,
			structuredEditingId,
		]
	);

	const handleEntryReorderKeyDown = useCallback(
		(event, citation) => {
			if (
				!isNumericFamily ||
				event.target !== event.currentTarget ||
				!event.altKey
			) {
				return;
			}

			const label = getEntryLabel(citation);

			if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveCitationUp(citation.id, label);
				return;
			}

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveCitationDown(citation.id, label);
			}
		},
		[getEntryLabel, isNumericFamily, moveCitationDown, moveCitationUp]
	);

	const getEntryClassName = (citation) => {
		if (structuredEditingId === citation.id) {
			return 'bibliography-builder-entry is-structured-editing';
		}

		if (editingId === citation.id) {
			return 'bibliography-builder-entry is-inline-editing';
		}

		return 'bibliography-builder-entry';
	};

	const renderAddForm = () => (
		<>
			{activeAddMode === 'paste' ? (
				<>
					<BaseControl
						id="bibliography-builder-paste-input"
						label={CITATION_FORM_LABEL}
						hideLabelFromVision
						className="bibliography-builder-textarea"
					>
						{/* Keep this as a native uncontrolled textarea so browser undo/redo
							behaves normally before submission. */}
						<textarea
							ref={pasteZoneRef}
							id="bibliography-builder-paste-input"
							aria-label={CITATION_FORM_LABEL}
							className="bibliography-builder-native-textarea"
							defaultValue={inputValue}
							onChange={handleInputChange}
							onFocus={handleInputFocus}
							onKeyDown={handlePasteInputKeyDown}
							placeholder={__(
								'Add DOI(s), BibTeX entries, and citations in supported styles for books, articles, chapters, and webpages. Separate multiple formatted citations with a blank line.',
								'borges-bibliography-builder'
							)}
							rows={4}
							disabled={isLoading}
						/>
					</BaseControl>
					<div className="bibliography-builder-form-actions">
						<Button
							variant="primary"
							className="bibliography-builder-parse-button"
							onClick={handleParse}
							disabled={isLoading || !inputValue.trim()}
						>
							{isLoading
								? __(
										'Resolving…',
										'borges-bibliography-builder'
								  )
								: __('Add', 'borges-bibliography-builder')}
						</Button>
					</div>
				</>
			) : (
				<StructuredCitationEditor
					citation={{ id: 'manual-entry' }}
					fields={manualFields}
					fieldDefinitions={manualFieldDefinitions}
					firstFieldRef={pasteZoneRef}
					getStructuredFieldId={getStructuredFieldId}
					onFieldChange={handleManualFieldChange}
					onSave={handleManualAdd}
					onCancel={handleManualClear}
					onCancelLabel={__('Clear', 'borges-bibliography-builder')}
					showTypeSelector
					submitLabel={__('Add', 'borges-bibliography-builder')}
					typeOptions={manualTypeOptions}
					onTypeChange={(value) =>
						handleManualFieldChange('type', value)
					}
				/>
			)}
		</>
	);

	const formToggleLabel = isFormOpen
		? __('Hide citation form', 'borges-bibliography-builder')
		: __('Show citation form', 'borges-bibliography-builder');

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

	return (
		<div {...blockProps}>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						aria-label={PASTE_IMPORT_TAB_LABEL}
						icon={PasteImportIcon}
						label={PASTE_IMPORT_TAB_LABEL}
						title={PASTE_IMPORT_TAB_LABEL}
						isPressed={isFormOpen && activeAddMode === 'paste'}
						onClick={() => handleAddModeChange('paste')}
					/>
					<ToolbarButton
						aria-label={MANUAL_ENTRY_TAB_LABEL}
						icon={ManualEntryIcon}
						label={MANUAL_ENTRY_TAB_LABEL}
						title={MANUAL_ENTRY_TAB_LABEL}
						isPressed={isFormOpen && activeAddMode === 'manual'}
						onClick={() => handleAddModeChange('manual')}
					/>
					{citations.length > 0 && (
						<ToolbarButton
							aria-label={formToggleLabel}
							icon={isFormOpen ? ChevronUpIcon : ChevronDownIcon}
							label={formToggleLabel}
							title={formToggleLabel}
							onClick={() => setIsFormOpen((open) => !open)}
						/>
					)}
				</ToolbarGroup>
			</BlockControls>
			<InspectorControls>
				<PanelBody
					title={
						citations.length
							? `${__(
									'Settings',
									'borges-bibliography-builder'
							  )} (${citations.length} ${
									citations.length === 1
										? __(
												'source',
												'borges-bibliography-builder'
										  )
										: __(
												'sources',
												'borges-bibliography-builder'
										  )
							  })`
							: __('Settings', 'borges-bibliography-builder')
					}
				>
					<SelectControl
						label={__(
							'Citation Style',
							'borges-bibliography-builder'
						)}
						value={citationStyle}
						options={selectableStyles}
						onChange={handleCitationStyleChange}
						help={
							isNumericFamily
								? __(
										"IEEE/Vancouver: arrange entries to match the order they're first cited in your text.",
										'borges-bibliography-builder'
								  )
								: __(
										'Changing styles reformats auto-generated citations and keeps manual overrides intact.',
										'borges-bibliography-builder'
								  )
						}
					/>
					{citationStyle === 'oscola' && !oscolaNoticeDismissed && (
						<Notice
							status="info"
							isDismissible
							onRemove={() => setOscolaNoticeDismissed(true)}
						>
							{__(
								'OSCOLA convention groups bibliographies by source type (cases, legislation, books, articles, online). Borges currently renders a single alphabetized list. See Epic-OSCOLA for tracking.',
								'borges-bibliography-builder'
							)}
						</Notice>
					)}
					<TextControl
						label={__(
							'Visible Heading',
							'borges-bibliography-builder'
						)}
						value={headingText}
						onChange={(value) =>
							setAttributes({ headingText: value })
						}
						placeholder={headingPlaceholder}
						help={__(
							'Optional heading shown above the bibliography on the site front end when at least one citation exists.',
							'borges-bibliography-builder'
						)}
					/>
					<ToggleControl
						label={__(
							'Output JSON-LD',
							'borges-bibliography-builder'
						)}
						checked={outputJsonLd}
						onChange={(value) =>
							setAttributes({ outputJsonLd: value })
						}
						help={__(
							'Helps search engines and other tools understand the bibliography.',
							'borges-bibliography-builder'
						)}
					/>
					<ToggleControl
						label={__(
							'Output COinS',
							'borges-bibliography-builder'
						)}
						checked={outputCoins}
						onChange={(value) =>
							setAttributes({ outputCoins: value })
						}
						help={__(
							'Lets Zotero and similar tools detect citations on the page.',
							'borges-bibliography-builder'
						)}
					/>
					<ToggleControl
						label={__(
							'Output CSL-JSON',
							'borges-bibliography-builder'
						)}
						checked={outputCslJson}
						onChange={(value) =>
							setAttributes({ outputCslJson: value })
						}
						help={__(
							'Makes citation data reusable by scholarly tools and services.',
							'borges-bibliography-builder'
						)}
					/>
				</PanelBody>
				<PanelBody title={__('Exports', 'borges-bibliography-builder')}>
					<Button
						variant="secondary"
						onClick={handleCopyBibliography}
						disabled={!citations.length}
					>
						{__('Copy bibliography', 'borges-bibliography-builder')}
					</Button>
					<p>
						{__(
							'Copies the current bibliography as plain text in the current order and style.',
							'borges-bibliography-builder'
						)}
					</p>
					<Button
						variant="secondary"
						onClick={handleDownloadCslJson}
						disabled={!citations.length}
					>
						{__('Download CSL-JSON', 'borges-bibliography-builder')}
					</Button>
					<p>
						{__(
							'Downloads the current bibliography as structured citation data.',
							'borges-bibliography-builder'
						)}
					</p>
					<Button
						variant="secondary"
						onClick={handleDownloadBibtex}
						disabled={!citations.length}
					>
						{__('Download BibTeX', 'borges-bibliography-builder')}
					</Button>
					<p>
						{__(
							'Downloads the current bibliography as BibTeX for reference-manager and scholarly-writing workflows.',
							'borges-bibliography-builder'
						)}
					</p>
					<Button
						variant="secondary"
						onClick={handleDownloadBiblatex}
						disabled={!citations.length}
					>
						{__('Download BibLaTeX', 'borges-bibliography-builder')}
					</Button>
					<p>
						{__(
							'Downloads the current bibliography as BibLaTeX for LaTeX/Biber workflows with full Unicode support.',
							'borges-bibliography-builder'
						)}
					</p>
					<Button
						variant="secondary"
						onClick={handleDownloadRis}
						disabled={!citations.length}
					>
						{__('Download RIS', 'borges-bibliography-builder')}
					</Button>
					<p>
						{__(
							'Downloads the current bibliography as RIS for citation managers and import/export workflows.',
							'borges-bibliography-builder'
						)}
					</p>
				</PanelBody>
			</InspectorControls>

			{/* Heading */}
			{headingText ? (
				<p className="bibliography-builder-heading bibliography-builder-heading-preview">
					{headingText}
				</p>
			) : null}

			{/* Add form */}
			<div className="bibliography-builder-paste-zone">
				{sortedCitations.length === 0 ? (
					<Placeholder
						label={CITATION_FORM_LABEL}
						instructions={SUPPORTED_INPUT_MESSAGE}
						notices={
							<EditorCanvasNotices
								currentNotice={currentNotice}
								noticeRef={noticeRef}
								onDismiss={clearNotice}
							/>
						}
						className="bibliography-builder-placeholder"
					>
						{renderAddForm()}
					</Placeholder>
				) : (
					<>
						{isFormOpen && renderAddForm()}
						<EditorCanvasNotices
							currentNotice={currentNotice}
							noticeRef={noticeRef}
							onDismiss={clearNotice}
						/>
					</>
				)}
			</div>

			{/* Citation list */}
			{sortedCitations.length > 0 && (
				<ListTag className={listClassName} aria-busy={isLoading}>
					{sortedCitations.map((citation, index) => (
						/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
						<li
							key={citation.id}
							ref={(node) => setEntryRef(citation.id, node)}
							className={getEntryClassName(citation)}
							tabIndex={-1}
							onKeyDown={(event) =>
								handleEntryReorderKeyDown(event, citation)
							}
						>
							<CitationEntryBody
								citation={citation}
								citationWarnings={getCitationWarnings(citation)}
								editText={editText}
								editingId={editingId}
								getEntryLabel={getEntryLabel}
								getStructuredFieldId={getStructuredFieldId}
								handleDelete={handleDelete}
								handleCopyCitation={handleCopyCitation}
								handleEntryActivate={() =>
									handleEntryActivate(citation)
								}
								handleEditConfirm={handleEditConfirm}
								handleEditKeyDown={handleEditKeyDown}
								handleEditStart={handleEditStart}
								handleResetAutoFormat={handleResetAutoFormat}
								handleStructuredEditCancel={
									handleStructuredEditCancel
								}
								handleStructuredEditSave={
									handleStructuredEditSave
								}
								handleStructuredEditStart={
									handleStructuredEditStart
								}
								handleStructuredFieldChange={
									handleStructuredFieldChange
								}
								isNumericFamily={isNumericFamily}
								canMoveUp={index > 0}
								canMoveDown={index < sortedCitations.length - 1}
								onMoveUp={() =>
									moveCitationUp(
										citation.id,
										getEntryLabel(citation)
									)
								}
								onMoveDown={() =>
									moveCitationDown(
										citation.id,
										getEntryLabel(citation)
									)
								}
								isStructuredEditable={isStructuredEditable(
									citation
								)}
								onEditTextChange={setEditText}
								structuredEditingId={structuredEditingId}
								structuredFields={structuredFields}
							/>
						</li>
					))}
				</ListTag>
			)}
		</div>
	);
}
