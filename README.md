Folding a Star to a Polyhedron
==============================

See https://mathstodon.xyz/@johncarlosbaez/113369111554515465
and https://arxiv.org/pdf/math/9801088, p.540.


Instruction Format
------------------

The star shape and the folding of the star are configured by text instructions.
The syntax is described here.

Lines starting with "#" are comments.  These lines and empty lines are ignored.
Otherwise each line will contain an instruction.
(From now on I will refer to lines of text as "instructions" and reserve the
word "line" for geometric lines to avoid confusion.)

The shape of the outer n-gon is given by one instruction per edge.
(I have not hard-wired that it n must be 11.)
Each instruction consists of
- a unique edge name (which will also be used for the corresponding
  inner vertex of the star) and
- one or more steps, which are given as clock-dial directions.
Steps in even clock-dial directions go one unit whereas steps in odd
clock-dial directions go sqrt(3) units.
This ensures that each step ends at a grid point.

Here is code for the example from the references above.  We start at the
top vertex and proceed in clockwise direction:

    a 3 4
    b 4
    c 5
    d 6 6 7
    e 8 8
    f 9 10
    g 10 10
    h 11
    i 12 12
    j 1
    k 2 3
    .

The dot indicates that the outer n-gon is complete.  We should have returned
to the initial vertex.  Each angle at an n-gon vertex should be

- $< 180°$ so that the n-gon is convex and
- $> 120°$ so that the yellow triangles will not overlap.

(What happens with angles $= 120°$ or $\ge 180°$ ?)

Now we fold the star.  Each folding instruction consists of 3 edge names.
An instruction "x y z" says that lines

- from the inner vertex x to the inner vertex y and
- from the inner vertex y to the inner vertex z

will be bent in such a way that the gap at vertex y is closed.
(Remember that the names of the outer edges are used to identify the
corresponding inner vertices of the star.)

    a b c
    d e f
    i j k
    # ... more folding instructions to come here

Notice that after a folding step it may happen that a gap is closed with a
dihedral angle of 180° between the newly adjacent faces.  In this case the
faces are merged into a single face.  Later steps may use lines across the
merged face (crossing the former gap) for folding.
