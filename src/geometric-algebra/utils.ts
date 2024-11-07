import { Multivector } from "./Algebra";

export const TAU = 2 * Math.PI;
export const deg = (x: number, p?: number) => `${(x * (360 / TAU)).toFixed(p)}°`;

export const p = console.log;

type Loggable<T> = Multivector<T> | number | string | undefined;

export const q_ = (
  coords: string,
  write: (text: string) => void = console.log,
) => <T>(
  label: string,
  x: Loggable<T>,
) => {
  switch (typeof x) {
    case "undefined":
    case "string":
      write(label + " = " + x);
      return;
    case "number":
      write(label + " = " + x.toFixed(8).replace(/\.?0*$/, ""));
      return;
    default:
      write(
        label + " ="
        + (x.knownSqNorm === 1 ? " [unit]" :
           x.knownSqNorm !== undefined ? ` [${x.knownSqNorm}]` :
           ""
          )
        + ([...x].every(([, x]) => x === 0) ? " [zero]" :
           [...x].every(([, x]) => typeof x === "number" && Math.abs(x) < 1e-8) ? " [~zero]" :
           ""
          )
      );
      for (const [bm, val] of x) {
        write(`  ${
          coords.split("").map((c, i) => (1 << i) & bm ? c : "_").join("")
        }: ${
          typeof val === "number"
          ? val.toFixed(8).replace(/^(?!-)/, "+").replace(/\.?0*$/, "")
          : val
        }`);
      }
    }
}

export const log_ = (
  coords: string,
  write?: (text: string) => void,
) => {
  const q = q_(coords, write);
  return <T>(
    obj: Record<string,  Loggable<T>>
  ) => {
    for (const [k, v] of Object.entries(obj)) {
      q(k, v);
    }
  };
};


export const mapEntries = <K extends string, T, U>(
  obj: Record<K, T>,
  fn: (arg: T, name: K, o: typeof obj) => U,
): Record<K, U> =>
  // Type casts are needed since the declarations of Object.entries(...)
  // and Object.fromEntries(...) do not preserve specialized key types.
  Object.fromEntries(
    Object.entries<T>(obj).map(([k, v]) => [k, fn(v, k as K, obj)])
  ) as Record<K, U>;
