const {
  adaptMetroConfig,
  requireFromAppDir,
  overrideModuleFromAppDir,
} = require("./metro_helpers");

// Expo doesn't allow to customize Metro's config in any way. We need to inject
// some config values to e.g. gather data from Metro in JSON, get correct line
// numbers, etc.
const runServerFork = requireFromAppDir("@expo/cli/build/src/start/server/metro/runServer-fork");
const originalRunServer = runServerFork.runServer;
runServerFork.runServer = async (...args) => {
  const metroConfig = args[1];
  args[1] = adaptMetroConfig(metroConfig);
  return originalRunServer(...args);
};

// In addition, expo uses freeport-async to check whether provided port is busy.
// Apparently, this module returns 11000 port when 0 is provided, so we need to
// override this behavior here.
overrideModuleFromAppDir("freeport-async", async (port) => port);

const { expoStart } = requireFromAppDir("@expo/cli/build/src/start/index");
expoStart(process.argv.slice(2)); // pass argv but strip node and script name
