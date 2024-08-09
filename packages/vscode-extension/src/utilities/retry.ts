export async function retry<T>(fn: () => Promise<T>, retriesLeft = 5, interval = 1000): Promise<T> {
  try {
    const val = await fn();
    return val;
  } catch (error) {
    if (retriesLeft) {
      await new Promise((r) => setTimeout(r, interval));
      return retry(fn, retriesLeft - 1, interval);
    } else {
      throw error;
    }
  }
}
