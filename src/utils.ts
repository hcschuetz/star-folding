

// By default do not log.  (Logging to the console would work, but is slow.)
let logger = (...args: any[]) => {};

export function setLogger(fn: (...args: any[]) => unknown) {
  logger = fn;
}

export function log(...args: any[]) {
  logger(...args);
}

export function fail(msg: string): never {
  // debugger;
  throw new Error(msg);
};

export function assert(test: boolean) {
  if (!test) {
    debugger;
    fail("assertion failed");
  }
}
