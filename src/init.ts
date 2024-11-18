export const initialPolygonDef = `
a 11
b 10
c 10 9
d 9 8
e 7
f 6 6
g 5
h 4 4
i 4 3
j 2 2
k 1 12 12
`;

export const initialActionsDef = `
reattachL b c
reattachL e d
// reattachL e f
reattachL j i
reattachL i k
bend2 + k c d
bend2 + k d f
bend2 + f g h
bend2 + f h i
bend2 + f k a
bend2 + e f i
bend2 + a b e
reattachL j' a
`;
