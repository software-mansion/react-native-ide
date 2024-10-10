import { useEffect, useRef, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useProject } from "../providers/ProjectProvider";
import "./DeviceLocalizationView.css";
import "../components/shared/SwitchGroup.css";
import localesList from "../utilities/localeList.json";
import { Locale } from "../../common/Project";
import { useModal } from "../providers/ModalProvider";
import Button from "../components/shared/Button";

type LocaleWithDescription = { localeIdentifier: Locale; Description: string };

export function DeviceLocalizationView() {
  const { deviceSettings } = useProject();
  const { openModal } = useModal();
  const [searchPhrase, setSearchPhrase] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current!.focus();
    }
  }, []);

  const onSelectNewLocale = (locale: any): (() => void) => {
    return () => {
      openModal("", <LocalizationChangeConfirmationView locale={locale} />);
    };
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchPhrase = event.target.value;
    setSearchPhrase(newSearchPhrase);
  };

  return (
    <div className="localization-container">
      <div className="search-bar">
        <input
          ref={inputRef}
          className="search-input"
          type="string"
          placeholder="Search..."
          onChange={handleSearchChange}
        />
      </div>
      <ScrollArea.Root className="ScrollAreaRoot">
        <ScrollArea.Viewport className="ScrollAreaViewport">
          <div style={{ padding: "15px 20px" }}>
            {localesList
              .filter((locale) => {
                return locale.Description.toLocaleLowerCase().startsWith(
                  searchPhrase.toLocaleLowerCase()
                );
              })
              .map((locale, i) => (
                <LocaleTile
                  locale={locale}
                  isActive={locale.localeIdentifier === deviceSettings.locale}
                  onClick={onSelectNewLocale(locale)}
                />
              ))}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="ScrollAreaScrollbar" orientation="vertical">
          <ScrollArea.Thumb className="ScrollAreaThumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
}

type LocaleTileProps = {
  locale: LocaleWithDescription;
  isActive: boolean;
  onClick: () => void;
};

const LocaleTile = ({ locale, isActive, onClick }: LocaleTileProps) => {
  return (
    <div className="localeTile" onClick={onClick}>
      <div>{locale.Description}</div>
      {isActive && <span className="codicon codicon-check" />}
    </div>
  );
};

type LocalizationChangeConfirmationViewProps = {
  locale: LocaleWithDescription;
};

const LocalizationChangeConfirmationView = ({
  locale,
}: LocalizationChangeConfirmationViewProps) => {
  const { openModal, closeModal } = useModal();

  const { project, deviceSettings } = useProject();

  const onCancel = () => {
    openModal("Localization", <DeviceLocalizationView />);
  };

  return (
    <div className="localization-change-wrapper">
      <h2 className="localization-change-title">
        Are you sure you want to change the localization to <i>{locale.Description}</i>?
      </h2>
      <p className="localization-change-subtitle">This action will reboot the device.</p>
      <div className="localization-change-button-group">
        <Button type="secondary" className="localization-change-button" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="localization-change-button"
          type="ternary"
          onClick={async () => {
            project.updateDeviceSettings({ ...deviceSettings, locale: locale.localeIdentifier });
            closeModal();
          }}>
          Confirm
        </Button>
      </div>
    </div>
  );
};
