const test = require('@ava/test');
const exec = require('../../helpers/exec');

test('requires node.js >= 12.16', async t => {
	const result = await exec.fixture();

	t.log(result.stdout);

	if (process.versions.node >= '12.16.0') {
		t.is(result.exitCode, 0);
	} else {
		t.is(result.exitCode, 1);
		t.is(result.stats.uncaughtExceptions.length, 1);
		// Don't snapshot since it can't easily be updated anyway.
		t.is(result.stats.uncaughtExceptions[0].message, 'Shared workers require Node.js 12.16 or newer');
	}
});
