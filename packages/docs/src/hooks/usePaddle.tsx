import { useEffect, useState } from "react";
import { initializePaddle, InitializePaddleOptions, Paddle } from "@paddle/paddle-js";

const paddleOptions: InitializePaddleOptions =
  process.env.NODE_ENV === "production"
    ? { environment: "production", token: "live_66e3b794dd039b367ade77942ab" }
    : { environment: "sandbox", token: "test_e4f6457e74dffcba61da98c3e6e" };

function usePaddle() {
  // Create a local state to store Paddle instance
  const [paddle, setPaddle] = useState<Paddle>();

  // Download and initialize Paddle instance from CDN
  useEffect(() => {
    initializePaddle(paddleOptions).then((paddleInstance: Paddle | undefined) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });
  }, []);

  return paddle;
}

export default usePaddle;
