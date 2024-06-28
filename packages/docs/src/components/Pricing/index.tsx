import React from "react";
import styles from "./styles.module.css";
import PricingPlansList from "./PricingPlansList";
import FAQ from "../Sections/FAQ";
import Motivation from "../Motivation";
import SupporterPlan from "./SupporterPlan";

const Pricing = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.headingLabel}>Pricing</h1>
      <p>
        React Native IDE is{" "}
        <span className={styles.highlight}>completely free during the Beta period</span> which we
        aim to close
        <b> at the end of Q3 2024</b>. However, if you want to help the development of React Native
        IDE, affect the prioritization of features and get better support, you can buy our
        Supporter's License.
      </p>
      <div className={styles.wrapper}>
        <SupporterPlan />
      </div>
      <p className={styles.disclaimer}>
        Disclaimer: The following pricing plans will be introduced after the Beta period ends. They
        are for informational purposes and may change in the future.
      </p>
      <div className={styles.wrapper}>
        <PricingPlansList />
      </div>
      <p>
        If you want to help the development of React Native IDE, affect the prioritization of
        features and get better support, you can buy our Supporter's License.
      </p>
      <Motivation />
      <FAQ />
    </div>
  );
};

export default Pricing;
