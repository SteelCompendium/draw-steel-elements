'use strict';
// Jest transformer mirroring esbuild.config.mjs's yamlLoaderPlugin:
// a .yaml/.yml file becomes a module whose default export is the file's raw text.
const crypto = require('crypto');

module.exports = {
	process(sourceText) {
		return {
			code: `module.exports = { __esModule: true, default: ${JSON.stringify(sourceText)} };`,
		};
	},
	getCacheKey(sourceText, sourcePath) {
		return crypto
			.createHash('sha256')
			.update(sourcePath)
			.update('\0')
			.update(sourceText)
			.digest('hex');
	},
};
