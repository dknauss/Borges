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
import { useBibliographyExportActions } from './hooks/use-bibliography-export-actions';
import { useCitationImportActions } from './hooks/use-citation-import-actions';
import { useManualCitationActions } from './hooks/use-manual-citation-actions';
import {
	getHeadingPlaceholder,
	getListSemantics,
	getSelectableStyles,
	getStyleDefinition,
} from './lib/formatting';
import { SUPPORTED_INPUT_MESSAGE } from './lib/input-support';
import { sortCitations } from './lib/sorter';
import {
	MAX_CITATIONS_PER_BIBLIOGRAPHY,
	SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY,
	getBibliographyOverLimitMessage,
	getBibliographySoftCapWarningMessage,
} from './lib/citation-limits';
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
	const [softCapNoticeDismissed, setSoftCapNoticeDismissed] = useState(false);
	const atSoftCap =
		citations.length >= SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY &&
		citations.length < MAX_CITATIONS_PER_BIBLIOGRAPHY;
	const [isFormOpen, setIsFormOpen] = useState(true);
	const [activeAddMode, setActiveAddMode] = useState('paste');
	const sortedCitations = useMemo(
		() => sortCitations(citations, citationStyle),
		[citationStyle, citations]
	);
	const citationsRef = useRef(citations);
	const asyncOperationRef = useRef(0);
	const { announce, clearNotice, currentNotice, noticeVersion } =
		useBlockNotices();
	const beginAsyncOperation = useCallback(() => {
		asyncOperationRef.current += 1;
		return asyncOperationRef.current;
	}, []);
	const isCurrentAsyncOperation = useCallback(
		(operationId) => asyncOperationRef.current === operationId,
		[]
	);
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
		beginAsyncOperation,
		citationStyle,
		citationsRef,
		clearNotice,
		headingText,
		isCurrentAsyncOperation,
		queueFocus,
		setAttributes,
	});
	const { moveCitationDown, moveCitationUp } = useCitationReorder({
		announce,
		citationsRef,
		isCurrentAsyncOperation,
		queueFocus,
		setAttributes,
	});
	const {
		handleCopyBibliography,
		handleCopyCitation,
		handleDownloadBiblatex,
		handleDownloadBibtex,
		handleDownloadCslJson,
		handleDownloadRis,
	} = useBibliographyExportActions({
		announce,
		citationStyle,
		citationsRef,
		queueFocus,
	});

	useEffect(() => {
		citationsRef.current = citations;
	}, [citations]);

	useEffect(() => {
		if (!attributes.bibliographyId) {
			setAttributes({ bibliographyId: crypto.randomUUID() });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
	const { handleParse } = useCitationImportActions({
		announce,
		beginAsyncOperation,
		citationStyle,
		citationsRef,
		clearNotice,
		inputValue,
		isCurrentAsyncOperation,
		queueFocus,
		setAttributes,
		setIsLoading,
		updatePasteInput,
	});
	const {
		handleManualAdd,
		handleManualClear,
		handleManualFieldChange,
		manualFieldDefinitions,
		manualFields,
		manualTypeOptions,
	} = useManualCitationActions({
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
	});

	const handleDelete = useCallback(
		async (id) => {
			const currentCitations = citationsRef.current;
			const deletedIndex = currentCitations.findIndex((c) => c.id === id);
			const entry = currentCitations[deletedIndex];
			let formatterFallback = false;
			let overLimitAfterDelete = false;

			if (!entry) {
				return;
			}

			const operationId = beginAsyncOperation();
			let updated = currentCitations.filter((c) => c.id !== id);

			if (updated.length > MAX_CITATIONS_PER_BIBLIOGRAPHY) {
				overLimitAfterDelete = true;
			} else if (updated.length > 0 && !isNumericFamily) {
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

			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			citationsRef.current = updated;
			setAttributes({ citations: updated });
			let noticeMessage = 'Citation removed.';
			if (overLimitAfterDelete) {
				noticeMessage = `Citation removed. ${getBibliographyOverLimitMessage(
					updated.length
				)}`;
			} else if (formatterFallback) {
				noticeMessage = `Citation removed. ${FORMATTER_FALLBACK_MESSAGE}`;
			}

			announce(
				formatterFallback || overLimitAfterDelete
					? 'warning'
					: 'success',
				noticeMessage,
				formatterFallback || overLimitAfterDelete
					? {}
					: { type: 'snackbar' }
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
		[
			setAttributes,
			announce,
			beginAsyncOperation,
			queueFocus,
			isCurrentAsyncOperation,
			isNumericFamily,
			citationStyle,
		]
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

	useEffect(() => {
		if (citations.length < SOFT_CAP_CITATIONS_PER_BIBLIOGRAPHY) {
			setSoftCapNoticeDismissed(false);
		}
	}, [citations.length]);

	const handleAddModeChange = useCallback(
		(mode) => {
			setActiveAddMode(mode);
			setIsFormOpen(true);
			clearNotice();
		},
		[clearNotice]
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
								'Add DOI(s), PubMed/PMID records, BibTeX entries, and citations in supported styles for books, articles, chapters, and webpages. Separate multiple formatted citations with a blank line.',
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

			{/* Soft-cap warning */}
			{atSoftCap && !softCapNoticeDismissed && (
				<Notice
					status="warning"
					isDismissible
					onRemove={() => setSoftCapNoticeDismissed(true)}
				>
					{getBibliographySoftCapWarningMessage(citations.length)}
				</Notice>
			)}

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
