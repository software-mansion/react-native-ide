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

export function preview(component) {
  if (!component || component._source === null) {
    return;
  }

  const key = `preview:/${component._source.fileName}:${component._source.lineNumber}`;
  global.__RNIDE_previews.set(key, {
    component,
    name: component.type.name,
  });
}

AppRegistry.registerComponent(PREVIEW_APP_KEY, () => Preview);
