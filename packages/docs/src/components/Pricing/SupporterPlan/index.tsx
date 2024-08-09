import React from "react";

import pricing from "../PricingCard/pricing.module.css";
import Button from "../../Button";
import PricingCard from "../PricingCard";
import SpecialOffer from "../PricingCard/SpecialOffer";
import useBaseUrl from "@docusaurus/useBaseUrl";
import usePaddle from "@site/src/hooks/usePaddle";

const supporterPriceId =
  process.env.NODE_ENV === "production"
    ? "pri_01j2b6c41n8qpgdbvrf5fv5ben"
    : "pri_01j2b5fx2rnj6s98rcxv2t1p2g";

function SupporterPlan() {
  const paddle = usePaddle();

  const openSupporterCheckout = () => {
    paddle?.Checkout.open({
      items: [{ priceId: supporterPriceId, quantity: 1 }],
    });
  };
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
        <li>50% discount on future Individual or Team license*</li>
        <li>Support the development of IDE</li>
      </ul>
      <p className={pricing.plan__tagline}>Supporter license deal ends with Beta.</p>
      <div className={pricing.plan__spacer} />
      <Button onClick={openSupporterCheckout}>Choose</Button>
    </PricingCard>
  );
}
export default SupporterPlan;
