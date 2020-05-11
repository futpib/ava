export namespace SharedWorker {
	export const enum ProtocolIdentifier {
		Experimental = 'experimental'
	}

	export type TestWorker<Data = unknown> = {
		readonly id: string;
		readonly file: string;
		defer: <ReleaseFn> (fn: ReleaseFn) => ReleaseFn;
		publish: (data: Data) => PublishedMessage<Data>;
		subscribe: () => AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type Factory = (options: {
		readonly negotiateProtocol: <Data = unknown>(supported: readonly ProtocolIdentifier[]) => Protocol<Data>;
	}) => void;

	export type Protocol<Data = unknown> = {
		readonly initialData: Data;
		readonly protocol: ProtocolIdentifier.Experimental;
		readonly testWorkers: AsyncIterableIterator<TestWorker<Data>>;
		broadcast: (data: Data) => BroadcastMessage<Data>;
		subscribe: () => AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type BroadcastMessage<Data = unknown> = {
		readonly id: string;
		replies: () => AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type PublishedMessage<Data = unknown> = {
		readonly id: string;
		replies: () => AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type ReceivedMessage<Data = unknown> = {
		readonly data: Data;
		readonly id: string;
		readonly testWorker: TestWorker;
		reply: (data: Data) => PublishedMessage<Data>;
	};

	export namespace Plugin {
		export type PublishedMessage<Data = unknown> = {
			readonly id: string;
			replies: () => AsyncIterableIterator<ReceivedMessage<Data>>;
		};

		export type ReceivedMessage<Data = unknown> = {
			readonly data: Data;
			readonly id: string;
			reply: (data: Data) => PublishedMessage<Data>;
		};

		export type Protocol<Data = unknown> = {
			readonly available: Promise<void>;
			readonly currentlyAvailable: boolean;
			readonly protocol: ProtocolIdentifier.Experimental;
			publish: (data: Data) => PublishedMessage<Data>;
			subscribe: () => AsyncIterableIterator<ReceivedMessage<Data>>;
		};
	}
}

export type SharedWorkerRegistrationOptions<Data = unknown> = {
	readonly filename: string;
	readonly initialData?: Data;
	readonly supportedProtocols: readonly SharedWorker.ProtocolIdentifier[];
	readonly teardown?: (protocol: SharedWorker.Plugin.Protocol<Data>) => void; // eslint-disable-line @typescript-eslint/prefer-readonly-parameter-types
};

export function registerSharedWorker<Data = unknown> (options: SharedWorkerRegistrationOptions<Data>): SharedWorker.Plugin.Protocol<Data>;
