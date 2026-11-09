import { fn } from 'storybook/test';
import { Toolbar } from '@wordpress/components';
import { HeadingAlignControl } from './heading-align-control';

export default {
	title: 'Components/HeadingAlignControl',
	component: HeadingAlignControl,
	// The control is a toolbar group, so it needs a toolbar around it.
	decorators: [
		( Story ) => (
			<Toolbar label="Block tools">
				<Story />
			</Toolbar>
		),
	],
	args: {
		onChange: fn(),
	},
	argTypes: {
		value: {
			control: 'inline-radio',
			options: [ 'center', 'start' ],
		},
	},
};

export const Centered = {
	args: { value: 'center' },
};

export const Start = {
	args: { value: 'start' },
};

export const UnknownValueFallsBackToCenter = {
	args: { value: 'justify' },
};
