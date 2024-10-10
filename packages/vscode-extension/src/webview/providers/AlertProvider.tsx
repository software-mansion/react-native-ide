import React, { createContext, useCallback, useEffect, useState } from "react";
import Alert from "../components/shared/Alert";

interface AlertType {
  id: string;
  title: string;
  description?: string;
  actions: React.ReactNode;
  priority?: number; // higher – more important
}

interface AlertContextProps {
  openAlert: (alert: AlertType) => void;
  closeAlert: (id: string) => void;
  isOpen: (id: string) => boolean;
}

const AlertContext = createContext<AlertContextProps>({
  openAlert: () => {},
  closeAlert: () => {},
  isOpen: () => false,
});

export default function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertType[]>([]);

  const isOpen = useCallback(
    (id: string) => {
      return alerts.some((alert) => alert.id === id);
    },
    [alerts]
  );

  const openAlert = useCallback(({ id, title, description, actions, priority }: AlertType) => {
    setAlerts((oldAlerts) => {
      if (oldAlerts.some((alert) => alert.id === id)) {
        return oldAlerts;
      }
      return [...oldAlerts, { id, title, description, actions, priority }];
    });
  }, []);

  const closeAlert = useCallback((id: string) => {
    setAlerts((oldAlerts) => oldAlerts.filter((alert) => alert.id !== id));
  }, []);

  const topAlert = getTopAlert(alerts);

  return (
    <AlertContext.Provider value={{ openAlert, isOpen, closeAlert }}>
      {children}
      <Alert
        open={Boolean(topAlert?.id)}
        title={topAlert?.title}
        description={topAlert?.description}
        actions={topAlert?.actions}
        type="error"
      />
    </AlertContext.Provider>
  );
}

function getTopAlert(alerts: AlertType[]) {
  const sorted = [...alerts];

  sorted.sort((a, b) => {
    const aPriority = a.priority ?? 0;
    const bPriority = b.priority ?? 0;

    // only moves higher priority alerts to the end of array
    return aPriority - bPriority;
  });
  return sorted[sorted.length - 1];
}

export function useAlert() {
  const context = React.useContext(AlertContext);

  if (context === undefined) {
    throw new Error("useAlert must be used within a AlertProvider");
  }

  return context;
}

export function useToggleableAlert(open: boolean, alert: AlertType) {
  const { openAlert, isOpen, closeAlert } = useAlert();
  useEffect(() => {
    if (open && !isOpen(alert.id)) {
      openAlert(alert);
    } else if (!open && isOpen(alert.id)) {
      closeAlert(alert.id);
    }
  }, [open, alert, isOpen, openAlert, closeAlert]);
}
