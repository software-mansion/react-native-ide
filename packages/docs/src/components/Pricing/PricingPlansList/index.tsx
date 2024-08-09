import React from "react";
import styles from "./styles.module.css";
import pricing from "../PricingCard/pricing.module.css";
import Button from "../../Button";
import PricingCard from "../PricingCard";
import useBaseUrl from "@docusaurus/useBaseUrl";

const PricingPlansList = () => {
  return (
    <ul className={styles.list}>
      <PricingCard>
        <h2 className={pricing.plan__name}>Individual</h2>
        <h3 className={pricing.plan__price}>
          $19 <span className={pricing.plan__currency}>USD</span>
          <p className={pricing.plan__price_second_line}> per person/month excl. VAT </p>
        </h3>
        <p className={pricing.plan__tagline}>Up to 14 seats</p>
        <p>What's included:</p>
        <ul className={pricing.plan__features}>
          <li>
            <a
              href={useBaseUrl("/docs/getting-started#-what-does-it-do")}
              target="_blank"
              rel="noopener noreferrer">
              All the features of React Native IDE
            </a>
          </li>
          <li>Support through official Software Mansion channels</li>
          <li>Support the development of IDE</li>
        </ul>
        <div className={pricing.plan__spacer} />
        <Button href="/" disabled>
          Available soon
        </Button>
      </PricingCard>
      <PricingCard>
        <h2 className={pricing.plan__name}>Team</h2>
        <h3 className={pricing.plan__price}>Get in touch</h3>
        <p className={pricing.plan__tagline}>
          <a
            href="https://swmansion.com/contact/projects"
            target="_blank"
            rel="noopener noreferrer">
            Contact us
          </a>{" "}
          for pricing estimates
        </p>
        <p className={pricing.plan__tagline}>Starting from 15 seats</p>
        <p>What's included:</p>
        <ul className={pricing.plan__features}>
          <li>
            <a
              href={useBaseUrl("/docs/getting-started#-what-does-it-do")}
              target="_blank"
              rel="noopener noreferrer">
              All the features of React Native IDE
            </a>
          </li>
          <li>Access to priority support channels</li>
          <li>Support the development of IDE</li>
          <li>React Native Consulting services available</li>
        </ul>
        <div className={pricing.plan__spacer} />
        <Button href="https://swmansion.com/contact/projects" disabled>
          Available soon
        </Button>
      </PricingCard>
    </ul>
  );
};

export default PricingPlansList;
