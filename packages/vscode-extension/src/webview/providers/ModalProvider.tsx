import React, { createContext, useState } from "react";
import Modal from "../components/shared/Modal";

interface ModalContextProps {
  openModal: (title: string, component: React.ReactNode) => void;
  closeModal: () => void;
  showHeader: React.Dispatch<React.SetStateAction<boolean>>;
}

const ModalContext = createContext<ModalContextProps>({
  openModal: () => {},
  closeModal: () => {},
  showHeader: () => {},
});

export default function ModalProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("");
  const [component, setComponent] = useState(<></>);
  const [open, setOpen] = useState(false);
  const [headerShown, showHeader] = useState(true);

  const openModal = (modalTitle: string, modalComponent: React.ReactNode) => {
    setTitle(modalTitle);
    // @ts-ignore TODO see this further but i think it's fine
    setComponent(modalComponent);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal, showHeader }}>
      {children}
      <Modal
        title={title}
        component={component}
        open={open}
        setOpen={setOpen}
        headerShown={headerShown}
      />
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = React.useContext(ModalContext);

  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }

  return context;
}
