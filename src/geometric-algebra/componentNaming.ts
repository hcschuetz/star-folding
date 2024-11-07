import { bitList } from "./Algebra";

export function makeLetterNames(
  dims: string | string[],
  options: {scalar?: string} = {},
): string[] {
  const {scalar = "1"} = options;
  const result: string[] = [];
  const multiDims = 1 << dims.length;
  for (let bm = 0; bm < multiDims; bm++) {
    result[bm] = bm ? bitList(bm).map(i => dims[i]).join("") : scalar;
  }
  return result;
}

export function makeNumberedNames(
  nDims: number,
  options: {start?: 0 | 1, scalar?: string} = {},
): string[] {
  const {start = 0, scalar = "1"} = options;
  const result: string[] = [];
  const separator = (start + nDims) <= 10 ? "" : "_";
  const nMultiDims = 1 << nDims;
  for (let bm = 0; bm < nMultiDims; bm++) {
    result[bm] = bm ? "e" + bitList(bm).map(i => start + i).join(separator) : scalar;
  }
  return result;
}
