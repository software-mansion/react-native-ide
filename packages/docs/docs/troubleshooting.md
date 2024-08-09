---
id: troubleshooting
title: Troubleshooting
sidebar_position: 7
---

## Troubleshooting issues with React Native IDE

Below, we outline some ways that may help you self-diagnose and hopefully resolve issues you may encounter when using the React Native IDE extension.

### -sec-num- Project setup diagnostics commands

This command can be located on the vscode commands palette when a given workspace is not recognized as a valid React Native of Expo project.
In this case lookup command called "React Native IDE: Diagnostics" – when executed it will show a notification message with pointers on why React Native IDE panel cannot be opened for this project.

### -sec-num- Is your project setup supported?

The extension does not currently support all types and configurations of React Native projects.
For example, Expo Go or brownfield apps aren't supported while we are improving the compatibility of different project setups.
Please refer to ["Who can use this"](./getting-started.md) section for more details on that.
If your project doesn't work out of the box because of some modifications made to its setup, chances are the React Native IDE can be configured to support your modifications, please check [configuration](./launch-configuration.md) guide to learn more.

### -sec-num- Can extension locate your React Native project

The extension supports monorepo-type of setups and you should be able to use it even if the app isn't in the root folder of your workspace.
This setup however has some limitations because the extension can only work with a single application per workspace.
If your monorepo contain multiple projects, you'll need to instruct the extension with the location of your main React Native or Expo application folder.
This can be done using [launch configuration](./launch-configuration.md) using `appRoot` setting – please refer to [configuration guide](./launch-configuration.md) for more details.

### -sec-num- List of available devices is empty

The extension relies on Android Studio to install Android emulators and on Xcode tools to manage and install iOS simulators.
The extension can spawn new devices on its own, but it requires the system images can only be installed using Android Studio and Xcode.
Please refer to [simulators](./simulators.md) section to learn more about installing system images for different platforms.

### -sec-num- Stuck on "Waiting for app to load"

You typically should not see this state for longer than a second or two.
If it stays visible longer than that, something might be wrong with the device setup and this type of issue indicates that the extension may be unable to launch and render your app automatically.
When this happens, you can click on the "Waiting for app to load" text to reveal the device preview and see what's happening under the hood.
Sometimes the app gets blocked by some system dialog that we don't have a way to detect, in which case you need to close the dialog and the app should start normally.

### -sec-num- Accessing extension logs

In order to access React Native IDE extension logs you need to open "Output Panel" with the default shortcut ⇧⌘U or by using a command named "Developer: Show Logs..." from the command palette.
On the "Output Panel", select "React Native IDE" as the source.
In order to share the logs with others you can use "Open Output in Editor" option available from the Output Panel toolbar.

:::info
In pre-release versions, the extension is configured to do a lot of verbose logging despite a different log level you may have set in your vscode's settings.
This is done so that we don't need to ask you to change the log level setting that applies to all the extensions and the editor itself.
As a consequence you may see a lot of unnecessary messages in the log output, but we still believe it'd give us better signal when dealing with potential issues.
:::

### -sec-num- Accessing build logs

Native builds are one of the most time consuming phases when launching your project.
Build processes output a lot of logs on their own and hence they have separate output channels.
When something goes wrong in the native build phase, instead of checking "React Native IDE" source in "Output Panel" as described in the previous point, select "React Native IDE (Android build)" or "React Native IDE (iOS build)" source depending on the platform you're building for.

### -sec-num- General ways of recovering in case of errors

Here is what you can try when the extension got stuck on some errors:

- Try "Clean rebuild" option from the cog-wheel menu in the upper right corner of the extension panel
- Try closing and reopening extension panel
- Check whether you can build and run app without the extension (using `expo` or `react-native-cli`)
- Try restarting vscode ¯\\\_(ツ)\_/¯

### -sec-num- Installing an older version of the IDE

If you need to install an older version of an IDE, you can do so by navigating to the cogwheel menu next to the "install" button in the market place. 

<img width="698" alt="download-older-version" src="/img/docs/marketplace_install_older_version.png"/>
