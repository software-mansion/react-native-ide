import React from "react";

import pricing from "../PricingCard/pricing.module.css";
import Button from "../../Button";
import PricingCard from "../PricingCard";
import SpecialOffer from "../PricingCard/SpecialOffer";
import useBaseUrl from "@docusaurus/useBaseUrl";

function SupporterPlan() {
  return (
    <PricingCard bold>
      <SpecialOffer />
      <h2 className={pricing.plan__name}>Supporter</h2>
      <h3 className={pricing.plan__price}>
        $10 <span className={pricing.plan__currency}>USD</span>
        <p className={pricing.plan__price_second_line}> per person/month excl. VAT </p>
      </h3>
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
        <li>Access to private Discord channel for feature requests and support</li>
        <li>For every month paid, you get a 50% discount on your Individual license</li>
        <li>Support the development of IDE</li>
      </ul>
      <p className={pricing.plan__tagline}>Supporter license deal ends with Beta.</p>
      <div className={pricing.plan__spacer} />
      <Button href="/" disabled>
        Available early July
      </Button>
    </PricingCard>
  );
}
export default SupporterPlan;
