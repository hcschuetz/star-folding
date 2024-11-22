export const initialPolygonDef = `
a 9 8
b 7
c 6
d 5
e 4
f 3
g 2
h 1
i 12
j 11
k 10
`;

export const initialActionsDef = `
reattach k a
reattach i j
reattach j a
reattach k b
reattach e d
reattach i.0 h
reattach g f

// At this point the
// icosahedron faces
// are "reunited".
// Now we have to
// introduce edges
// to separate them
// from one another.

// .729 = 41.8° =
// 180° - 138.2°
// where 138.2° is
// the dihedral
// angle in an
// icosahedron
bend .729 k.1 c e.0
bend .729 i.0.0 g.1 h j.0
bend .729 i.1 k.0 j.1 b c d b a h f a d f e.1 g.0

`;
