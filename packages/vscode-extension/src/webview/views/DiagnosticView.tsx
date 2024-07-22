import "./View.css";
import "./DiagnosticView.css";
import { vscode } from "../utilities/vscode";
import Anchor from "../components/shared/Anchor";
import CheckIcon from "../components/icons/CheckIcon";
import CloseIcon from "../components/icons/CloseIcon";
import {
  DependencyState,
  InstallationStatus,
  useDependencies,
} from "../providers/DependenciesProvider";
import ProgressRing from "../components/shared/ProgressRing";
import Tooltip from "../components/shared/Tooltip";
import IconButton from "../components/shared/IconButton";
import Label from "../components/shared/Label";
import Button from "../components/shared/Button";

function DiagnosticView() {
  const { dependencies, runDiagnostics } = useDependencies();

  return (
    <>
      <Label>Common</Label>
      <DiagnosticItem label="Node.js" item={dependencies.Nodejs} />
      <DiagnosticItem label="Node Modules" item={dependencies.NodeModules} />
      <div className="diagnostic-section-margin" />

      <Label>Android</Label>
      <DiagnosticItem label="Android Emulator" item={dependencies.AndroidEmulator} />
      <div className="diagnostic-section-margin" />

      <Label>iOS</Label>
      <DiagnosticItem label="Xcode" item={dependencies.Xcode} />
      <DiagnosticItem label="CocoaPods" item={dependencies.CocoaPods} />
      <div className="diagnostic-section-margin" />

      <Label>Project related</Label>
      <DiagnosticItem label="React Native" item={dependencies.ReactNative} />
      <DiagnosticItem label="Expo" item={dependencies.Expo} />
      <DiagnosticItem label="Pods" item={dependencies.Pods} />
      <div className="diagnostic-section-margin" />

      <div className="diagnostic-button-container">
        <Button onClick={runDiagnostics} type="secondary">
          <span slot="start" className="codicon codicon-refresh" />
          Re-run checks
        </Button>
      </div>
    </>
  );
}

interface DiagnosticItemProps {
  label: string;
  item?: DependencyState;
  action?: React.ReactNode;
}

function DiagnosticItem({ label, item, action }: DiagnosticItemProps) {
  let icon = <ProgressRing />;
  if (item) {
    icon = {
      [InstallationStatus.Installed]: <CheckIcon />,
      [InstallationStatus.NotInstalled]: <CloseIcon />,
      [InstallationStatus.InProgress]: <ProgressRing />,
    }[item.installed];
  }
  return (
    <div className="diagnostic-item-wrapper">
      <div className="diagnostic-item">
        <div className="diagnostic-icon">{icon}</div>
        <p className="diagnostic-item-text">{label}</p>
        {item?.info && (
          <Tooltip label={item.info} type="secondary" instant>
            <span className="diagnostic-item-info-icon codicon codicon-info" />
          </Tooltip>
        )}
      </div>
      {item?.error && (
        <div className="diagnostic-error-wrapper">
          <DiagnosticError message={item?.error} />
          {action}
        </div>
      )}
    </div>
  );
}

interface DiagnosticErrorProps {
  message?: string;
}

export function DiagnosticError({ message }: DiagnosticErrorProps) {
  if (!message) {
    return null;
  }
  const markdownLinkRegex = /\[(.*)\]\((.*)\)/;
  const result = message.match(markdownLinkRegex);

  if (!result) {
    return <p className="diagnostic-item-error">{message}</p>;
  }

  const [fullLink, title, url] = result;
  const [messageFirstPart, messageSecondPart] = message.split(fullLink);
  return (
    <p className="diagnostic-item-error">
      {messageFirstPart}
      <Anchor url={url}>{title}</Anchor>
      {messageSecondPart}
    </p>
  );
}

export default DiagnosticView;
