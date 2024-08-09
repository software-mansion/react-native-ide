const { AppRegistry, View } = require("react-native");

export const PREVIEW_APP_KEY = "RNIDE_preview";

global.__RNIDE_previews ||= new Map();

export function Preview({ previewKey }) {
  const previewData = global.__RNIDE_previews.get(previewKey);
  if (!previewData || !previewData.component) {
    return null;
  }
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {previewData.component}
    </View>
  );
}

function getComponentName({ type }) {
  const name = type.name;
  const isClassOrFunctionComponent = name !== undefined;
  if (isClassOrFunctionComponent) {
    return name;
  }

  const isForwardedRef = type["$$typeof"] === Symbol.for("react.forward_ref");
  if (isForwardedRef) {
    return "(forwarded ref)";
  }

  return "(unnamed)";
}

export function preview(component) {
  // eslint-disable-next-line eqeqeq
  if (!component || component._source == null) {
    return;
  }

  const key = `preview:/${component._source.fileName}:${component._source.lineNumber}`;
  global.__RNIDE_previews.set(key, {
    component,
    name: getComponentName(component),
  });
}

AppRegistry.registerComponent(PREVIEW_APP_KEY, () => Preview);
