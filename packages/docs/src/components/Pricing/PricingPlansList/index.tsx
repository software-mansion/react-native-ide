import React, { useState } from "react";
import styles from "./styles.module.css";
import Button from "../../Button";
import clsx from "clsx";

interface PricingPlansListProps {
  earlyBirdLicenseCallback: () => void;
}

const PricingPlansList = ({ earlyBirdLicenseCallback }: PricingPlansListProps) => {
  const [isMonthly, setIsMonthly] = useState(true);

  const individualMonthly = (
    <>
      $19 <span className={styles.plan__currency}>USD</span>
      <p className={styles.plan__price_second_line}> per person/month </p>
    </>
  );
  const individualAnnually = (
    <>
      <span className={styles.plan__price_strikethrough}>$228</span> $190{" "}
      <span className={styles.plan__currency}>USD</span>{" "}
      <p className={styles.plan__price_second_line}>per person/year </p>
    </>
  );
  const earlyBirdMonthly = (
    <>
      <span className={styles.plan__price_strikethrough}>$19</span> $10{" "}
      <span className={styles.plan__currency}>USD</span>{" "}
      <p className={styles.plan__price_second_line}>per person/month, billed yearly </p>
    </>
  );
  const earlyBirdAnnually = (
    <>
      <span className={styles.plan__price_strikethrough}>$190</span> $120{" "}
      <span className={styles.plan__currency}>USD</span>{" "}
      <p className={styles.plan__price_second_line}>per person/year </p>
    </>
  );
  return (
    <>
      <div className={styles.plan_pay_annually}>
        <p>Monthly</p>
        <label className={styles.toggleSwitch}>
          <input
            type="checkbox"
            checked={isMonthly}
            onChange={() => void setIsMonthly(!isMonthly)}
          />
          <div className={styles.toggleSwitchBackground}>
            <div className={styles.toggleSwitchHandle}></div>
          </div>
        </label>
        <p>
          Yearly <span className={styles.plan_pay_annually__discount}>2 months free</span>
        </p>
      </div>
      <ul className={styles.list}>
        <li className={styles.item}>
          <div className={styles.plan__container}>
            <h2 className={styles.plan__name}>Individual</h2>
            <h3 className={styles.plan__price}>
              {isMonthly ? individualMonthly : individualAnnually}
            </h3>
            <p className={styles.plan__tagline}>
              billed {isMonthly ? "monthly" : "yearly, two months free"}
            </p>
            <p>What's included:</p>
            <ul className={styles.plan__features}>
              <li>Put breakpoints right in the VSCode</li>
              <li>Develop components in isolation</li>
              <li>Expo Router & React Navigation integration</li>
              <li>Get support through official Software Mansion channels</li>
              <li>Support the development of IDE</li>
            </ul>
            <div className={styles.plan__spacer} />
            <Button href="/" disabled>
              Available soon
            </Button>
          </div>
        </li>
        <li className={styles.item}>
          <div className={styles.plan__special_offer__wrapper}>
            <div className={clsx(styles.plan__special_offer, styles.plan__highlight)}>
              One-time special offer
            </div>
          </div>
          <div className={styles.plan__container}>
            <h2 className={styles.plan__name}>Early Bird</h2>
            <h3 className={styles.plan__price}>
              {isMonthly ? earlyBirdMonthly : earlyBirdAnnually}
            </h3>
            <p className={styles.plan__tagline}>one-time payment for a year</p>
            <p>What's included:</p>
            <ul className={styles.plan__features}>
              <li>Everything in Individual</li>
              <li>Get access to direct chat with creators of IDE</li>
              <li>Prioritized feature requests </li>
              <li>Support the development of IDE</li>
            </ul>
            <p className={styles.plan__tagline}>
              Freeze your price for the first year. License period starts Q3 2024, next billing Q3
              2025. Early bird discount ends with Beta.
            </p>
            <div className={styles.plan__spacer} />
            <Button onClick={earlyBirdLicenseCallback}>Choose</Button>
          </div>
        </li>

        <li className={styles.item}>
          <div className={styles.plan__container}>
            <h2 className={styles.plan__name}>Enterprise</h2>
            <h3 className={styles.plan__price}>Get in touch</h3>
            <p className={styles.plan__tagline}>
              <a href="https://swmansion.com/contact#contact-form">Contact us</a> for pricing
              estimates
            </p>
            <p>What's included:</p>
            <ul className={styles.plan__features}>
              <li>Everything in Individual</li>
              <li>Priority support</li>
              <li>React Native Consulting services available</li>
            </ul>
            <div className={styles.plan__spacer} />
            <Button href="https://swmansion.com/contact#contact-form">Contact Sales</Button>
          </div>
        </li>
      </ul>
      <p>
        Disclaimer: The following pricing is for informational purposes only and may change in the
        future.
      </p>
    </>
  );
};

export default PricingPlansList;
