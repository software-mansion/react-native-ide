import { useEffect, useState } from "react";
import IconButton from "./shared/IconButton";
import { ProjectInterface, ProjectState } from "../../common/Project";
import UrlSelect from "./UrlSelect";

interface UrlBarProps {
  project: ProjectInterface;
  disabled?: boolean;
}

function UrlBar({ project, disabled }: UrlBarProps) {
  const [urlList, setUrlList] = useState<{ name: string; id: string }[]>([]);
  useEffect(() => {
    function handleNavigationChanged(navigationData: { displayName: string; id: string }) {
      const newRecord = { name: navigationData.displayName, id: navigationData.id };
      setUrlList((urlList) => [
        newRecord,
        ...urlList.filter((record) => record.id !== newRecord.id),
      ]);
    }
    project.addListener("navigationChanged", handleNavigationChanged);
    const handleProjectReset = (e: ProjectState) => {
      if (e.status === "starting") {
        setUrlList([]);
      }
    };
    project.addListener("projectStateChanged", handleProjectReset);
    return () => {
      project.removeListener("navigationChanged", handleNavigationChanged);
      project.removeListener("projectStateChanged", handleProjectReset);
    };
  }, []);

  return (
    <>
      <IconButton
        tooltip={{
          label: "Go back",
          side: "bottom",
        }}
        disabled={disabled || urlList.length < 2}
        onClick={() => {
          project.openNavigation(urlList[1].id);
          // remove first item from the url list
          setUrlList((urlList) => urlList.slice(1));
        }}>
        <span className="codicon codicon-arrow-left" />
      </IconButton>
      <IconButton
        onClick={() => project.restart(false)}
        tooltip={{
          label: "Reset the app",
          side: "bottom",
        }}
        disabled={disabled}>
        <span className="codicon codicon-refresh" />
      </IconButton>
      <IconButton
        onClick={() => {
          project.goHome();
          setUrlList([]);
        }}
        tooltip={{
          label: "Go to main screen",
          side: "bottom",
        }}
        disabled={disabled || urlList.length == 0}>
        <span className="codicon codicon-home" />
      </IconButton>
      <UrlSelect
        onValueChange={(value: string) => {
          project.openNavigation(value);
        }}
        items={urlList}
        value={urlList[0]?.id}
        disabled={disabled || urlList.length < 1}
      />
    </>
  );
}

export default UrlBar;
