import { ExtensionContext, ExtensionMode, Webview, Uri, extensions } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { getDevServerScriptUrl } from "../utilities/common";
import { Platform } from "../utilities/platform";

const VITE_DEV_HOST = "localhost:2137";

const VITE_DEV_PREABMLE = /*html*/ `
<script type="module">
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="/@vite/client"></script>
`;

export function generateWebviewContent(
  context: ExtensionContext,
  webview: Webview,
  extensionUri: Uri
) {
  const IS_DEV = context.extensionMode === ExtensionMode.Development;

  // The JS file from the React build output
  const scriptUri = IS_DEV ? `/src/webview/index.jsx` : "webview.js";

  const baseUri = IS_DEV ? `http://${VITE_DEV_HOST}` : getUri(webview, extensionUri, ["dist/"]);

  const codiconsCssUri = IS_DEV
    ? getUri(webview, extensionUri, ["node_modules/@vscode/codicons/dist/codicon.css"])
    : "codicon.css";

  const nonce = getNonce();

  const version = context.extension.packageJSON.version;

  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <base href="${baseUri}">
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="react-native-ide-version" content="${version}" />
        <link rel="stylesheet" href="${codiconsCssUri}" />
        ${
          IS_DEV
            ? VITE_DEV_PREABMLE
            : `
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none';
                      img-src vscode-resource: http: https: data:;
                      style-src ${webview.cspSource} 'unsafe-inline';
                      script-src 'nonce-${nonce}';
                      font-src vscode-resource: https:;" />
        <link rel="stylesheet" type="text/css" href="webview.css" />`
        }
      </head>
      <body>
        <div id="root"></div>
        <script>window.RNIDE_hostOS = "${Platform.OS}";</script>
        <script type="module" nonce="${nonce}" src="${scriptUri}" />
      </body>
    </html>
  `;
}
