import { fn } from 'storybook/test';
import { useState } from '@wordpress/element';
import { StructuredCitationEditor } from './structured-citation-editor';

const getStructuredFieldId = ( id, key ) =>
	`bibliography-builder-structured-${ id }-${ key }`;

const ARTICLE = {
	id: 'story-article',
	csl: { type: 'article-journal' },
};

const ARTICLE_FIELDS = {
	authors: 'Borges, Jorge Luis',
	title: 'Tlön, Uqbar, Orbis Tertius',
	containerTitle: 'Sur',
	containerTitleShort: 'Sur',
	publisher: '',
	year: '1940',
	page: '',
	articleNumber: '',
	doi: '',
	url: '',
	keepTitleCase: true,
	annotation: '',
};

/**
 * Keeps the fields in state, so typing in the story behaves as it does in
 * the editor, while the actions panel still logs every call.
 *
 * @param {Object}                               props               Story args.
 * @param {Object}                               props.fields        Initial field values.
 * @param {(key: string, value: string) => void} props.onFieldChange Logs each change.
 * @return {Element} The editor.
 */
function Stateful( { fields: initialFields, onFieldChange, ...props } ) {
	const [ fields, setFields ] = useState( initialFields );

	return (
		<StructuredCitationEditor
			{ ...props }
			fields={ fields }
			onFieldChange={ ( key, value ) => {
				setFields( ( current ) => ( { ...current, [ key ]: value } ) );
				onFieldChange( key, value );
			} }
		/>
	);
}

export default {
	title: 'Components/StructuredCitationEditor',
	component: StructuredCitationEditor,
	render: ( args ) => <Stateful { ...args } />,
	args: {
		getStructuredFieldId,
		onFieldChange: fn(),
		onSave: fn(),
		onCancel: fn(),
		onTypeChange: fn(),
	},
};

/** Editing a journal article shows the journal-only fields. */
export const JournalArticle = {
	args: {
		citation: ARTICLE,
		fields: ARTICLE_FIELDS,
	},
};

/** A book hides the journal abbreviation and article number. */
export const Book = {
	args: {
		citation: { id: 'story-book', csl: { type: 'book' } },
		fields: {
			authors: 'Borges, Jorge Luis',
			title: 'Ficciones',
			publisher: 'Sur',
			year: '1944',
		},
	},
};

/** Manual entry starts with the publication type selector. */
export const ManualEntry = {
	args: {
		citation: { id: 'manual-entry' },
		fields: { type: '' },
		showTypeSelector: true,
		submitLabel: 'Add citation',
		typeOptions: [
			{ value: 'article-journal', label: 'Journal article' },
			{ value: 'book', label: 'Book' },
			{ value: 'chapter', label: 'Book chapter' },
			{ value: 'webpage', label: 'Web page' },
		],
	},
};
