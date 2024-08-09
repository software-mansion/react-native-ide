import { useToggleableAlert } from "../providers/AlertProvider";
import { useModal } from "../providers/ModalProvider";
import { useDependencies } from "../providers/DependenciesProvider";
import { useProject } from "../providers/ProjectProvider";

import IconButton from "../components/shared/IconButton";
import DiagnosticView from "../views/DiagnosticView";
import DoctorIcon from "../components/icons/DoctorIcon";
import { DevicePlatform } from "../../common/DeviceManager";

function Actions() {
  const { project } = useProject();
  const { openModal } = useModal();
  return (
    <>
      <IconButton
        type="secondary"
        onClick={() => {
          openModal("Diagnostics", <DiagnosticView />);
        }}
        tooltip={{ label: "Run diagnostics", side: "bottom" }}>
        <DoctorIcon />
      </IconButton>
      <IconButton
        type="secondary"
        onClick={() => {
          project.restart(false);
        }}
        tooltip={{ label: "Reload IDE", side: "bottom" }}>
        <span className="codicon codicon-refresh" />
      </IconButton>
    </>
  );
}

const diagnosticAlert = {
  id: "diagnostic-alert",
  title: "Cannot run project",
  description: "Run diagnostics to find out what went wrong.",
  actions: <Actions />,
};
export function useDiagnosticAlert(platform?: DevicePlatform) {
  const { isCommonError, isAndroidError, isIosError } = useDependencies();
  let open = isCommonError;
  if (platform === DevicePlatform.Android && isAndroidError) {
    open = true;
  } else if (platform === DevicePlatform.IOS && isIosError) {
    open = true;
  }
  useToggleableAlert(open, diagnosticAlert);
}
