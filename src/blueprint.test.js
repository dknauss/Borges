const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const blueprintFiles = [
	'playground/blueprint.json',
	'playground/blueprint-main.json',
	'.wordpress-org/blueprints/blueprint.json',
];

describe('Playground blueprints', () => {
	test.each(blueprintFiles)(
		'%s requests intl in both supported Playground forms',
		(relativePath) => {
			const blueprint = JSON.parse(
				fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
			);

			expect(blueprint.phpExtensionBundles).toContain('kitchen-sink');
			expect(blueprint.features).toEqual(
				expect.objectContaining({
					networking: true,
					intl: true,
				})
			);
		}
	);

	test('GitHub demo blueprint installs from the latest GitHub release zip via Playground CORS proxy', () => {
		const blueprint = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, 'playground/blueprint.json'),
				'utf8'
			)
		);

		const installStep = blueprint.steps.find(
			(step) => step.step === 'installPlugin'
		);

		expect(installStep).toEqual(
			expect.objectContaining({
				pluginData: {
					resource: 'url',
					url: 'https://wordpress-playground-cors-proxy.net/?https://github.com/dknauss/Borges/releases/latest/download/borges-bibliography-builder.zip',
				},
			})
		);
	});

	test('main-build blueprint installs from the rolling main-preview pre-release via Playground CORS proxy', () => {
		const blueprint = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, 'playground/blueprint-main.json'),
				'utf8'
			)
		);

		const installStep = blueprint.steps.find(
			(step) => step.step === 'installPlugin'
		);

		expect(installStep).toEqual(
			expect.objectContaining({
				pluginData: {
					resource: 'url',
					url: 'https://wordpress-playground-cors-proxy.net/?https://github.com/dknauss/Borges/releases/download/main-preview/borges-bibliography-builder.zip',
				},
			})
		);
	});
});
