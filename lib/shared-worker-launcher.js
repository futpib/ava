const {EventEmitter} = require('events');
const {workerData, parentPort} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins
const pDefer = require('p-defer');
const pEvent = require('p-event');
const pkg = require('../package.json');

// Map of active test workers, used in receiveMessages() to get a reference to
// the TestWorker instance.
const activeTestWorkers = new Map();

class TestWorker {
	constructor(id, file, exited) {
		this.id = id;
		this.file = file;
		this.exited = exited;
	}

	publish(data) {
		return publishMessage(this, data);
	}

	subscribe() {
		return receiveMessages(this);
	}
}

class ReceivedMessage {
	constructor(testWorker, id, data) {
		this.testWorker = testWorker;
		this.id = id;
		this.data = data;
	}

	reply(data) {
		return publishMessage(this.testWorker, data, this.id);
	}
}

// Ensure that, no matter how often it's received, we have a stable message
// object.
const messageCache = new WeakMap();

// Allow micro tasks to finish processing the previous message.
let nextTurn = null;
const turn = () => {
	if (nextTurn === null) {
		nextTurn = new Promise(resolve => {
			setImmediate(() => {
				nextTurn = null;
				resolve();
			});
		});
	}

	return nextTurn;
};

async function * receiveMessages(testWorker, replyTo) {
	for await (const evt of pEvent.iterator(parentPort, 'message')) {
		if (evt.type !== 'message') {
			continue;
		}

		if (testWorker !== undefined && evt.testWorkerId !== testWorker.id) {
			continue;
		}

		if (replyTo === undefined && evt.replyTo !== undefined) {
			continue;
		}

		if (replyTo !== undefined && evt.replyTo !== replyTo) {
			continue;
		}

		let message = messageCache.get(evt);
		if (message === undefined) {
			message = new ReceivedMessage(activeTestWorkers.get(evt.testWorkerId).instance, evt.messageId, evt.data);
			messageCache.set(evt, message);
		}

		await turn();
		yield message;
	}
}

let messageCounter = 0;
const messageIdPrefix = `${workerData.id}/message`;
const nextMessageId = () => `${messageIdPrefix}/${++messageCounter}`;

function publishMessage(testWorker, data, replyTo) {
	const id = nextMessageId();
	parentPort.postMessage({
		type: 'message',
		messageId: id,
		testWorkerId: testWorker.id,
		data,
		replyTo
	});

	return {
		id,

		replies() {
			return receiveMessages(testWorker, id);
		}
	};
}

function broadcastMessage(data) {
	const id = nextMessageId();
	parentPort.postMessage({
		type: 'broadcast',
		messageId: id,
		data
	});

	return {
		id,

		replies() {
			return receiveMessages(undefined, id);
		}
	};
}

let fatal;
Promise.resolve(require(workerData.filename)({
	negotiateProtocol(supported) {
		if (!supported.includes('experimental')) {
			fatal = new Error(`This version of AVA (${pkg.version}) is not compatible with shared worker plugin at ${workerData.filename}`);
			throw fatal;
		}

		const events = new EventEmitter();
		const testWorkers = pEvent.iterator(events, 'testWorker');
		const produceTestWorker = instance => events.emit('testWorker', instance);

		parentPort.on('message', message => {
			if (message.type === 'register-test-worker') {
				const {id, file} = message;
				const exited = pDefer();
				const instance = new TestWorker(id, file, exited.promise);

				activeTestWorkers.set(id, {
					signalExit: exited.resolve,
					instance
				});

				produceTestWorker(instance);
			}

			if (message.type === 'deregister-test-worker') {
				const {id} = message;
				activeTestWorkers.get(id).signalExit();
				activeTestWorkers.delete(id);
			}
		});

		return {
			initialData: workerData.initialData,
			protocol: 'experimental',
			testWorkers,

			broadcast(data) {
				return broadcastMessage(data);
			},

			subscribe() {
				return receiveMessages();
			}
		};
	}
})).catch(error => {
	if (fatal === undefined) {
		process.nextTick(() => {
			throw error;
		});
	}
});

if (fatal !== undefined) {
	throw fatal;
}

parentPort.postMessage({type: 'available'});
