// runtime.js is setup to be loaded as one of the first modules. Because of that
// the things ot requires may interfere with other modules that depend on the loading
// order. In order to avoid issues related to that, we only require minimal set of
// dependencies, and we load the main bits of runtime lazyli as a part of wrapper.js
const AppRegistry = require("react-native/Libraries/ReactNative/AppRegistry");
const parseErrorStack = require("react-native/Libraries/Core/Devtools/parseErrorStack");

function __RNIDE_breakOnError(error, isFatal) {
  // the below variables are accessed from the debugger and hence are necessary despite being unused in the code
  const message = error.message;
  const stack = parseErrorStack(error.stack);
  debugger;
}

global.__RNIDE_onDebuggerConnected = function () {
  // install error handler that breaks into the debugger but only do it when
  // debugger is connected. Otherwise we may miss some important initialization
  // errors or even pause the app execution before the debugger is attached.
  global.ErrorUtils.setGlobalHandler(__RNIDE_breakOnError);
  global.__fbDisableExceptionsManager = true;
};

function wrapConsole(consoleFunc) {
  return function (...args) {
    const stack = parseErrorStack(new Error().stack);
    const expoLogIndex = stack.findIndex((frame) => frame.methodName === "__expoConsoleLog");
    const location = expoLogIndex > 0 ? stack[expoLogIndex + 1] : stack[1];
    const lineOffset = global.__EXPO_ENV_PRELUDE_LINES__ || 0;
    args.push(location.file, location.lineNumber - lineOffset, location.column);
    return consoleFunc.apply(console, args);
  };
}
console.log = wrapConsole(console.log);
console.warn = wrapConsole(console.warn);
console.error = wrapConsole(console.error);
console.info = wrapConsole(console.info);

// This variable can be used by external integrations to detect if they are running in the IDE
global.__RNIDE_enabled = true;

global.__RNIDE_register_navigation_plugin = function (name, plugin) {
  require("__RNIDE_lib__/wrapper.js").registerNavigationPlugin(name, plugin);
};

AppRegistry.setWrapperComponentProvider((appParameters) => {
  return require("__RNIDE_lib__/wrapper.js").PreviewAppWrapper;
});
