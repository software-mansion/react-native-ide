import { forwardRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import classNames from "classnames";
import IconButton, { IconButtonProps } from "./shared/IconButton";
import "./IconButtonWithOptions.css";

interface IconButtonWithOptions extends IconButtonProps {
  options: Record<string, () => void>;
}

export const IconButtonWithOptions = forwardRef<HTMLButtonElement, IconButtonWithOptions>(
  (props, ref) => {
    const { options, children, ...iconButtonProps } = props;

    const [dropdownTriggerVisible, setDropdownTriggerVisible] = useState(false);

    return (
      <div
        className="icon-container"
        onMouseEnter={() => {
          setDropdownTriggerVisible(true);
        }}
        onMouseLeave={() => {
          setDropdownTriggerVisible(false);
        }}>
        <IconButton ref={ref} {...iconButtonProps}>
          {children}
        </IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            {
              <div
                className={classNames(
                  "dropdown-arrow codicon codicon-triangle-down",
                  !dropdownTriggerVisible && "dropdown-arrow-hide"
                )}
              />
            }
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-menu-content">
              {Object.entries(options).map(([title, onSelect], index) => (
                <DropdownMenu.Item className="dropdown-menu-item" key={index} onSelect={onSelect}>
                  {title}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
  }
);
