import React from "react";
import * as Dialog from "@radix-ui/react-dialog";

import "./Modal.css";
import IconButton from "./IconButton";

interface ModalProps {
  title: string;
  component: React.ReactNode;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  headerShown?: boolean;
}

export default function Modal({ title, component, open, setOpen, headerShown }: ModalProps) {
  const close = () => setOpen(false);
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" onClick={close} />
        <Dialog.Content className="modal-content" onEscapeKeyDown={close}>
          {headerShown && <Dialog.Title className="modal-title">{title}</Dialog.Title>}

          <div className="modal-content-container">{component}</div>
          <Dialog.Close asChild>
            <IconButton className="modal-close-button" aria-label="Close" onClick={close}>
              <span className="codicon codicon-close" />
            </IconButton>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
