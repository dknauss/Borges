import { Button } from '@wordpress/components';
import {
	CopyIcon,
	DeleteIcon,
	EditIcon,
	ResetIcon,
	StructuredEditIcon,
} from '../lib/wp-icons';
import { getDisplaySegments } from '../lib/formatting';
import { StructuredCitationEditor } from './structured-citation-editor';
import { CitationReorderControls } from './citation-reorder-controls';

export function CitationEntryBody({
	citation,
	citationWarnings,
	editText,
	editingId,
	getEntryLabel,
	getStructuredFieldId,
	handleDelete,
	handleEntryActivate,
	handleEditConfirm,
	handleEditKeyDown,
	handleEditStart,
	handleCopyCitation,
	handleResetAutoFormat,
	handleStructuredEditCancel,
	handleStructuredEditSave,
	handleStructuredEditStart,
	handleStructuredFieldChange,
	isNumericFamily = false,
	isStructuredEditable,
	onEditTextChange,
	onMoveDown,
	onMoveUp,
	canMoveDown = false,
	canMoveUp = false,
	structuredEditingId,
	structuredFields,
}) {
	if (structuredEditingId === citation.id) {
		return (
			<StructuredCitationEditor
				citation={citation}
				fields={structuredFields}
				getStructuredFieldId={getStructuredFieldId}
				onFieldChange={handleStructuredFieldChange}
				onSave={handleStructuredEditSave}
				onCancel={handleStructuredEditCancel}
			/>
		);
	}

	if (editingId === citation.id) {
		return (
			<>
				<label
					htmlFor={`bibliography-builder-edit-${citation.id}`}
					className="bibliography-builder-edit-label"
				>
					{`Editing: ${getEntryLabel(citation)}`}
				</label>
				<input
					id={`bibliography-builder-edit-${citation.id}`}
					type="text"
					className="bibliography-builder-edit-input"
					value={editText}
					onChange={(event) => onEditTextChange(event.target.value)}
					onKeyDown={handleEditKeyDown}
					onBlur={handleEditConfirm}
					autoFocus // eslint-disable-line jsx-a11y/no-autofocus
				/>
			</>
		);
	}

	return (
		<>
			<button
				type="button"
				className="bibliography-builder-entry-trigger"
				onClick={handleEntryActivate}
				aria-label={`Edit ${getEntryLabel(citation)}`}
			>
				<span className="bibliography-builder-entry-main">
					<span className="bibliography-builder-entry-text">
						{getDisplaySegments(citation).map((segment, index) =>
							segment.italic ? (
								<i key={`${citation.id}-${index}`}>
									{segment.text}
								</i>
							) : (
								segment.text
							)
						)}
					</span>
					{citationWarnings.map((warningMessage) => (
						<span
							key={`${citation.id}-${warningMessage}`}
							className="bibliography-builder-entry-warning"
						>
							{warningMessage}
						</span>
					))}
				</span>
			</button>
			<span className="bibliography-builder-actions">
				{isNumericFamily && (
					<CitationReorderControls
						label={getEntryLabel(citation)}
						canMoveUp={canMoveUp}
						canMoveDown={canMoveDown}
						onMoveUp={onMoveUp}
						onMoveDown={onMoveDown}
					/>
				)}
				{isStructuredEditable && (
					<Button
						label={`Edit fields for ${getEntryLabel(citation)}`}
						showTooltip
						className="bibliography-builder-action-button"
						onClick={(event) => {
							event.stopPropagation();
							handleStructuredEditStart(citation.id);
						}}
					>
						<StructuredEditIcon className="bibliography-builder-action-icon" />
					</Button>
				)}
				<Button
					label={`Copy citation: ${getEntryLabel(citation)}`}
					showTooltip
					className="bibliography-builder-action-button"
					onClick={(event) => {
						event.stopPropagation();
						handleCopyCitation(citation);
					}}
				>
					<CopyIcon className="bibliography-builder-action-icon" />
				</Button>
				<Button
					label={`Edit citation: ${getEntryLabel(citation)}`}
					showTooltip
					className="bibliography-builder-action-button"
					onClick={(event) => {
						event.stopPropagation();
						handleEditStart(citation.id);
					}}
				>
					<EditIcon className="bibliography-builder-action-icon" />
				</Button>
				{isStructuredEditable && citation.displayOverride && (
					<Button
						label="Reset edits"
						showTooltip
						className="bibliography-builder-action-button"
						onClick={(event) => {
							event.stopPropagation();
							handleResetAutoFormat(citation.id);
						}}
					>
						<ResetIcon className="bibliography-builder-action-icon" />
					</Button>
				)}
				<Button
					label={`Delete citation: ${getEntryLabel(citation)}`}
					showTooltip
					className="bibliography-builder-action-button bibliography-builder-action-button-delete"
					onClick={(event) => {
						event.stopPropagation();
						handleDelete(citation.id);
					}}
				>
					<DeleteIcon className="bibliography-builder-action-icon" />
				</Button>
			</span>
		</>
	);
}
