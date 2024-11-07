const A = "A".charCodeAt(0);

/**
 * Convert a number to a letter sequence like a column name in a spreadsheet.
 * (But in constrast to spreadsheets this is 0-based, i.e. "A" stands for 0,
 * not for 1.)
 */
export default function alphabetic(n: number): string {
  let len = 1;
  let pow26 = 26;
  while (n >= pow26) {
    n -= pow26;
    pow26 *= 26;
    len++;
  }
  let result = "";
  for (let i = 0; i < len; i++) {
    const rest = n % 26;
    result = String.fromCharCode(A + rest) + result;
    n = (n - rest) / 26;
  }
  return result;
}

// for (const n of [
//   0,
//   26 - 1, 26, 26*2, 26*2 + 1, 26*2 + 25, 26*3,
//   26 + 26*26 - 1, 26 + 26*26,
//   26 + 26*26 + 26*26*26 - 1, 26 + 26*26 + 26*26*26,
// ]) console.log(n, alphabetic(n));

// for (let n = 0; n < 60; n++) console.log(n, alphabetic(n));
// for (let n = 26 + 26*26 - 5; n < 26 + 26*26 + 30; n++) console.log(n, alphabetic(n));
// for (let n = 26 + 26*26 + 26*26*26 - 5; n < 26 + 26*26 + 26*26*26 + 30; n++) console.log(n, alphabetic(n));
