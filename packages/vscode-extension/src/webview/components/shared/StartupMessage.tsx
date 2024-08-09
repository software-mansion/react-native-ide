import { useEffect, useState } from "react";
import classNames from "classnames";
import "./StartupMessage.css";
import { StartupMessage } from "../../../common/Project";

interface StartupMessageProps {
  children: React.ReactNode;
  className: string;
}

const dots = ["", ".", "..", "..."];

function StartupMessageComponent({ children, className }: StartupMessageProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((index + 1) % dots.length);
    }, 350);

    return () => clearInterval(interval);
  });

  return (
    <div className={classNames("startup-message-wrapper", className)}>
      {children}
      <div className="startup-message-dots">
        {children !== StartupMessage.Building && children !== StartupMessage.WaitingForAppToLoad
          ? dots[index]
          : ""}
      </div>
    </div>
  );
}

export default StartupMessageComponent;
