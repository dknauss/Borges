import fs from 'node:fs';
import path from 'node:path';
import { sortCitations } from './sorter';

const CASES_FIXTURE_PATH = path.resolve(
	__dirname,
	'../../tests/fixtures/sort-coordination/cases.json'
);
const MUTATIONS_FIXTURE_PATH = path.resolve(
	__dirname,
	'../../tests/fixtures/sort-coordination/mutations.json'
);

function loadJsonFixture(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function verifyOrderOrThrow({ caseId, actualOrder, expectedOrder, style }) {
	if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
		throw new Error(
			[
				`Sort coordination mismatch for ${caseId} (${style}).`,
				`Expected: ${JSON.stringify(expectedOrder)}`,
				`Actual:   ${JSON.stringify(actualOrder)}`,
			].join('\n')
		);
	}
}

function applyMutationStep(citations, step) {
	switch (step.operation) {
		case 'add':
			return [...citations, clone(step.citation)];
		case 'delete':
			return citations.filter((citation) => citation.id !== step.id);
		case 'edit':
			return citations.map((citation) =>
				citation.id === step.id
					? {
							...citation,
							csl: {
								...citation.csl,
								...clone(step.patch || {}),
							},
					  }
					: citation
			);
		case 'reorder': {
			const byId = new Map(
				citations.map((citation) => [citation.id, citation])
			);
			return step.orderedIds.map((id) => byId.get(id)).filter(Boolean);
		}
		case 'style-change':
			return citations;
		default:
			throw new Error(
				`Unsupported mutation operation: ${step.operation}`
			);
	}
}

describe('PHP↔JS sorter coordination fixtures', () => {
	const staticCases = loadJsonFixture(CASES_FIXTURE_PATH);
	const mutationCases = loadJsonFixture(MUTATIONS_FIXTURE_PATH);

	it.each(staticCases)(
		'static case $id matches expected order for $style',
		({ citations, expectedOrder, id, style }) => {
			const sortedIds = sortCitations(clone(citations), style).map(
				(citation) => citation.id
			);
			expect(() =>
				verifyOrderOrThrow({
					caseId: id,
					actualOrder: sortedIds,
					expectedOrder,
					style,
				})
			).not.toThrow();
		}
	);

	it.each(mutationCases)(
		'mutation sequence $id preserves expected order across steps',
		({ id, initialCitations, initialStyle, steps }) => {
			let currentCitations = clone(initialCitations);
			let currentStyle = initialStyle;

			for (const [stepIndex, step] of steps.entries()) {
				currentCitations = applyMutationStep(currentCitations, step);
				if (step.operation === 'style-change' && step.style) {
					currentStyle = step.style;
				}

				const sortedIds = sortCitations(
					currentCitations,
					currentStyle
				).map((citation) => citation.id);
				expect(() =>
					verifyOrderOrThrow({
						caseId: `${id}#${step.operation}-${stepIndex + 1}`,
						actualOrder: sortedIds,
						expectedOrder: step.expectedOrder,
						style: currentStyle,
					})
				).not.toThrow();
			}
		}
	);

	it('fails loudly when style context drifts from fixture expectations', () => {
		const caseFixture = staticCases.find(
			({ id }) => id === 'case-09-numeric-input-order'
		);
		const desyncedOrder = sortCitations(
			clone(caseFixture.citations),
			'chicago-author-date'
		).map((citation) => citation.id);

		expect(() =>
			verifyOrderOrThrow({
				caseId: `${caseFixture.id}-desynced-style`,
				actualOrder: desyncedOrder,
				expectedOrder: caseFixture.expectedOrder,
				style: 'chicago-author-date',
			})
		).toThrow('Sort coordination mismatch');
	});
});
