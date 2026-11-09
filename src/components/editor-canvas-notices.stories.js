import { fn } from 'storybook/test';
import { EditorCanvasNotices } from './editor-canvas-notices';

export default {
	title: 'Components/EditorCanvasNotices',
	component: EditorCanvasNotices,
	args: {
		onDismiss: fn(),
	},
};

export const NoNotice = {
	args: { currentNotice: null },
};

export const Success = {
	args: {
		currentNotice: {
			status: 'success',
			message: 'Added 3 citations.',
		},
	},
};

export const Warning = {
	args: {
		currentNotice: {
			status: 'warning',
			message:
				'2 citations were skipped because they are already in this bibliography.',
		},
	},
};

export const Error = {
	args: {
		currentNotice: {
			status: 'error',
			message:
				'No DOI record was found for 10.1000/does-not-exist. Check the DOI, or paste the citation as text.',
		},
	},
};

export const Snackbar = {
	args: {
		currentNotice: {
			type: 'snackbar',
			message: 'Citation copied.',
		},
	},
};
