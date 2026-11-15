import { planRoute } from "../routing/planRoute.js";

// Calls the data team's implementation unchanged, off the UI thread.
self.onmessage = ({ data: { start, end, grid, meta } }) => {
  try {
    self.postMessage(planRoute(start, end, grid, meta));
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The route could not be calculated." });
  }
};
