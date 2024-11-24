export type Example = {
  info: string,
  label?: string,
  setup: string,
  transform: string,
};

const examples: Record<string, Example> = {
  thurston: {
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
reattach e d
reattach b c

bend2 + f g h
// This is to demonstrate the
// usage of "bend2". Alternatively
// we could have written
// "bend .5 f g h" and let the
// "contract" operation take care
// of the precise angle.

bend .5 e.1 f d c k a c e.0 b.1
bend .5 i.0 h f
bend .5 i.1 a b.0
bend .5 j.0 h k d h
bend .5 a j.1

contract 100
`,
  },
  icosahedron: {
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
  icosahedron2: {
    info: "Another icosahedron (experimental)",
    setup: `
a 12
b 11
c 10
d 9
e 8
f 7
g 6
h 5
i 4
j 3
k 2 1
    `,
    transform: `
reattach a b
reattach c d
reattach e f
reattach g h
reattach i j
reattach j k

bend .5 a.1 c.0
bend .5 b c.0
bend .5 b d

bend .5 c.1 e.0
bend .5 d e.0
bend .5 d f

bend .5 e.1 g.0
bend .5 f g.0
bend .5 f h

bend .5 g.1 i.0
bend .5 h i.0
bend .5 h j.0

bend .5 i.1 a.0
bend .5 j.1 a.0
bend .5 j.1 b

bend .5 k b
bend .5 k d
bend .5 k f
bend .5 k h

contract 100
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
