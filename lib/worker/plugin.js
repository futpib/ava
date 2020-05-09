const pkg = require('../../package.json');
const subprocess = require('./subprocess');
const options = require('./options');

const workers = new Map();
const workerTeardownFns = new WeakMap();

function createSharedWorker(filename, initialData, teardown) {
	const channel = subprocess.registerSharedWorker(filename, initialData, teardown);

	class ReceivedMessage {
		constructor(id, data) {
			this.id = id;
			this.data = data;
		}

		reply(data) {
			return publishMessage(data, this.id);
		}
	}

	// Ensure that, no matter how often it's received, we have a stable message
	// object.
	const messageCache = new WeakMap();
	async function * receiveMessages(replyTo) {
		for await (const evt of channel.receive()) {
			if (replyTo === undefined && evt.replyTo !== undefined) {
				continue;
			}

			if (replyTo !== undefined && evt.replyTo !== replyTo) {
				continue;
			}

			let message = messageCache.get(evt);
			if (message === undefined) {
				message = new ReceivedMessage(evt.messageId, evt.data);
				messageCache.set(evt, message);
			}

			yield message;
		}
	}

	function publishMessage(data, replyTo) {
		const id = channel.post(data, replyTo);

		return {
			id,

			replies() {
				return receiveMessages(id);
			}
		};
	}

	return {
		available: channel.available,
		protocol: 'experimental',

		get currentlyAvailable() {
			return channel.currentlyAvailable;
		},

		publish(data) {
			return publishMessage(data);
		},

		subscribe() {
			return receiveMessages();
		}
	};
}

const supportsSharedWorkers = process.versions.node >= '12.16.0';

function registerSharedWorker({
	filename,
	initialData,
	supportedProtocols,
	teardown
}) {
	if (!options.get().experiments.sharedWorkers) {
		throw new Error('Shared workers are experimental. Opt in to them in your AVA configuration');
	}

	if (!supportsSharedWorkers) {
		throw new Error('Shared workers require Node.js 12.16 or newer');
	}

	if (!supportedProtocols.includes('experimental')) {
		throw new Error(`This version of AVA (${pkg.version}) does not support any of desired shared worker protocols: ${supportedProtocols.join()}`);
	}

	let worker = workers.get(filename);
	if (worker === undefined) {
		worker = createSharedWorker(filename, initialData, async () => {
			if (workerTeardownFns.has(worker)) {
				await Promise.all(workerTeardownFns.get(worker).map(fn => fn()));
			}
		});
		workers.set(filename, worker);
	}

	if (teardown !== undefined) {
		if (workerTeardownFns.has(worker)) {
			workerTeardownFns.get(worker).push(teardown);
		} else {
			workerTeardownFns.set(worker, [teardown]);
		}
	}

	return worker;
}

exports.registerSharedWorker = registerSharedWorker;
