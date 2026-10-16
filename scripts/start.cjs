// Keep Expo's advertised bundle URL on the same interface as ADB reverse forwarding.
if (process.argv.includes('--localhost')) process.env.REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1';
else process.env.REACT_NATIVE_PACKAGER_HOSTNAME ??= '127.0.0.1';
process.argv.splice(2, 0, 'start');
require('expo/bin/cli');
