

// By default do not log.  (Logging to the console would work, but is slow.)
let logger = (...args: any[]) => {};

export function setLogger(fn: (...args: any[]) => unknown) {
  logger = fn;
}

export function log(...args: any[]) {
  logger(...args);
}

export function fail(msg: string): never {
  throw new Error(msg);
};

export function assert(test: boolean) {
  if (!test) {
    fail("assertion failed");
  }
}

export const getLines = (text: string) => text.trim().split(/\n|\r\n?/).flatMap(line => {
  line = line.trim();
  return line === "" || line.startsWith("//") ? [] : [line];
})


export function choose<T>(objects: T[], n: number) {
  const result: T[][] = [];
  function recur(start: number, collected: T[]) {
    if (collected.length === n) {
      result.push(collected);
    } else {
      const limit = objects.length - (n - collected.length);
      for (let i = start; i <= limit; i++) {
        recur(i + 1, [...collected, objects[i]]);
      }
    }
  }
  recur(0, []);
  return result;
}

export const count = (iter: IteratorObject<any>): number =>
  iter.reduce(n => n+1, 0);

export const findUnique = <T>(iter: Iterable<T>, pred: (t: T) => boolean): T => {
  let found = false;
  let value: T;
  for (let el of iter) {
    if (pred(el)) {
      assert(!found);
      found = true;
      value = el;
    }
  }
  assert(found);
  return value;
}