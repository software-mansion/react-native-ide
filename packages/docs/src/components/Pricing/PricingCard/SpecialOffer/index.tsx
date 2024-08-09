import React from "react";
import styles from "./styles.module.css";
import clsx from "clsx";

function SpecialOffer() {
  return (
    <div className={styles.plan__special_offer__wrapper}>
      <div className={clsx(styles.plan__special_offer, styles.plan__highlight)}>Recommended</div>
    </div>
  );
}

export default SpecialOffer;
