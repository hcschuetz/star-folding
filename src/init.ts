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
reattach b c
reattach e d
bend2 + f g h
bend2 + f h i
bend2 + k c d
reattach j i
//reattach i k
reattach f d
// bend2 + k d e
`;
