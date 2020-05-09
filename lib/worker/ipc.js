'use strict';
const Emittery = require('emittery');
const {get: getOptions} = require('./options');

const emitter = new Emittery();
process.on('message', message => {
	if (!message.ava) {
		return;
	}

	switch (message.ava.type) {
		case 'options':
			emitter.emit('options', message.ava.options);
			break;
		case 'peer-failed':
			emitter.emit('peerFailed');
			break;
		case 'pong':
			emitter.emit('pong');
			break;
		case 'shared-worker-message':
			// Only emit the message in the next turn of the event loop, so that code
			// has had a chance to process the previous message.
			setImmediate(() => {
				emitter.emit('shared-worker-message', message.ava);
			});
			break;
		case 'shared-worker-ready':
			emitter.emit('shared-worker-ready', message.ava);
			break;
		case 'shared-worker-error':
			emitter.emit('shared-worker-error', message.ava);
			break;
		default:
			break;
	}
});

exports.options = emitter.once('options');
exports.peerFailed = emitter.once('peerFailed');

function send(evt) {
	if (process.connected) {
		process.send({ava: evt});
	}
}

exports.send = send;

let refs = 1;
function ref() {
	if (++refs === 1) {
		process.channel.ref();
	}
}

function unref() {
	if (refs > 0 && --refs === 0) {
		process.channel.unref();
	}
}

exports.unref = unref;

let pendingPings = Promise.resolve();
async function flush() {
	ref();
	const promise = pendingPings.then(async () => { // eslint-disable-line promise/prefer-await-to-then
		send({type: 'ping'});
		await emitter.once('pong');
		if (promise === pendingPings) {
			unref();
		}
	});
	pendingPings = promise;
	await promise;
}

exports.flush = flush;

let channelCounter = 0;
let messageCounter = 0;

function registerSharedWorker(filename, initialData) {
	const channelId = `${getOptions().forkId}/channel/${++channelCounter}`;

	let forcedUnref = false;
	let refs = 0;
	const forceUnref = () => {
		if (forcedUnref) {
			return;
		}

		forcedUnref = true;
		if (refs > 0) {
			unref();
		}
	};

	const refChannel = () => {
		if (!forcedUnref && ++refs === 1) {
			ref();
		}
	};

	const unrefChannel = () => {
		if (!forcedUnref && refs > 0 && --refs === 0) {
			unref();
		}
	};

	send({
		type: 'shared-worker-connect',
		channelId,
		filename,
		initialData
	});

	let currentlyAvailable = false;

	let error = null;
	const disposeError = emitter.on('shared-worker-error', evt => {
		if (evt.channelId === channelId) {
			error = new Error('The shared worker is no longer available');
			currentlyAvailable = false;
			disposeError();
			forceUnref();
		}
	});

	refChannel();
	const ready = new Promise(resolve => {
		const disposeReady = emitter.on('shared-worker-ready', evt => {
			if (evt.channelId !== channelId) {
				return;
			}

			currentlyAvailable = error === null;
			disposeReady();
			resolve();
		});
	}).finally(unrefChannel);

	return {
		forceUnref,
		ready,
		channel: {
			available: ready,

			get currentlyAvailable() {
				return currentlyAvailable;
			},

			async * receive() {
				if (error !== null) {
					throw error;
				}

				refChannel();
				try {
					for await (const evt of emitter.events('shared-worker-message')) {
						if (evt.channelId !== channelId) {
							continue;
						}

						if (error !== null) {
							throw error;
						}

						yield evt;

						if (error !== null) {
							throw error;
						}
					}
				} finally {
					unrefChannel();
				}
			},

			post(data, replyTo) {
				if (error !== null) {
					throw error;
				}

				if (!currentlyAvailable) {
					throw new Error('Shared worker is not yet available');
				}

				const messageId = `${channelId}/message/${++messageCounter}`;
				send({
					type: 'shared-worker-message',
					channelId,
					messageId,
					replyTo,
					data
				});

				return messageId;
			}
		}
	};
}

exports.registerSharedWorker = registerSharedWorker;

