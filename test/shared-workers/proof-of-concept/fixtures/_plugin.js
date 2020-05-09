const plugin = require('ava/plugin');
const itFirst = require('it-first');

const worker = plugin.registerSharedWorker({
	filename: require.resolve('./_worker'),
	supportedProtocols: ['experimental']
});

exports.store = async value => {
	const status = worker.publish({type: 'store', value});
	await itFirst(status.replies());
};

exports.retrieve = async () => {
	const status = worker.publish({type: 'retrieve'});
	const {data: value} = await itFirst(status.replies());
	return value;
};

exports.subscribe = async function * () {
	for await (const {data} of worker.subscribe()) {
		if (data.type === 'change') {
			yield data.value;
		}
	}
};
