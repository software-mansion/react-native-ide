import React, { PropsWithChildren } from "react";
import * as Select from "@radix-ui/react-select";
import "./UrlSelect.css";

export type UrlItem = { id: string; name: string };

const SelectItem = React.forwardRef<HTMLDivElement, PropsWithChildren<Select.SelectItemProps>>(
  ({ children, ...props }, forwardedRef) => (
    <Select.Item className="url-select-item" {...props} ref={forwardedRef}>
      <Select.ItemText style={{ width: 1 }}>
        <div className="url-select-item-text">{children}</div>
      </Select.ItemText>
    </Select.Item>
  )
);

interface UrlSelectProps {
  value: string;
  onValueChange: (newValue: string) => void;
  recentItems: UrlItem[];
  items: UrlItem[];
  disabled?: boolean;
}

function UrlSelect({ onValueChange, recentItems, items, value, disabled }: UrlSelectProps) {
  // We use two lists for URL selection: one with recently used URLs and another
  // with all available URLs. Since recentItems is a subset of items, each recentItems's
  // value is prefixed to differentiate their origins when presented in the Select
  // component. This prefix is stripped off when the selected value is passed back
  // through onValueChange.

  const handleValueChange = (newSelection: string) => {
    const stripped = newSelection.replace(/^recent#/, "");
    onValueChange(stripped);
  };

  return (
    <Select.Root onValueChange={handleValueChange} value={value} disabled={disabled}>
      <Select.Trigger className="url-select-trigger">
        <Select.Value placeholder="/" aria-label={value} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="url-select-content" position="popper">
          <Select.ScrollUpButton className="url-select-scroll">
            <span className="codicon codicon-chevron-up" />
          </Select.ScrollUpButton>
          <Select.Viewport className="url-select-viewport">
            <Select.Group>
              <Select.Label className="url-select-label">Recently used:</Select.Label>
              {recentItems.map(
                (item) =>
                  item.name && (
                    <SelectItem value={`recent#${item.id}`} key={item.id}>
                      {item.name}
                    </SelectItem>
                  )
              )}
            </Select.Group>
            <Select.Separator className="url-select-separator" />
            <Select.Group>
              <Select.Label className="url-select-label">All visited paths:</Select.Label>
              {items.map(
                (item) =>
                  item.name && (
                    <SelectItem value={item.id} key={item.id}>
                      {item.name}
                    </SelectItem>
                  )
              )}
            </Select.Group>
          </Select.Viewport>
          <Select.ScrollDownButton className="url-select-scroll">
            <span className="codicon codicon-chevron-down" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default UrlSelect;
