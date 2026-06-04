import { registerBlockType } from '@wordpress/blocks';
import './editor.scss';
import './style.scss';
import Edit from './edit';
import save from './save';
import { deprecated } from './deprecated';
import metadata from '../block.json';
import {
	DEFAULT_CITATION_STYLE,
	getDefaultHeadingText,
} from './lib/formatting';
import { registerBACChecks } from './lib/block-accessibility-checks';

registerBlockType(metadata.name, {
	edit: Edit,
	deprecated,
	save,
	variations: [
		{
			name: 'default',
			isDefault: true,
			attributes: {
				citationStyle: DEFAULT_CITATION_STYLE,
				headingText: getDefaultHeadingText(DEFAULT_CITATION_STYLE),
			},
		},
	],
});

registerBACChecks();
