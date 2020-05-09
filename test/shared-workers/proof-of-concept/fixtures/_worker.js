module.exports = async ({negotiateProtocol}) => {
	const protocol = negotiateProtocol(['experimental']);

	let stored;
	for await (const message of protocol.subscribe()) {
		if (message.data.type === 'store') {
			stored = message.data.value;
			message.reply();
			protocol.broadcast({type: 'change', value: stored});
		} else if (message.data.type === 'retrieve') {
			message.reply(stored);
		}
	}
};
