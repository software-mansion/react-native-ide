export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: [...Parameters<T>, force?: boolean]) => ReturnType<T> {
  let timeout: NodeJS.Timeout | null = null;
  let recentArgs: any;

  return function (...args: any) {
    const force = args[args.length - 1] === true; // Check if the last argument is true (force flag)

    if (force) {
      if (timeout != null) {
        clearTimeout(timeout);
      }
      timeout = null;
      func(...args);
      return;
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        func(...recentArgs);
        recentArgs = null;
      }, limitMs);
    }
    recentArgs = args;
  } as T;
}
