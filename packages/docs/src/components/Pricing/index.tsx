import React, { useEffect, useState } from "react";
import styles from "./styles.module.css";
import PricingPlansList from "./PricingPlansList";
import FAQ from "../Sections/FAQ";
import Admonition from "@site/src/theme/Admonition";
import Motivation from "../Motivation";

import { initializePaddle, Paddle } from "@paddle/paddle-js";

const Pricing = () => {
  // Create a local state to store Paddle instance
  const [paddle, setPaddle] = useState<Paddle>();

  // Download and initialize Paddle instance from CDN
  useEffect(() => {
    initializePaddle({ environment: "sandbox", token: "test_e4f6457e74dffcba61da98c3e6e" }).then(
      (paddleInstance: Paddle | undefined) => {
        if (paddleInstance) {
          setPaddle(paddleInstance);
        }
      }
    );
  }, []);

  const openEarlyBirdCheckout = () => {
    paddle?.Checkout.open({
      items: [{ priceId: "pri_01hzpzgm6b6tzmh3s9aenphmgd", quantity: 1 }],
    });
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.headingLabel}>Pricing</h1>
      <Admonition type="info">
        Right now, we are gathering the feedback and working on the stability of the product.
        <br />
        <br /> React Native IDE is{" "}
        <span className={styles.highlight}>completely free during the Beta period</span> which ends
        <b> at the end of Q3 2024</b>. However, you can buy our Early Bird's License to help with
        the development.
      </Admonition>
      <PricingPlansList earlyBirdLicenseCallback={openEarlyBirdCheckout} />
      <Motivation />
      <FAQ />
    </div>
  );
};

export default Pricing;
