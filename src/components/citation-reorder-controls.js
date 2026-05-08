import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { ChevronDownIcon, ChevronUpIcon } from '../lib/wp-icons';

export function CitationReorderControls({
	canMoveDown,
	canMoveUp,
	label,
	onMoveDown,
	onMoveUp,
}) {
	const moveUpLabel = label
		? `Move '${label}' up`
		: __('Move citation up', 'borges-bibliography-builder');
	const moveDownLabel = label
		? `Move '${label}' down`
		: __('Move citation down', 'borges-bibliography-builder');

	return (
		<>
			<Button
				label={moveUpLabel}
				showTooltip
				className="bibliography-builder-action-button bibliography-builder-action-button-reorder-up"
				disabled={!canMoveUp}
				onClick={(event) => {
					event.stopPropagation();
					onMoveUp();
				}}
			>
				<ChevronUpIcon className="bibliography-builder-action-icon" />
			</Button>
			<Button
				label={moveDownLabel}
				showTooltip
				className="bibliography-builder-action-button bibliography-builder-action-button-reorder-down"
				disabled={!canMoveDown}
				onClick={(event) => {
					event.stopPropagation();
					onMoveDown();
				}}
			>
				<ChevronDownIcon className="bibliography-builder-action-icon" />
			</Button>
		</>
	);
}
