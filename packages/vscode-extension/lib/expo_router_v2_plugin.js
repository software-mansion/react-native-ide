import { useSyncExternalStore, useEffect } from "react";
import { useRouter } from "expo-router";
import { store } from "expo-router/src/global-state/router-store";

function computeRouteIdentifier(pathname, params) {
  return pathname + JSON.stringify(params);
}

function useRouterPluginMainHook({ onNavigationChange }) {
  const router = useRouter();
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

  function requestNavigationChange({ pathname, params }) {
    router.push(pathname);
    router.setParams(params);
  }

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
    requestNavigationChange: (navigationDescriptor) => {
      if (store.navigationRef?.isReady()) {
        requestNavigationChange(navigationDescriptor);
      } else {
        const onReady = () => {
          requestNavigationChange(navigationDescriptor);
          store.navigationRef?.removeListener("state", onReady);
        };
        store.navigationRef?.addListener("state", onReady);
      }
    },
  };
}

global.__RNIDE_register_navigation_plugin &&
  global.__RNIDE_register_navigation_plugin("expo-router", { mainHook: useRouterPluginMainHook });
