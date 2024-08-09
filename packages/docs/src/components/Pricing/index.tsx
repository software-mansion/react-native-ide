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
        React Native IDE is currently in Beta. Using{" "}
        <span className={styles.highlight}>
          the Beta version doesn't require purchasing any license
        </span>{" "}
        and it's free for everyone. We expect the Beta period to <b>end in October 2024</b> after
        which we will require an Individual or Team license to use the tool. However, if you'd like
        to support the development and having more input into the development process (request
        specific features or prioritize fixes for specific issues), below we offer a Supporter's
        license:
      </p>
      <div className={styles.wrapper}>
        <SupporterPlan />
      </div>
      <p>
        *The discount for Individual or Team license is valid for the same duration as your
        Supporter's license. For every month your Supporter's license is active, you receive the 50%
        discount on the Individual or Team license.
      </p>
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
