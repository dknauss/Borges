import { fn } from 'storybook/test';
import { RepeatedAuthorMarkControl } from './repeated-author-mark-control';

export default {
	title: 'Components/RepeatedAuthorMarkControl',
	component: RepeatedAuthorMarkControl,
	args: {
		value: 'style',
		onChange: fn(),
	},
	argTypes: {
		citationStyle: {
			control: 'select',
			options: [
				'chicago-notes-bibliography',
				'chicago-author-date',
				'mla-9',
				'oscola',
				'abnt',
				'apa-7',
			],
		},
	},
};

/** Chicago writes names out, with the 17th edition's 3-em dash as an option. */
export const Chicago = {
	args: { citationStyle: 'chicago-notes-bibliography' },
};

/** MLA replaces every repeated author with three hyphens by default. */
export const MLA = {
	args: { citationStyle: 'mla-9' },
};

/** OSCOLA replaces a repeated first author with a double em dash. */
export const OSCOLA = {
	args: { citationStyle: 'oscola' },
};

/** ABNT offers NBR 6023:2002's underscore line. */
export const ABNT = {
	args: { citationStyle: 'abnt' },
};

/** Styles with no rule and no optional mark render nothing. */
export const APAShowsNothing = {
	args: { citationStyle: 'apa-7' },
};
