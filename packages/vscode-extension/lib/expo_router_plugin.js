import { store } from "expo-router/build/global-state/router-store.js";

import { useSyncExternalStore, useEffect, useState } from "react";
import { useRouter } from "expo-router";

function computeRouteIdentifier(pathname, params) {
  return pathname + JSON.stringify(params);
}

function useRouterPluginMainHook({ onNavigationChange }) {
  const router = useRouter();
  const [initCallbacks, setInitCallbacks] = useState([]);
  const routeInfo = useSyncExternalStore(
    store.subscribeToRootState,
    store.routeInfoSnapshot,
    store.routeInfoSnapshot
  );

  const pathname = routeInfo?.pathname;
  const params = routeInfo?.params;
  useEffect(() => {
    onNavigationChange({
      name: pathname,
      pathname,
      params,
      id: computeRouteIdentifier(pathname, params),
    });
  }, [pathname, params]);

  useEffect(() => {
    if (router.navigationRef) {
      for (const callback of initCallbacks) {
        callback();
      }
      setInitCallbacks([]);
    }
  }, [router.navigationRef]);

  return {
    getCurrentNavigationDescriptor: () => {
      const snapshot = store.routeInfoSnapshot();
      return {
        name: snapshot.pathname,
        pathname: snapshot.pathname,
        params: snapshot.params,
        id: computeRouteIdentifier(snapshot.pathname, snapshot.params),
      };
    },
    onRouterInitialization: (fn) => {
      setInitCallbacks((callbacks) => [fn, ...callbacks]);
    },
    requestNavigationChange: ({ pathname, params }) => {
      router.push(pathname, params);
    },
  };
}

global.__RNIDE_register_navigation_plugin &&
  global.__RNIDE_register_navigation_plugin("expo-router", { mainHook: useRouterPluginMainHook });
