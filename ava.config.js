const skipTests = [];
if (process.versions.node < '12.16.0') {
	skipTests.push('!test/shared-workers/!(requires-newish-node)/**');
}

export default {
	files: ['test/**', '!test/**/{fixtures,helpers}/**', ...skipTests],
	ignoredByWatcher: ['{coverage,docs,media,test-d,test-tap}/**']
};
