import React from "react";
import styles from "./styles.module.css";
import FaqList from "@site/src/components/FaqList";
import Elipse from "@site/src/components/Elipse";

const faqs = [
  {
    topic: "What is React Native IDE?",
    answer:
      "React Native IDE is a Visual Studio Code extension that aims to simplify the development of React Native applications.",
  },
  {
    topic: "Can I use it on Windows or Linux?",
    answer: "Right now, React Native IDE only supports macOS.",
  },
  {
    topic: "How much does it cost?",
    answer: `The React Native IDE is free to use during the Beta period. We're working on a sustainable licensing model for the project.<br/><br/>
    100% of the money earned will be used to fund the React Native open source efforts at Software Mansion and the further developments of the React Native IDE.<br/><br/>
    `,
  },
  {
    topic: "Do you offer a student discount?",
    answer: `Yes! React Native IDE is free for students learning at accredited educational institutions. Only for non-commercial purposes.`,
  },
  {
    topic: "When are you planning to close the public Beta?",
    answer: "We're aiming to close the beta at the end of Q3 2024.",
  },

  {
    topic: "Why did you make the source code public?",
    answer:
      "We are well aware there are an infinite number of ways of setting up your React Native project. With access to the code you can adjust the React Native IDE to make it run with your codebase.",
  },
  {
    topic: "What's up with the code license of the React Native IDE?",
    answer: `TL;DR<br/>
It's okay to modify the code to run in your project and to fix bugs. However, do not distribute the project on your own in any way or form besides our official channels.<br/><br/>This license will evolve as we move beyond the Beta period. <a href="https://github.com/software-mansion/react-native-ide/blob/main/LICENSE.txt" target="_blank">You can read the full license here</a>.`,
  },
  {
    topic: "Is WebStorm supported?",
    answer:
      "At this moment WebStorm is not supported.<br/><br/>As the adoption for the extension grows we might add a support for WebStorm in the future.",
  },
];

const FAQ = () => {
  return (
    <section>
      <div className={styles.elipseContainer}>
        <Elipse className={styles.elipse} size={290} />
        <Elipse isSmall className={styles.elipse} />
      </div>
      <div className={styles.faq}>
        <div className={styles.faqMain}>
          <h2 className={styles.faqHeading}>FAQ</h2>
          <span className={styles.faqSubheading}>
            Here are the answers to your most frequent questions about the React Native IDE.
          </span>
        </div>
        <div>
          <FaqList faqs={faqs} />
        </div>
      </div>
    </section>
  );
};

export default FAQ;
