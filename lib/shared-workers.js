const pEvent = require('p-event');
const serializeError = require('./serialize-error');

let Worker;
try {
	({Worker} = require('worker_threads')); // eslint-disable-line node/no-unsupported-features/node-builtins
} catch {}

const LAUNCHER = require.resolve('./shared-worker-launcher');

let sharedWorkerCounter = 0;
const launchedWorkers = new Map();

function launchWorker({filename, initialData}) {
	if (launchedWorkers.has(filename)) {
		return launchedWorkers.get(filename);
	}

	const id = `shared-worker/${++sharedWorkerCounter}`;
	const worker = new Worker(LAUNCHER, {
		workerData: {
			filename,
			id,
			initialData
		}
	});
	const launched = {
		statePromises: {
			available: pEvent(worker, 'message', ({type}) => type === 'available', {rejectionEvents: []}),
			error: pEvent(worker, 'error', {rejectionEvents: []})
		},
		exited: false,
		worker
	};

	launchedWorkers.set(filename, launched);
	worker.once('exit', () => {
		launched.exited = true;
	});

	return launched;
}

function observeWorkerProcess(fork, runStatus) {
	fork.onConnectSharedWorker(async channel => {
		const launched = launchWorker(channel);

		launched.statePromises.error.then(error => { // eslint-disable-line promise/prefer-await-to-then
			runStatus.emitStateChange({type: 'shared-worker-error', err: serializeError('Shared worker error', false, error)});
			channel.signalError();
		});

		await launched.statePromises.available;
		if (launched.exited) {
			return;
		}

		launched.worker.postMessage({
			type: 'register-test-worker',
			id: fork.forkId,
			file: fork.file
		});

		fork.promise.finally(() => {
			launched.worker.postMessage({
				type: 'deregister-test-worker',
				id: fork.forkId
			});
		});

		launched.worker.on('message', async message => {
			if (message.type === 'broadcast' || (message.type === 'message' && message.testWorkerId === fork.forkId)) {
				const {messageId, replyTo, data} = message;
				channel.forwardMessageToFork({messageId, replyTo, data});
			}
		});

		// Attaching the listener has the side-effect of referencing the worker.
		// Explicitly unreference it now.
		launched.worker.unref();

		channel.on('message', ({messageId, replyTo, data}) => {
			launched.worker.postMessage({
				type: 'message',
				testWorkerId: fork.forkId,
				messageId,
				replyTo,
				data
			});
		});

		channel.signalReady();
	});
}

exports.observeWorkerProcess = observeWorkerProcess;
