import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { performance } from 'perf_hooks';
import apiFetch from '@wordpress/api-fetch';
import { parsePastedInput } from '../lib/parser';
import {
	clearFormattingCache,
	formatBibliographyEntries,
} from '../lib/formatting/csl';
import { sortCitations } from '../lib/sorter';
import {
	buildManualCsl,
	createEmptyManualEntryFields,
	createManualCitation,
} from '../lib/manual-entry';

jest.mock('@wordpress/api-fetch', () => jest.fn());

const FORMATTER_MODE = 'controlled-test-double';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'output', 'benchmarks');
const fixturesDir = path.join(repoRoot, 'src', 'benchmarks', 'fixtures');
const FIXTURE_NAMES = [
	'import-freetext-10.txt',
	'import-freetext-25.txt',
	'import-freetext-50.txt',
];
const STYLE_SWITCH_SEQUENCE = ['ieee', 'vancouver', 'mla-9'];
const DEFAULT_STYLE = 'chicago-notes-bibliography';
const RUNS = 5;
const LARGE_SIZES = [75, 100, 150, 200];
// SPEC §Rate Limiting & Resource Caps budget thresholds
const BUDGET_STYLE_SWITCH_P95_MS = 250;
const BUDGET_MUTATION_P95_MS = 150;
// One style from each family: notes, author-date, numeric
const LARGE_STYLE_FAMILIES = [
	{ styleKey: 'chicago-notes-bibliography', family: 'notes' },
	{ styleKey: 'chicago-author-date', family: 'author-date' },
	{ styleKey: 'ieee', family: 'numeric' },
];
const BUILD_ASSET_EXTENSIONS = new Set(['.css', '.js', '.php']);

function readFixture(name) {
	return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

function loadCslFixture(name) {
	return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function cslToEntries(cslItems) {
	return cslItems.map((csl, index) => ({
		id: csl.id,
		csl,
		formattedText: `mock:${csl.title || `Entry ${index + 1}`}`,
		displayOverride: null,
	}));
}

function round(value) {
	return Number(value.toFixed(2));
}

function summarize(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const total = values.reduce((sum, value) => sum + value, 0);
	const average = total / values.length;
	const median =
		sorted.length % 2 === 1
			? sorted[(sorted.length - 1) / 2]
			: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

	const percentile = (rank) =>
		sorted[
			Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)
		];

	return {
		runs: values.map(round),
		minMs: round(sorted[0]),
		maxMs: round(sorted[sorted.length - 1]),
		avgMs: round(average),
		medianMs: round(median),
		p50Ms: round(percentile(0.5)),
		p95Ms: round(percentile(0.95)),
	};
}

function summarizeBytes(bytes) {
	return {
		bytes,
		kb: round(bytes / 1024),
	};
}

function getBuildFootprint() {
	const buildDir = path.join(repoRoot, 'build');

	if (!fs.existsSync(buildDir)) {
		return {
			available: false,
			assets: [],
			totals: summarizeBuildAssets([]),
		};
	}

	const assets = fs
		.readdirSync(buildDir)
		.filter((fileName) =>
			BUILD_ASSET_EXTENSIONS.has(path.extname(fileName))
		)
		.map((fileName) => {
			const filePath = path.join(buildDir, fileName);
			const contents = fs.readFileSync(filePath);

			return {
				file: fileName,
				raw: summarizeBytes(contents.length),
				gzip: summarizeBytes(zlib.gzipSync(contents).length),
			};
		})
		.sort((left, right) => left.file.localeCompare(right.file));

	return {
		available: true,
		assets,
		totals: summarizeBuildAssets(assets),
	};
}

function summarizeBuildAssets(assets) {
	const rawBytes = assets.reduce(
		(total, asset) => total + asset.raw.bytes,
		0
	);
	const gzipBytes = assets.reduce(
		(total, asset) => total + asset.gzip.bytes,
		0
	);

	return {
		raw: summarizeBytes(rawBytes),
		gzip: summarizeBytes(gzipBytes),
	};
}

async function timeAsync(fn) {
	const start = performance.now();
	const result = await fn();
	return {
		result,
		elapsedMs: performance.now() - start,
	};
}

async function benchmarkFixtureImport(name) {
	const input = readFixture(name);
	const parseDeferredRuns = [];
	const coldFormatRuns = [];
	const warmFormatRuns = [];
	const combinedRuns = [];
	let entryCount = 0;

	for (let index = 0; index < RUNS; index += 1) {
		clearFormattingCache();
		const deferred = await timeAsync(() =>
			parsePastedInput(input, DEFAULT_STYLE, { deferFormatting: true })
		);
		parseDeferredRuns.push(deferred.elapsedMs);
		entryCount = deferred.result.entries.length;

		const coldFormat = await timeAsync(() =>
			Promise.resolve(
				formatBibliographyEntries(
					deferred.result.entries.map((entry) => entry.csl),
					DEFAULT_STYLE
				)
			)
		);
		const warmFormat = await timeAsync(() =>
			Promise.resolve(
				formatBibliographyEntries(
					deferred.result.entries.map((entry) => entry.csl),
					DEFAULT_STYLE
				)
			)
		);
		coldFormatRuns.push(coldFormat.elapsedMs);
		warmFormatRuns.push(warmFormat.elapsedMs);
		combinedRuns.push(deferred.elapsedMs + coldFormat.elapsedMs);
	}

	return {
		fixture: name,
		entries: entryCount,
		parseDeferred: summarize(parseDeferredRuns),
		formatBatchCold: summarize(coldFormatRuns),
		formatBatchWarm: summarize(warmFormatRuns),
		combinedEditorPath: summarize(combinedRuns),
	};
}

async function benchmarkStyleSwitch(baseEntries) {
	const results = [];

	for (const styleKey of STYLE_SWITCH_SEQUENCE) {
		const runs = [];

		for (let index = 0; index < RUNS; index += 1) {
			clearFormattingCache();
			const { elapsedMs } = await timeAsync(() =>
				Promise.resolve(
					formatBibliographyEntries(
						baseEntries.map((entry) => entry.csl),
						styleKey
					)
				)
			);
			runs.push(elapsedMs);
		}

		results.push({
			styleKey,
			...summarize(runs),
		});
	}

	return results;
}

async function benchmarkManualEntry() {
	const runs = [];
	const fields = {
		...createEmptyManualEntryFields('book'),
		title: 'Benchmark Manual Entry',
		authors: 'Example, Ada',
		year: '2026',
	};

	for (let index = 0; index < RUNS; index += 1) {
		clearFormattingCache();
		const { elapsedMs } = await timeAsync(() =>
			createManualCitation(fields, DEFAULT_STYLE)
		);
		runs.push(elapsedMs);
	}

	return summarize(runs);
}

async function benchmarkEditorMutationPaths(baseEntries) {
	const addRuns = [];
	const editRuns = [];
	const deleteAuthorDateRuns = [];
	const deleteNumericRuns = [];
	const manualCsl = buildManualCsl({
		...createEmptyManualEntryFields('book'),
		title: 'Benchmark Added Citation',
		authors: 'Benchmark, Ada',
		year: '2026',
	});

	for (let index = 0; index < RUNS; index += 1) {
		clearFormattingCache();
		const addBase = baseEntries.slice(0, 49);
		const addMutation = await timeAsync(async () => {
			const nextEntries = [
				...addBase,
				{
					id: 'benchmark-add',
					csl: manualCsl,
					formattedText: null,
					displayOverride: null,
				},
			];
			const formattedTexts = await formatBibliographyEntries(
				nextEntries.map((entry) => entry.csl),
				DEFAULT_STYLE
			);

			return sortCitations(
				nextEntries.map((entry, entryIndex) => ({
					...entry,
					formattedText: formattedTexts[entryIndex],
				})),
				DEFAULT_STYLE
			);
		});
		addRuns.push(addMutation.elapsedMs);

		clearFormattingCache();
		const editMutation = await timeAsync(async () => {
			const nextEntries = baseEntries.map((entry, entryIndex) =>
				entryIndex === 0
					? {
							...entry,
							csl: {
								...entry.csl,
								title: `${entry.csl.title} revised`,
							},
							displayOverride: null,
					  }
					: entry
			);
			const formattedTexts = await formatBibliographyEntries(
				nextEntries.map((entry) => entry.csl),
				DEFAULT_STYLE
			);

			return sortCitations(
				nextEntries.map((entry, entryIndex) => ({
					...entry,
					formattedText: formattedTexts[entryIndex],
				})),
				DEFAULT_STYLE
			);
		});
		editRuns.push(editMutation.elapsedMs);

		clearFormattingCache();
		const deleteAuthorDateMutation = await timeAsync(async () => {
			const nextEntries = baseEntries.slice(1);
			const formattedTexts = await formatBibliographyEntries(
				nextEntries.map((entry) => entry.csl),
				'chicago-author-date'
			);

			return sortCitations(
				nextEntries.map((entry, entryIndex) => ({
					...entry,
					formattedText: formattedTexts[entryIndex],
				})),
				'chicago-author-date'
			);
		});
		deleteAuthorDateRuns.push(deleteAuthorDateMutation.elapsedMs);

		const deleteNumericMutation = await timeAsync(() => {
			const nextEntries = baseEntries.slice(1);
			return sortCitations(nextEntries, 'ieee');
		});
		deleteNumericRuns.push(deleteNumericMutation.elapsedMs);
	}

	return {
		addToSupportedMax: summarize(addRuns),
		structuredEditAtSupportedMax: summarize(editRuns),
		deleteAuthorDateReformat: summarize(deleteAuthorDateRuns),
		deleteNumericNoReformat: summarize(deleteNumericRuns),
	};
}

async function benchmarkLargeSizeStyleSwitch(allCslItems) {
	const results = [];

	for (const size of LARGE_SIZES) {
		const entries = cslToEntries(allCslItems.slice(0, size));
		const byFamily = [];

		for (const { styleKey, family } of LARGE_STYLE_FAMILIES) {
			const runs = [];

			for (let index = 0; index < RUNS; index += 1) {
				clearFormattingCache();
				const { elapsedMs } = await timeAsync(() =>
					Promise.resolve(
						formatBibliographyEntries(
							entries.map((entry) => entry.csl),
							styleKey
						)
					)
				);
				runs.push(elapsedMs);
			}

			const stats = summarize(runs);
			byFamily.push({
				styleKey,
				family,
				...stats,
				exceedsBudget: stats.p95Ms > BUDGET_STYLE_SWITCH_P95_MS,
			});
		}

		results.push({ size, byFamily });
	}

	return results;
}

async function benchmarkLargeSizeMutations(allCslItems) {
	const results = [];
	const manualCsl = {
		id: 'benchmark-add',
		type: 'book',
		title: 'Benchmark Added Citation',
		author: [{ family: 'Benchmark', given: 'Ada' }],
		publisher: 'Example Press',
		issued: { 'date-parts': [[2026]] },
	};

	for (const size of LARGE_SIZES) {
		const base = cslToEntries(allCslItems.slice(0, size));
		const addRuns = [];
		const deleteAuthorDateRuns = [];
		const deleteNumericRuns = [];

		for (let index = 0; index < RUNS; index += 1) {
			clearFormattingCache();
			const addMutation = await timeAsync(async () => {
				const nextEntries = [
					...base,
					{
						id: 'benchmark-add',
						csl: manualCsl,
						formattedText: null,
						displayOverride: null,
					},
				];
				const formattedTexts = await formatBibliographyEntries(
					nextEntries.map((entry) => entry.csl),
					DEFAULT_STYLE
				);
				return sortCitations(
					nextEntries.map((entry, i) => ({
						...entry,
						formattedText: formattedTexts[i],
					})),
					DEFAULT_STYLE
				);
			});
			addRuns.push(addMutation.elapsedMs);

			clearFormattingCache();
			const deleteAuthorDate = await timeAsync(async () => {
				const nextEntries = base.slice(1);
				const formattedTexts = await formatBibliographyEntries(
					nextEntries.map((entry) => entry.csl),
					'chicago-author-date'
				);
				return sortCitations(
					nextEntries.map((entry, i) => ({
						...entry,
						formattedText: formattedTexts[i],
					})),
					'chicago-author-date'
				);
			});
			deleteAuthorDateRuns.push(deleteAuthorDate.elapsedMs);

			const deleteNumeric = await timeAsync(() => {
				return Promise.resolve(sortCitations(base.slice(1), 'ieee'));
			});
			deleteNumericRuns.push(deleteNumeric.elapsedMs);
		}

		const addStats = summarize(addRuns);
		const deleteAdStats = summarize(deleteAuthorDateRuns);
		const deleteNumStats = summarize(deleteNumericRuns);

		results.push({
			size,
			add: {
				...addStats,
				exceedsBudget: addStats.p95Ms > BUDGET_MUTATION_P95_MS,
			},
			deleteAuthorDate: {
				...deleteAdStats,
				exceedsBudget: deleteAdStats.p95Ms > BUDGET_MUTATION_P95_MS,
			},
			deleteNumeric: {
				...deleteNumStats,
				exceedsBudget: deleteNumStats.p95Ms > BUDGET_MUTATION_P95_MS,
			},
		});
	}

	return results;
}

function writeOutputs(report) {
	fs.mkdirSync(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, 'latest.json');
	const markdownPath = path.join(outputDir, 'latest.md');

	fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

	const lines = [
		'# Performance benchmark report',
		'',
		`Generated: ${report.generatedAt}`,
		'',
		'## Import fixtures',
		'',
		`Formatter mode: ${report.formatterMode}`,
		`Fallback detected: ${report.fallbackDetected ? 'yes' : 'no'}`,
		'',
		'| Fixture | Entries | Parse p50 (ms) | Parse p95 (ms) | Cold format p50 (ms) | Cold format p95 (ms) | Warm format p50 (ms) | Warm format p95 (ms) | Combined avg (ms) |',
		'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
	];

	for (const fixture of report.fixtures) {
		lines.push(
			`| ${fixture.fixture} | ${fixture.entries} | ${fixture.parseDeferred.p50Ms} | ${fixture.parseDeferred.p95Ms} | ${fixture.formatBatchCold.p50Ms} | ${fixture.formatBatchCold.p95Ms} | ${fixture.formatBatchWarm.p50Ms} | ${fixture.formatBatchWarm.p95Ms} | ${fixture.combinedEditorPath.avgMs} |`
		);
	}

	lines.push(
		'',
		'## Style switch batch formatting',
		'',
		'| Style | Avg (ms) | Median (ms) | Min (ms) | Max (ms) |',
		'| --- | ---: | ---: | ---: | ---: |'
	);

	for (const style of report.styleSwitch) {
		lines.push(
			`| ${style.styleKey} | ${style.avgMs} | ${style.medianMs} | ${style.minMs} | ${style.maxMs} |`
		);
	}

	lines.push(
		'',
		'## Manual entry',
		'',
		`- Average add time: ${report.manualEntry.avgMs} ms`,
		`- Median add time: ${report.manualEntry.medianMs} ms`
	);

	lines.push(
		'',
		'## Editor mutation paths at supported size',
		'',
		'| Path | Avg (ms) | p50 (ms) | p95 (ms) | Notes |',
		'| --- | ---: | ---: | ---: | --- |',
		`| Add to 50 citations | ${report.editorMutations.addToSupportedMax.avgMs} | ${report.editorMutations.addToSupportedMax.p50Ms} | ${report.editorMutations.addToSupportedMax.p95Ms} | Full bibliography reformat; citeproc-context-sensitive. |`,
		`| Structured edit at 50 citations | ${report.editorMutations.structuredEditAtSupportedMax.avgMs} | ${report.editorMutations.structuredEditAtSupportedMax.p50Ms} | ${report.editorMutations.structuredEditAtSupportedMax.p95Ms} | Full bibliography reformat; citeproc-context-sensitive. |`,
		`| Delete from author-date bibliography | ${report.editorMutations.deleteAuthorDateReformat.avgMs} | ${report.editorMutations.deleteAuthorDateReformat.p50Ms} | ${report.editorMutations.deleteAuthorDateReformat.p95Ms} | Full bibliography reformat remains safest. |`,
		`| Delete from numeric bibliography | ${report.editorMutations.deleteNumericNoReformat.avgMs} | ${report.editorMutations.deleteNumericNoReformat.p50Ms} | ${report.editorMutations.deleteNumericNoReformat.p95Ms} | Safe no-reformat path; list marker provides numbering. |`
	);

	if (report.largeSizeStyleSwitch) {
		lines.push(
			'',
			'## Large-size JS orchestration — style switch (mock formatter)',
			'',
			`Budget: p95 < ${BUDGET_STYLE_SWITCH_P95_MS} ms. Entries from csl-200.json fixture.`,
			'',
			'| Size | Family | Style | p50 (ms) | p95 (ms) | Budget |',
			'| ---: | --- | --- | ---: | ---: | --- |'
		);
		for (const row of report.largeSizeStyleSwitch) {
			for (const f of row.byFamily) {
				lines.push(
					`| ${row.size} | ${f.family} | ${f.styleKey} | ${
						f.p50Ms
					} | ${f.p95Ms} | ${f.exceedsBudget ? '⚠ over' : 'ok'} |`
				);
			}
		}
	}

	if (report.largeSizeMutations) {
		lines.push(
			'',
			'## Large-size JS orchestration — mutations (mock formatter)',
			'',
			`Budget: p95 < ${BUDGET_MUTATION_P95_MS} ms.`,
			'',
			'| Size | Operation | p50 (ms) | p95 (ms) | Budget |',
			'| ---: | --- | ---: | ---: | --- |'
		);
		for (const row of report.largeSizeMutations) {
			lines.push(
				`| ${row.size} | add (notes, full reformat) | ${
					row.add.p50Ms
				} | ${row.add.p95Ms} | ${
					row.add.exceedsBudget ? '⚠ over' : 'ok'
				} |`,
				`| ${row.size} | delete — author-date (full reformat) | ${
					row.deleteAuthorDate.p50Ms
				} | ${row.deleteAuthorDate.p95Ms} | ${
					row.deleteAuthorDate.exceedsBudget ? '⚠ over' : 'ok'
				} |`,
				`| ${row.size} | delete — numeric (no reformat) | ${
					row.deleteNumeric.p50Ms
				} | ${row.deleteNumeric.p95Ms} | ${
					row.deleteNumeric.exceedsBudget ? '⚠ over' : 'ok'
				} |`
			);
		}
	}

	lines.push(
		'',
		'## Build footprint',
		'',
		report.buildFootprint.available
			? `- Total raw: ${report.buildFootprint.totals.raw.kb} KB`
			: '- Build directory was not present when this benchmark ran.',
		report.buildFootprint.available
			? `- Total gzip: ${report.buildFootprint.totals.gzip.kb} KB`
			: ''
	);

	if (report.buildFootprint.available) {
		lines.push(
			'',
			'| Asset | Raw (KB) | Gzip (KB) |',
			'| --- | ---: | ---: |'
		);

		for (const asset of report.buildFootprint.assets) {
			lines.push(
				`| ${asset.file} | ${asset.raw.kb} | ${asset.gzip.kb} |`
			);
		}
	}

	fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);

	return { jsonPath, markdownPath };
}

const runBenchmark = process.env.RUN_PERF_BENCHMARK === '1';

(runBenchmark ? describe : describe.skip)(
	'performance benchmark harness',
	() => {
		beforeAll(() => {
			jest.setTimeout(120000);
			apiFetch.mockImplementation(({ data }) =>
				Promise.resolve({
					entries: (data?.cslItems || []).map((item, index) => ({
						index,
						text: `${data?.style || DEFAULT_STYLE}:${
							item.title ||
							item['container-title'] ||
							`Entry ${index + 1}`
						}`,
					})),
				})
			);
		});

		it('records large-size JS orchestration overhead', async () => {
			const allCslItems = loadCslFixture('csl-200.json');

			const largeSizeStyleSwitch = await benchmarkLargeSizeStyleSwitch(
				allCslItems
			);
			const largeSizeMutations = await benchmarkLargeSizeMutations(
				allCslItems
			);

			const report = {
				generatedAt: new Date().toISOString(),
				formatterMode: FORMATTER_MODE,
				budgets: {
					styleSwitchP95Ms: BUDGET_STYLE_SWITCH_P95_MS,
					mutationP95Ms: BUDGET_MUTATION_P95_MS,
				},
				largeSizes: LARGE_SIZES,
				largeSizeStyleSwitch,
				largeSizeMutations,
			};

			fs.mkdirSync(outputDir, { recursive: true });
			const jsonPath = path.join(outputDir, 'large-size.json');
			fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

			const mdLines = [
				'# Large-size JS orchestration benchmark',
				'',
				`Generated: ${report.generatedAt}`,
				`Formatter mode: ${FORMATTER_MODE} (apiFetch mock — JS orchestration only)`,
				'',
				'## Style switch',
				'',
				`Budget: p95 < ${BUDGET_STYLE_SWITCH_P95_MS} ms`,
				'',
				'| Size | Family | Style | p50 (ms) | p95 (ms) | Budget |',
				'| ---: | --- | --- | ---: | ---: | --- |',
			];
			for (const row of largeSizeStyleSwitch) {
				for (const f of row.byFamily) {
					mdLines.push(
						`| ${row.size} | ${f.family} | ${f.styleKey} | ${
							f.p50Ms
						} | ${f.p95Ms} | ${f.exceedsBudget ? 'OVER' : 'ok'} |`
					);
				}
			}
			mdLines.push(
				'',
				'## Mutations',
				'',
				`Budget: p95 < ${BUDGET_MUTATION_P95_MS} ms`,
				'',
				'| Size | Operation | p50 (ms) | p95 (ms) | Budget |',
				'| ---: | --- | ---: | ---: | --- |'
			);
			for (const row of largeSizeMutations) {
				mdLines.push(
					`| ${row.size} | add (notes, full reformat) | ${
						row.add.p50Ms
					} | ${row.add.p95Ms} | ${
						row.add.exceedsBudget ? 'OVER' : 'ok'
					} |`,
					`| ${row.size} | delete — author-date (full reformat) | ${
						row.deleteAuthorDate.p50Ms
					} | ${row.deleteAuthorDate.p95Ms} | ${
						row.deleteAuthorDate.exceedsBudget ? 'OVER' : 'ok'
					} |`,
					`| ${row.size} | delete — numeric (no reformat) | ${
						row.deleteNumeric.p50Ms
					} | ${row.deleteNumeric.p95Ms} | ${
						row.deleteNumeric.exceedsBudget ? 'OVER' : 'ok'
					} |`
				);
			}
			const mdPath = path.join(outputDir, 'large-size.md');
			fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`);

			// eslint-disable-next-line no-console
			console.log(`Wrote large-size report to ${jsonPath}`);

			expect(largeSizeStyleSwitch).toHaveLength(LARGE_SIZES.length);
			expect(largeSizeMutations).toHaveLength(LARGE_SIZES.length);
			// Sort (no-reformat path) must always be fast regardless of list size
			for (const row of largeSizeMutations) {
				expect(row.deleteNumeric.p95Ms).toBeLessThan(
					BUDGET_MUTATION_P95_MS
				);
			}
		});

		it('records repeatable local benchmark timings', async () => {
			const warnSpy = jest
				.spyOn(console, 'warn')
				.mockImplementation(() => {});
			const fixtures = [];
			for (const fixtureName of FIXTURE_NAMES) {
				fixtures.push(await benchmarkFixtureImport(fixtureName));
			}

			const styleBase = await parsePastedInput(
				readFixture('import-freetext-50.txt'),
				DEFAULT_STYLE,
				{ deferFormatting: true }
			);

			const fallbackDetected = warnSpy.mock.calls.some(([message]) =>
				String(message).includes('Falling back to raw citation text')
			);

			const report = {
				generatedAt: new Date().toISOString(),
				formatterMode: FORMATTER_MODE,
				fallbackDetected,
				defaults: {
					style: DEFAULT_STYLE,
					runs: RUNS,
					supportedMaxCitations: 50,
				},
				fixtures,
				styleSwitch: await benchmarkStyleSwitch(styleBase.entries),
				manualEntry: await benchmarkManualEntry(),
				editorMutations: await benchmarkEditorMutationPaths(
					styleBase.entries
				),
				buildFootprint: getBuildFootprint(),
			};

			const { jsonPath, markdownPath } = writeOutputs(report);

			// eslint-disable-next-line no-console
			console.log(`Wrote benchmark report to ${jsonPath}`);
			// eslint-disable-next-line no-console
			console.log(`Wrote benchmark summary to ${markdownPath}`);

			expect(report.fixtures).toHaveLength(FIXTURE_NAMES.length);
			expect(report.styleSwitch).toHaveLength(
				STYLE_SWITCH_SEQUENCE.length
			);
			expect(report.manualEntry.avgMs).toBeGreaterThanOrEqual(0);
			expect(
				report.editorMutations.deleteNumericNoReformat.avgMs
			).toBeGreaterThanOrEqual(0);
			expect(report.buildFootprint.assets.length).toBeGreaterThanOrEqual(
				report.buildFootprint.available ? 1 : 0
			);
			expect(report.fallbackDetected).toBe(false);
		});
	}
);
