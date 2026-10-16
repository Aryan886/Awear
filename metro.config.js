const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  // Native compilers create/remove temporary directories while Metro is watching.
  /[/\\]android[/\\](?:.*[/\\])?(?:build|\.cxx|\.gradle)(?:[/\\]|$)/,
];

module.exports = config;
