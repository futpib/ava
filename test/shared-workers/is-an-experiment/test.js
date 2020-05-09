const test = require('@ava/test');
const exec = require('../../helpers/exec');

test('opt-in is required', async t => {
	const result = await exec.fixture();
	t.is(result.exitCode, 1);
	t.is(result.stats.uncaughtExceptions.length, 1);
	t.snapshot(result.stats.uncaughtExceptions[0].message);
});

