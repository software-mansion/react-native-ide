import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useRef } from "react";
import { InspectDataStackItem } from "../../common/Project";

import "./InspectDataMenu.css";

type OnSelectedCallback = (item: InspectDataStackItem) => void;

export function InspectDataMenu({
  inspectLocation,
  inspectStack,
  onSelected,
  onHover,
  onCancel,
}: {
  inspectLocation: { x: number; y: number };
  inspectStack: InspectDataStackItem[];
  onSelected: OnSelectedCallback;
  onHover: OnSelectedCallback;
  onCancel: () => void;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const filteredData = inspectStack.filter((item) => !item.hide);

  useEffect(() => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: inspectLocation.x, // X position
      clientY: inspectLocation.y, // Y position
    });

    triggerRef.current?.dispatchEvent(event);
  }, []);

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}>
      <ContextMenu.Trigger ref={triggerRef} />
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content">
          {filteredData.map((item) => {
            // extract file name from path:
            const fileName = item.source.fileName.split("/").pop();
            return (
              <ContextMenu.Item
                className="context-menu-item"
                onSelect={() => onSelected(item)}
                onMouseEnter={() => onHover(item)}>
                <code>{`<${item.componentName}>`}</code>
                <div className="right-slot">{`${fileName}:${item.source.line0Based + 1}`}</div>
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
