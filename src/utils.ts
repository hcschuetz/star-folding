

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
  log(`FAILED: ${msg}`);
  throw new Error(msg);
};

export function assert(test: boolean) {
  if (!test) {
    fail("assertion failed");
  }
}

export const getLines = (text: string) => text.trim().split(/\r?\n/).flatMap(line => {
  line = line.trim();
  return line === "" || line.startsWith("//") ? [] : [line];
})
