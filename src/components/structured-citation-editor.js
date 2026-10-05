import { Button } from '@wordpress/components';
import { CancelIcon, ConfirmIcon } from '../lib/wp-icons';
import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

export const STRUCTURED_FIELD_DEFINITIONS = [
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
		// CSL `number`: a journal's article number, used in place of pages.
		key: 'articleNumber',
		label: __('Article number', 'borges-bibliography-builder'),
		types: ['article-journal'],
	},
	{
		key: 'doi',
		label: __('DOI', 'borges-bibliography-builder'),
	},
	{
		key: 'url',
		label: __('URL', 'borges-bibliography-builder'),
	},
];

export function StructuredCitationEditor({
	citation = { id: 'manual-entry' },
	fields,
	fieldDefinitions = STRUCTURED_FIELD_DEFINITIONS,
	getStructuredFieldId,
	firstFieldRef,
	onCancelLabel,
	onFieldChange,
	onSave,
	onCancel,
	showTypeSelector = false,
	submitLabel,
	typeOptions = [],
	onTypeChange,
}) {
	const firstInteractiveFieldRef = useRef(null);
	// Type-specific fields follow the type being entered, else the citation's.
	const entryType = showTypeSelector ? fields.type : citation.csl?.type;

	useEffect(() => {
		firstInteractiveFieldRef.current?.focus();
	}, []);

	const setFirstFieldNode = (node) => {
		firstInteractiveFieldRef.current = node;

		if (!firstFieldRef) {
			return;
		}

		if (typeof firstFieldRef === 'function') {
			firstFieldRef(node);
			return;
		}

		firstFieldRef.current = node;
	};

	const handleKeyDown = (event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
	};

	return (
		<div
			className="bibliography-builder-structured-edit"
			onKeyDownCapture={handleKeyDown}
		>
			{showTypeSelector && (
				<div className="bibliography-builder-structured-field">
					<label htmlFor={getStructuredFieldId(citation.id, 'type')}>
						{__('Publication Type', 'borges-bibliography-builder')}
					</label>
					<select
						id={getStructuredFieldId(citation.id, 'type')}
						ref={setFirstFieldNode}
						value={fields.type || ''}
						onChange={(event) => onTypeChange(event.target.value)}
						onKeyDown={handleKeyDown}
					>
						<option value="">
							{__(
								'Select a publication type',
								'borges-bibliography-builder'
							)}
						</option>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
			)}
			{fieldDefinitions
				.filter(({ types }) => !types || types.includes(entryType))
				.map(({ key, label }, index) => (
					<div
						key={key}
						className="bibliography-builder-structured-field"
					>
						<label htmlFor={getStructuredFieldId(citation.id, key)}>
							{label}
						</label>
						<input
							id={getStructuredFieldId(citation.id, key)}
							ref={
								!showTypeSelector && index === 0
									? setFirstFieldNode
									: undefined
							}
							type="text"
							value={fields[key] || ''}
							onChange={(event) =>
								onFieldChange(key, event.target.value)
							}
							onKeyDown={handleKeyDown}
						/>
					</div>
				))}
			<div className="bibliography-builder-structured-actions">
				<Button
					variant="primary"
					className="bibliography-builder-form-button"
					onClick={onSave}
				>
					<ConfirmIcon className="bibliography-builder-action-icon" />
					{submitLabel || __('Save', 'borges-bibliography-builder')}
				</Button>
				<Button
					variant="secondary"
					className="bibliography-builder-form-button"
					onClick={onCancel}
				>
					<CancelIcon className="bibliography-builder-action-icon" />
					{onCancelLabel ||
						__('Cancel', 'borges-bibliography-builder')}
				</Button>
			</div>
		</div>
	);
}
