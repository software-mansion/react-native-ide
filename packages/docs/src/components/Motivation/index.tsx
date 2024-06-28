import React from "react";
import styles from "./styles.module.css";
import Elipse from "@site/src/components/Elipse";

const Motivation = () => {
  return (
    <section>
      <div className={styles.elipseContainer}>
        <Elipse className={styles.elipse} isSmall />
      </div>
      <div className={styles.motivation}>
        <h2 className={styles.heading}>Motivation</h2>
        <p className={styles.paragraph}>
          We are React Native Core Contributors and maintainers of open-source libraries like{" "}
          <a href="https://docs.swmansion.com/react-native-reanimated/" target="_blank">
            React Native Reanimated
          </a>
          ,{" "}
          <a href="https://docs.swmansion.com/react-native-gesture-handler/" target="_blank">
            React Native Gesture Handler
          </a>
          , and{" "}
          <a href="https://github.com/software-mansion/react-native-screens" target="_blank">
            React Native Screens
          </a>
          . You most probably already use them in your applications. The maintenance of the packages
          takes a lot of development time which isn't free. That's why we've decided to distribute
          React Native IDE under a paid license.{" "}
        </p>
        <p className={styles.paragraph}>
          <strong>
            All the money coming from sales of the IDE will be used to fund React Native Open Source
            efforts at Software Mansion.
          </strong>
        </p>
      </div>
    </section>
  );
};

export default Motivation;
