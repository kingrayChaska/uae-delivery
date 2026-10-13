// For the finance pages' loads: the page shows a "couldn't be loaded"
// message, and the server log says why (e.g. a missing migration's
// "relation … does not exist"), instead of the cause being swallowed.
export const failedLoad =
  (what: string) =>
  (error: unknown): null => {
    console.error(`${what} could not be loaded:`, error instanceof Error ? error.message : error);
    return null;
  };
