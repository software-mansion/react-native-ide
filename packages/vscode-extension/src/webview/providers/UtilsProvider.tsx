import { PropsWithChildren, useContext, createContext } from "react";
import { makeProxy } from "../utilities/rpc";
import { Utils } from "../../utilities/utils";
import { UtilsInterface } from "../../common/utils";

declare global {
  interface Window {
    // set in generateWebviewContent()
    RNIDE_hostOS: "macos" | "windows";
  }
}

export const Platform = {
  OS: window.RNIDE_hostOS,
  select: <R, T>(obj: { macos: R; windows: T }) => {
    return obj[Platform.OS];
  },
};

const utils = makeProxy<Utils>("Utils");

const UtilsContext = createContext<UtilsInterface>(utils);

export default function UtilsProvider({ children }: PropsWithChildren) {
  return <UtilsContext.Provider value={utils}>{children}</UtilsContext.Provider>;
}

export function useUtils() {
  const context = useContext(UtilsContext);

  if (context === undefined) {
    throw new Error("useUtils must be used within a UtilsContextProvider");
  }
  return context;
}
