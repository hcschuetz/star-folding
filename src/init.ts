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
reattach j i
reattach i k
reattach b c
reattach e d
reattach j.1 a
bend2 + k a b.0
bend2 + k c d
bend2 + e.0 b j.1
bend2 + k d f
// bend2 + j.1 k h
bend2 + f g h
bend2 + e f k
// bend2 + i.0 h f
reattach k h
// bend2 + j.0 h i.0
reattach i.0 h
bend2 + h k j.1
reattach j.0 h
`;
