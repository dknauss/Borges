import {
	findDuplicateCitation,
	partitionDuplicateCitations,
} from './deduplicate';

function createCitation( {
	id,
	title,
	family,
	year,
	doi,
	type = 'article-journal',
} ) {
	return {
		id,
		csl: {
			type,
			title,
			...( doi
				? {
						DOI: doi,
					}
				: {} ),
			author: family
				? [
						{
							family,
						},
					]
				: [],
			issued: year
				? {
						'date-parts': [ [ year ] ],
					}
				: undefined,
		},
	};
}

describe( 'findDuplicateCitation', () => {
	it( 'matches citations with the same DOI', () => {
		const existing = [
			createCitation( {
				id: 'existing',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
		];
		const incoming = createCitation( {
			id: 'incoming',
			title: 'Learning Blocks Revised Metadata',
			doi: 'https://doi.org/10.1234/example-doi',
		} );

		expect( findDuplicateCitation( incoming, existing ) ).toEqual(
			existing[ 0 ]
		);
	} );

	it( 'matches citations with the same DOI when one uses a plain doi.org prefix', () => {
		const existing = [
			createCitation( {
				id: 'existing',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
		];
		const incoming = createCitation( {
			id: 'incoming',
			title: 'Learning Blocks Revised Metadata',
			doi: 'doi.org/10.1234/example-doi',
		} );

		expect( findDuplicateCitation( incoming, existing ) ).toEqual(
			existing[ 0 ]
		);
	} );

	it( 'matches citations with the same normalized title and year', () => {
		const existing = [
			createCitation( {
				id: 'existing',
				title: 'The Channels of Student Activism',
				year: 2022,
			} ),
		];
		const incoming = createCitation( {
			id: 'incoming',
			title: 'The Channels of Student Activism.',
			year: 2022,
		} );

		expect( findDuplicateCitation( incoming, existing ) ).toEqual(
			existing[ 0 ]
		);
	} );

	it( 'matches citations with the same normalized title and first author', () => {
		const existing = [
			createCitation( {
				id: 'existing',
				title: 'Responses API',
				family: 'OpenAI',
				type: 'webpage',
			} ),
		];
		const incoming = createCitation( {
			id: 'incoming',
			title: 'Responses API',
			family: 'OpenAI',
			type: 'webpage',
		} );

		expect( findDuplicateCitation( incoming, existing ) ).toEqual(
			existing[ 0 ]
		);
	} );
} );

describe( 'partitionDuplicateCitations', () => {
	it( 'skips duplicates already present in the block', () => {
		const existing = [
			createCitation( {
				id: 'existing',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
		];
		const incoming = [
			createCitation( {
				id: 'incoming',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
		];

		expect( partitionDuplicateCitations( incoming, existing ) ).toEqual( {
			uniqueEntries: [],
			duplicateEntries: [ incoming[ 0 ] ],
		} );
	} );

	it( 'skips duplicates within the same paste batch', () => {
		const incoming = [
			createCitation( {
				id: 'incoming-a',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
			createCitation( {
				id: 'incoming-b',
				title: 'Learning Blocks',
				doi: '10.1234/example-doi',
			} ),
		];

		expect( partitionDuplicateCitations( incoming, [] ) ).toEqual( {
			uniqueEntries: [ incoming[ 0 ] ],
			duplicateEntries: [ incoming[ 1 ] ],
		} );
	} );
} );
