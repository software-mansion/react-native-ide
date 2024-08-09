import React from "react";
import Layout from "@theme/Layout";
import FooterBackground from "../components/FooterBackground";

import styles from "./pricing.module.css";
import PricingScreen from "../components/Pricing";

export default function Pricing(): JSX.Element {
  return (
    <Layout description="A better developer experience for React Native developers.">
      <div className={styles.preventfulContainer}>
        <div className={styles.container}>
          <PricingScreen />
        </div>
      </div>
      <FooterBackground />
    </Layout>
  );
}
