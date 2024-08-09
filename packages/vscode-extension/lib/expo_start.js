const {
  adaptMetroConfig,
  requireFromAppDir,
  overrideModuleFromAppDir,
} = require("./metro_helpers");

// since expo cli doesn't accept metro-config as parameter, we override metro's loadConfig method
const metroConfig = requireFromAppDir("metro-config");
const origLoadConfig = metroConfig.loadConfig;
metroConfig.loadConfig = async function (...args) {
  const config = await origLoadConfig(...args);
  return adaptMetroConfig(config);
};

// Furthermore, expo CLI also does override the reporter setting despite it being
// set in the config. In order to force CLI to use JSON reporter, we override
// base terminal reporter class from metro that Expo CLI extends
overrideModuleFromAppDir("metro/src/lib/TerminalReporter", require("./metro_reporter"));

// In addition, expo uses freeport-async to check whether provided port is busy.
// Apparently, this module returns 11000 port when 0 is provided, so we need to
// override this behavior here.
overrideModuleFromAppDir("freeport-async", async (port) => port);

const { expoStart } = requireFromAppDir("@expo/cli/build/src/start/index");
expoStart(process.argv.slice(2)); // pass argv but strip node and script name
