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
  const [component, setComponent] = useState<React.ReactNode>(<></>);
  const [open, setOpen] = useState(false);
  const [headerShown, showHeader] = useState(true);

  const openModal = (_title: string, _component: React.ReactNode) => {
    setTitle(_title);
    setComponent(_component);
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
