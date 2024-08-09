import React from "react";
import styles from "./styles.module.css";

import ArrowRight from "@site/static/img/arrow-right-hero.svg";
import clsx from "clsx";

interface ButtonProps {
  children: string;
  href?: string;
  target?: "_blank" | "_parent" | "_self" | "_top";
  disabled?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

function Button({ children, href, target = "_self", onClick, disabled, tooltip }: ButtonProps) {
  return (
    <a
      href={!disabled ? href : ""}
      target={target}
      title={tooltip}
      onClick={!disabled ? onClick : undefined}
      className={clsx(styles.buttonLink, disabled && styles.disabledLink)}>
      <div className={clsx(styles.button, disabled && styles.disabled)}>
        {children}
        {!disabled && (
          <div className={styles.arrow}>
            <ArrowRight />
          </div>
        )}
      </div>
    </a>
  );
}

export default Button;
