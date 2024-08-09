import React from "react";
import HomepageButton, { ButtonStyling, BorderStyling } from "@site/src/components/HomepageButton";
import styles from "./styles.module.css";

const LicenseBanner = () => {
  return (
    <div className={styles.licenseContainer}>
      <div className={styles.ellipse} />
      <div className={styles.ellipse} />
      <div className={styles.contentContainer}>
        <h2>Supporter License is now available!</h2>
        <span>
          Get access to private Discord channel for feature requests and support and 50% discount on
          future Individual or Team license.
        </span>
      </div>
      <HomepageButton
        href="/pricing"
        backgroundStyling={ButtonStyling.TO_WHITE}
        borderStyling={BorderStyling.NAVY}
        title="Get the License"
      />
    </div>
  );
};

export default LicenseBanner;
