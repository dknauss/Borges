import { fn } from 'storybook/test';
import { CitationReorderControls } from './citation-reorder-controls';

export default {
	title: 'Components/CitationReorderControls',
	component: CitationReorderControls,
	args: {
		label: 'Borges, Jorge Luis. Ficciones. 1944.',
		canMoveUp: true,
		canMoveDown: true,
		onMoveUp: fn(),
		onMoveDown: fn(),
	},
};

export const MiddleEntry = {};

export const FirstEntry = {
	args: { canMoveUp: false },
};

export const LastEntry = {
	args: { canMoveDown: false },
};

export const OnlyEntry = {
	args: { canMoveUp: false, canMoveDown: false },
};

export const NoLabel = {
	args: { label: '' },
};
