import { useSyncExternalStore, useEffect } from "react";
import { useRouter } from "expo-router";
import { store } from "expo-router/src/global-state/router-store";

function computeRouteIdentifier(pathname, params) {
  return pathname + JSON.stringify(params);
}

let navigationRoute = undefined;
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
    router.push(pathname, params);
  }

  useEffect(() => {
    function onReady(_state) {
      if (navigationRoute && store.navigationRef?.isReady()) {
        requestNavigationChange(navigationRoute);
        navigationRoute = undefined;

        store.navigationRef.removeListener("state", onReady);
      }
    }
    store.navigationRef?.addListener("state", onReady);
    return () => store.navigationRef?.removeListener("state", onReady);
  }, [store.navigationRef?.current]);

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
        navigationRoute = navigationDescriptor;
      }
    },
  };
}

global.__RNIDE_register_navigation_plugin &&
  global.__RNIDE_register_navigation_plugin("expo-router", { mainHook: useRouterPluginMainHook });
