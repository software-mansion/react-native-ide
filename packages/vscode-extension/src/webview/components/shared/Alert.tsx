import React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import "./Alert.css";
import ErrorIcon from "../icons/ErrorIcon";

interface AlertProps {
  open: boolean;
  title: string;
  description?: string;
  actions: React.ReactNode;
  type?: "error";
}

function Alert({ open, title, description, actions, type = "error" }: AlertProps) {
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <div className="alert-dialog-content">
          {type === "error" && (
            <div className="alert-dialog-error">
              <ErrorIcon color="var(--red-dark-100)" />
            </div>
          )}
          <div>
            <AlertDialog.Title className="alert-dialog-title">{title}</AlertDialog.Title>
            {description && (
              <AlertDialog.Description className="alert-dialog-description">
                {description}
              </AlertDialog.Description>
            )}
          </div>
          <div className="alert-dialog-actions">{actions}</div>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default Alert;
