import {
	ensureStableIds,
	hasEarlierDuplicate,
	isStableBlockId,
	isStableCitationId,
} from './stable-ids';

const UUID = '3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01';

describe('isStableBlockId / isStableCitationId', () => {
	it('accepts generated IDs and rejects blanks and unsafe characters', () => {
		expect(isStableBlockId(UUID)).toBe(true);
		expect(isStableBlockId('citation-lx2k9-4f8a1b2c')).toBe(true);
		expect(isStableBlockId('')).toBe(false);
		expect(isStableBlockId('has space')).toBe(false);
		expect(isStableBlockId('../etc')).toBe(false);
		expect(isStableBlockId(42)).toBe(false);
		// Would read as a block index in a `{ref}` URL segment.
		expect(isStableBlockId('12')).toBe(false);
		expect(isStableBlockId('12a')).toBe(true);
		expect(isStableBlockId('abc\n')).toBe(false);

		expect(isStableCitationId('alpha-1')).toBe(true);
		expect(isStableCitationId('legacy.id:1')).toBe(true);
		expect(isStableCitationId('')).toBe(false);
		expect(isStableCitationId('two words')).toBe(false);
		expect(isStableCitationId(undefined)).toBe(false);
	});
});

describe('ensureStableIds', () => {
	it('returns null when the block and every citation already have stable, unique IDs', () => {
		expect(
			ensureStableIds({
				bibliographyId: UUID,
				citations: [{ id: 'a' }, { id: 'b' }],
			})
		).toBeNull();
	});

	it('assigns a block ID when it is missing or unusable, leaving citations alone', () => {
		const citations = [{ id: 'a' }];

		for (const bibliographyId of ['', undefined, 'not valid!']) {
			const changes = ensureStableIds({ bibliographyId, citations });

			expect(isStableBlockId(changes.bibliographyId)).toBe(true);
			expect(changes).not.toHaveProperty('citations');
		}
	});

	it('backfills missing, blank, and whitespace citation IDs and keeps the rest', () => {
		const changes = ensureStableIds({
			bibliographyId: UUID,
			citations: [
				{ id: 'keep-me', csl: { title: 'A' } },
				{ csl: { title: 'B' } },
				{ id: '', csl: { title: 'C' } },
				{ id: 'has space', csl: { title: 'D' } },
			],
		});

		expect(changes).not.toHaveProperty('bibliographyId');
		expect(changes.citations[0]).toEqual({
			id: 'keep-me',
			csl: { title: 'A' },
		});
		changes.citations.slice(1).forEach((citation) => {
			expect(isStableCitationId(citation.id)).toBe(true);
		});
		expect(changes.citations[1].csl).toEqual({ title: 'B' });
	});

	it('keeps the first of two citations sharing an ID and renames the second', () => {
		const changes = ensureStableIds({
			bibliographyId: UUID,
			citations: [{ id: 'same' }, { id: 'same' }],
		});

		expect(changes.citations[0].id).toBe('same');
		expect(changes.citations[1].id).not.toBe('same');
		expect(isStableCitationId(changes.citations[1].id)).toBe(true);
	});

	it('gives a duplicated block a new block ID and new citation IDs', () => {
		const changes = ensureStableIds(
			{
				bibliographyId: UUID,
				citations: [
					{ id: 'a', csl: { title: 'A' } },
					{ id: 'b', csl: { title: 'B' } },
				],
			},
			{ isDuplicateBlock: true }
		);

		expect(changes.bibliographyId).not.toBe(UUID);
		expect(isStableBlockId(changes.bibliographyId)).toBe(true);
		expect(changes.citations.map((citation) => citation.id)).not.toEqual(
			expect.arrayContaining(['a', 'b'])
		);
		expect(changes.citations.map((citation) => citation.csl)).toEqual([
			{ title: 'A' },
			{ title: 'B' },
		]);
		expect(new Set(changes.citations.map((c) => c.id)).size).toBe(2);
	});

	it('does not mutate the citations it was given', () => {
		const citations = [{ csl: { title: 'A' } }];

		ensureStableIds({ bibliographyId: UUID, citations });

		expect(citations).toEqual([{ csl: { title: 'A' } }]);
	});
});

describe('hasEarlierDuplicate', () => {
	const blocks = [
		{ clientId: 'first', bibliographyId: 'shared' },
		{ clientId: 'other', bibliographyId: 'unique' },
		{ clientId: 'second', bibliographyId: 'shared' },
	];

	it('marks the later block of a pair as the duplicate, never the earlier one', () => {
		expect(hasEarlierDuplicate('second', 'shared', blocks)).toBe(true);
		expect(hasEarlierDuplicate('first', 'shared', blocks)).toBe(false);
		expect(hasEarlierDuplicate('other', 'unique', blocks)).toBe(false);
	});

	it('treats a missing ID as not duplicated', () => {
		expect(hasEarlierDuplicate('second', '', blocks)).toBe(false);
	});
});

describe('stable-ids guards', () => {
	it('treats missing or non-array citations as an empty list', () => {
		expect(ensureStableIds({ bibliographyId: UUID })).toBeNull();
		expect(
			ensureStableIds({ bibliographyId: UUID, citations: 'bogus' })
		).toBeNull();
	});

	it('passes non-object citation entries through untouched', () => {
		const changes = ensureStableIds({
			bibliographyId: UUID,
			citations: [null, 'text', { csl: { title: 'A' } }],
		});

		expect(changes.citations[0]).toBeNull();
		expect(changes.citations[1]).toBe('text');
		expect(isStableCitationId(changes.citations[2].id)).toBe(true);
	});

	it('does not flag a block missing from the ordered list as a duplicate', () => {
		expect(
			hasEarlierDuplicate('absent', 'shared', [
				{ clientId: 'first', bibliographyId: 'other' },
			])
		).toBe(false);
	});
});
