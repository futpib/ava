const path = require('path');
const v8 = require('v8');

const test = require('@ava/test');
const execa = require('execa');

const cliPath = path.resolve(__dirname, '../../cli.js');
const serialization = process.versions.node >= '12.16.0' ? 'advanced' : 'json';

exports.fixture = async (...args) => {
	const cwd = path.join(path.dirname(test.meta.file), 'fixtures');
	const running = execa.node(cliPath, args, {
		env: {
			AVA_EMIT_RUN_STATUS_OVER_IPC: 'I\'ll find a payphone baby / Take some time to talk to you'
		},
		cwd,
		reject: false,
		serialization,
		stderr: 'inherit'
	});

	const stats = {
		passed: [],
		uncaughtExceptions: []
	};

	running.on('message', statusEvent => {
		if (serialization === 'json') {
			statusEvent = v8.deserialize(Uint8Array.from(statusEvent));
		}

		switch (statusEvent.type) {
			case 'uncaught-exception': {
				const {message, name, stack} = statusEvent.err;
				stats.uncaughtExceptions.push({message, name, stack});
				break;
			}

			case 'test-passed': {
				const {title, testFile} = statusEvent;
				stats.passed.push({title, file: path.posix.relative(cwd, testFile)});
				break;
			}

			default:
				break;
		}
	});

	try {
		return {
			stats,
			...await running
		};
	} catch (error) {
		throw Object.assign(error, {stats});
	} finally {
		stats.passed.sort((a, b) => {
			if (a.file < b.file) {
				return -1;
			}

			if (a.file > b.file) {
				return 1;
			}

			if (a.title < b.title) {
				return -1;
			}

			return 1;
		});
	}
};
