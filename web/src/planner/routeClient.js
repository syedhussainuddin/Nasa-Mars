export function calculateRouteAsync(start, end, data, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Calculation cancelled.", "AbortError"));
    let worker, deadline;
    const finish = (error, result) => {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(new DOMException("Calculation cancelled.", "AbortError"));
    try {
      worker = new Worker(new URL("../workers/route.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data: result }) => finish(null, result);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(new Error("The route worker could not run. Please reload and try again."));
      };
      signal?.addEventListener("abort", abort, { once: true });
      deadline = setTimeout(() => finish(new Error("Route calculation timed out. Try closer points.")), 30000);
      worker.postMessage({ start, end, grid: data.grid, meta: data.meta });
    } catch {
      finish(new Error("The route worker could not start. Please use a browser with Web Worker support."));
    }
  });
}
