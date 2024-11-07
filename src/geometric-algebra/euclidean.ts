export const euclidean = (coords: number | string | string[]) => (
  typeof coords === "number" ? Array.from({ length: coords }) :
  typeof coords === "string" ? coords.split("") :
  coords
).map(() => 1);
