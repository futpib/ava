const crypto = require('crypto');
const test = require('ava');
const storeAndRetrieve = require('./_plugin');

const random = crypto.randomBytes(16);

test.serial('store', async t => {
	await t.notThrowsAsync(storeAndRetrieve.store(random));
});

test.serial('retrieve', async t => {
	t.deepEqual(Buffer.from(await storeAndRetrieve.retrieve()), random);
});

test.serial('subscribe', async t => {
	await storeAndRetrieve.store(1);

	const changes = [];
	for await (const change of storeAndRetrieve.subscribe()) {
		changes.push(change);
		if (change === 1) {
			await storeAndRetrieve.store(2);
		}

		if (change === 2) {
			await storeAndRetrieve.store(3);
		}

		if (change === 3) {
			t.deepEqual(changes, [1, 2, 3]);
			break;
		}
	}
});
