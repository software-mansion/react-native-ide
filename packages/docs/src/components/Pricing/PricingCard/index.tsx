import React from "react";
import styles from "./styles.module.css";
import clsx from "clsx";

interface PricingCardProps {
  children: React.ReactNode;
  bold?: boolean;
}

function PricingCard({ children, bold }: PricingCardProps) {
  return (
    <li className={styles.item}>
      <div className={clsx(styles.plan__container, bold && styles.plan__container__bold)}>
        {children}
      </div>
    </li>
  );
}

export default PricingCard;
