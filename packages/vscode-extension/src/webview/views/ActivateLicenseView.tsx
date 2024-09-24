import { useRef, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import "./ActivateLicenseView.css";
import { activateDevice } from "../../utilities/license";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import Button from "../components/shared/Button";
import { useProject } from "../providers/ProjectProvider";
import { useModal } from "../providers/ModalProvider";

export function ActivateLicenseView() {
  const { project } = useProject();
  const { closeModal } = useModal();
  const { register, handleSubmit } = useForm();

  const [isLoading, setIsLoading] = useState(false);
  const [wasRejected, setWasRejected] = useState(false);

  const onSubmit: SubmitHandler<FieldValues> = (e, data) => {
    setIsLoading(true);

    const activationPromise = project.activateLicense(data?.target[0].value, "username");

    activationPromise.then((success) => {
      if (success) {
        closeModal();
      } else {
        setWasRejected(true);
      }
      setIsLoading(false);
    });
  };

  return (
    <form className="container" onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register("licenseKey")}
        className="license-input"
        type="text"
        placeholder="LICENSE KEY"
      />
      {isLoading ? <VSCodeProgressRing /> : <Button type="submit">Submit</Button>}
    </form>
  );
}
