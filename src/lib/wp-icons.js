import { cloneElement } from '@wordpress/element';
import {
	check,
	chevronDown,
	chevronUp,
	close,
	copy,
	listView,
	pencil,
	undo,
	trash,
} from '@wordpress/icons';

function wrapIcon( iconElement ) {
	return function WrappedIcon( props ) {
		return cloneElement( iconElement, props );
	};
}

export const ChevronDownIcon = wrapIcon( chevronDown );
export const ChevronUpIcon = wrapIcon( chevronUp );
export const PasteImportIcon = wrapIcon( copy );
export const ManualEntryIcon = wrapIcon( pencil );
export const StructuredEditIcon = wrapIcon( listView );
export const EditIcon = wrapIcon( pencil );
export const CopyIcon = wrapIcon( copy );
export const ResetIcon = wrapIcon( undo );
export const DeleteIcon = wrapIcon( trash );
export const ConfirmIcon = wrapIcon( check );
export const CancelIcon = wrapIcon( close );
