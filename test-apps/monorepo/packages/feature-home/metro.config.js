const { generate } = require('@storybook/react-native/scripts/generate');
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

generate({
  configPath: path.resolve(__dirname, './.ondevice'),
});

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.transformer.unstable_allowRequireContext = true;

defaultConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const defaultResolveResult = context.resolveRequest(context, moduleName, platform);

  return defaultResolveResult;
};

module.exports = defaultConfig;
