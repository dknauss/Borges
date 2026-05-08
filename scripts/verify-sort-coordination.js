#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const commands = [
	{
		label: 'Jest coordination fixtures',
		cmd: 'npm',
		args: [
			'test',
			'--',
			'src/lib/sorter.coordination.test.js',
			'--runInBand',
			'--silent',
		],
	},
	{
		label: 'PHPUnit coordination fixtures',
		cmd: 'composer',
		args: ['test:php', '--', 'tests/phpunit/SortCoordinationTest.php'],
	},
];

for (const command of commands) {
	process.stdout.write(`\n== ${command.label} ==\n`);
	const result = spawnSync(command.cmd, command.args, {
		stdio: 'inherit',
		shell: false,
	});

	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

process.stdout.write('\nSort coordination verification passed.\n');
