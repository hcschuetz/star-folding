export type Example = {
  info: string,
  label?: string,
  setup: string,
  transform: string,
};

const examples: Record<string, Example> = {
  thurston_fig_15: {
    label: "Thurston",
    info: `From https://arxiv.org/pdf/math/9801088, Figure 15;
see also https://mathstodon.xyz/@johncarlosbaez/113369111554515465`,
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
reattach k h
reattach i.0 h
reattach j.0 h

bend .5 b.0 a i.1
bend .5 k c d f g h i.0
bend .5 f h d
bend .5 b.1 e.0
bend .5 h k d
bend .5 c e.0
bend .5 c a k
bend .5 e.1 f
bend .5 g j.0.0
bend .5 b.0 j.1.1

optimize 100
`},
  icosahedron: {
    label: "Icosahedron",
    info: "From https://mathstodon.xyz/@GerardWestendorp/113374197385229562",
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

// At this point the icosahedron
// faces are "reunited".
// Now add edges to separate
// them from one another.

// The dihedral angle in an
// icosahedron is 138.2°.
// Thus the bending angle is
// 180°-138.2° = 41.8° = 0.729 rad
// (Use a slightly smaller bending
// angle such as 0.68 to see a
// "sliced icosahedron".)
bend .729 k.1 c
bend .729 c e.0
bend .729 b c
bend .729 c d

bend .729 g.1 i.0.0
bend .729 g.1 h
bend .729 h j.0
bend .729 h a
bend .729 f h

bend .729 i.1 k.0
bend .729 j.1 k.0
bend .729 j.1 b
bend .729 a b
bend .729 e.1 g.0
bend .729 e.1 f
bend .729 d f

bend .729 b d
bend .729 f a
bend .729 a d
`,
},
  empty: {
    info: `Define your own star and folding.`,
    setup: "a",
    transform: "",
  },

/*
TODO:
- an octahedron as in
  https://mathstodon.xyz/@GerardWestendorp/113379133059049977
  (but that requires configurable heights of the green triangles)
*/
};

export default examples;
