export type Example = {
  info: string,
  label?: string,
  setup: string,
  transform: string,
};

const examples: Record<string, Example> = {
thurston_fig_15: {
  label: "Thurston",
  info: `See https://arxiv.org/pdf/math/9801088, Figure 15,
and https://mathstodon.xyz/@johncarlosbaez/113369111554515465`,
  setup:`
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
`,
  transform: `
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
`},

westendorp_icosahedron: {
  label: "Icosahedron",
  info: "See https://mathstodon.xyz/@GerardWestendorp/113374197385229562",
  setup: `
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
`,
  transform: `
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
`,
},

/*
TODO:
- an octahedron as in
  https://mathstodon.xyz/@GerardWestendorp/113379133059049977
  (but that requires configurable heights of the green triangles)
*/
};

export default examples;
