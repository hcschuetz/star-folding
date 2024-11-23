Folding a Star to a Polyhedron
==============================

This repository is about folding certain flat stars into polyhedra.
See <a href="https://johncarlosbaez.wordpress.com/2024/10/30/triangulations-of-the-sphere-part-2/" target="_blank">here</a>
(and <a href="https://arxiv.org/pdf/math/9801088" target="_blank">here</a>)
for a description of the task.

The application can be found
<a href="https://hcschuetz.github.io/star-folding/dist/" target="_blank">here</a>.
This README file explains how to use that page.

Selecting an Example
--------------------

Examples are provided in the first menu of the page
to make the explanations here easier to understand
and as a starting point for your own experimentation.

Some information about the examples can be opened by clicking the following line.


Defining the Star
-----------------

The first input box on the page allows to define the star shape.
Actually it defines the polyhedron around the star tips.
The inner vertices of the star are computed automatically.
(The term "inner vertex" refers to an inward-pointing vertex on the
star boundary, not a vertex somewhere inside the manifold.)

*Hint: To see the star before it is folded,
select "1. initialize" in the step menu below the input boxes.*

The syntax is like this:
Each line (which is neither empty nor starting with `//`)
contains an edge name and a list of "steps".
Each step is given as a number from 1 to 12 corresponding to the
directions on a clock dial.
(If you don't know what a clock dial looks like, ask a boomer.)

Even numbers go 1 unit in the respective direction.
Odd numbers go $\sqrt3$ units in the respective direction so that
we will land on a grid point again.
(I'm following Thurston's grid layout with lines in the even clock
directions, even though Baez' grid layout with lines in the odd clock
directions fits with Eisenstein integers in a complex plane
where the real axis is drawn horizontally as usual.)

The setup of the "Thurston" example creates the star given in the
<a href="https://arxiv.org/pdf/math/9801088" target="_blank">Thurston paper</a>
at the top of page 540 (= page 30 of the PDF):

- Starting at the rightmost point, we define edge `a` as $\sqrt3$ units in the
  "11 o'clock" direction.
- Edge `b` goes 1 unit in the "10 o'clock" direction.
- Edge `c` goes 1 unit in the "10 o'clock" direction and $\sqrt3$ units in the "9 o'clock" direction.
- ...
- Finally, edge `k` goes $\sqrt3$ units in the "1 o'clock" direction and
  2 units in the "12 o'clock" direction, closing the loop.

The edge names will be used as the names of the corresponding inner
vertices of the star.  From now on we do not care anymore about the
outer polygon.


Bending the Star into a Polygon
-------------------------------

Now for the folding operations in the second input box.
The following operations are supported
(one operation per line unless a line is empty or starts with `//`).


### `bend`

A very low-level operation is to split a face by introducing a new edge and to
bend the edge by some amount.  `bend 1.2 a b` creates a new edge between
vertices a and b (which should be adjacent to the boundary and to a
common face).  The edge is bent by 1.2 radians (in one direction; if you
want to bend in the other direction, use `-1.2`).  That is, the dihedral
angle between the two new faces is $\pi - 1.2$.

The operation rotates the part of the manifold to the right of the new edge `ab`.
If you want to rotate the other part, write `bend 1.2 b a`.

For convenience you can write `bend 1.2 a b c a d`, which introduces
edges from `a` to `b`, from `b` to `c`, from `c` to `a`, and from `a` to `d`,
each bent by the same angle.
(And it's not necessary that all the listed vertices are adjacent to a single
face.  It suffices if two subsequent vertices in the list share a face.)

The primary disadvantage of this operation is that you have to know
the bending angle in advance.  We would rather describe only the
topology (between which vertices to insert new edges)
and to let the computer figure out the angles automatically.


### `bend2`

One such operation is to select three inner vertices $P$, $Q$, and $R$ and
to bend the manifold around two new edges along the line segments $PQ$ and $QR$.
The bending angles are computed automatically so that
the two neighbors of $Q$ along the boundary will coincide.
(It is, however, not always possible to achieve this.
In this case the operation fails.)

In more detail: 
- $P$, $Q$, and $R$ are expected to be on the boundary of our current manifold.
  The line segments $PQ$ and $QR$ should be
  proper diagonals of faces in our manifold.
  ($PQ$ and $QR$ may be in the same face or in different ones.)
- Let $P'$ and $R'$ be the neighbors of $Q$ along the boundary
  towards $P$ and $R$, respectively.
- The two edges $PQ$ and $QR$ divide our manifold into three parts:
  - one part (including vertex $P'$) adjacent to $PQ$ but not to $QR$,
  - one part adjacent to both $PQ$ and $QR$, and
  - one part (including $R'$) adjacent to $QR$ but not to $PQ$,

  All three parts are rigid.
  The first part is rotated around $PQ$ and
  the third part is rotated around $QR$
  until $P'$ and $R'$ coincide at some point $Q'$.

- So apparently $Q'$ must satisfy these conditions:
  1. $dist(P, Q') = dist(P, P')$
  2. $dist(Q, Q') = dist(Q, P')$
  3. $dist(Q, Q') = dist(Q, R')$
  4. $dist(R, Q') = dist(R, R')$

  By construction the conditions ii and iii can be expected to be equivalent.
  So we are left with three sphere equations.
- The three spheres should intersect at one or two common points.
  (If they don't, the operation fails.)
  We select one of the points as our $Q'$.
- The two former boundary edges $P'Q$ and $QR'$ are merged into a single
  non-boundary edge $QQ'$.
- It may happen (not in the first folding step, but possibly later)
  that the two faces adjacent to $QQ'$ are in the same plane.
  In this case the edge $QQ'$ is dropped and the two faces are merged.
  The purpose of this merger is that the merged face provides additional
  diagonals that can be used in subsequent operations.

All this is implemented as the operation `bend2`.
It takes a `+` or `-` as its first argument
to select one intersection point or the other
(Most of the time just use `+`.)
and then three names of inner star vertices $P$, $Q$, and $R$.


### `reattach`

Unfortunately it turns out that after a few `bend2` operations we
get stuck without having reached a polyhedron.
We can advance a bit more if we re-arrange pieces of the star.
For example we can cut the star at edge `bc` and then paste the snippet
to the rest of the star again in such a way that the two boundary
edges adjacent to `c` will coincide.
The snippet is essentially rotated around c as far as needed so that
the two neighbors of `c` along the boundary will coincide.
This operation is written as `reattach b c`.

After a reattach operation there are new diagonals,
which can be used in subsequent bending operations.

In more detail:
- `reattach` expects two vertices $P$ and $Q$ which are
  - on the manifold boundary and
  - adjacent to a common face.
- It cuts $P$ and the face along the line segment $PQ$.
  This cuts the manifold into two pieces that are only connected at vertex $Q$.
  Two new boundary edges are introduced.
  Now glue the two pieces together at the two "old" boundary edges
  adjacent to $Q$.
- To get the geometry right again, one of the pieces needs to be rotated
  around $Q$.
  The implementation moves the smaller piece, which makes the operation
  easier to follow in the display.
- The rotation is done in such a way that
  - the glued edges align and
  - the two faces adjacent to the glued edges
    (which may or may not be the fragments of the initial face)
    are in a common plane.
- The two faces are merged into a single one.


### `optimize`

`bend2` is a constraint-solving operation finding two bending angles
simultaneously such that two edges will align.
But we need solvers for more complex constraints.
It might even be impossible to solve the entire constraint problem as a
sequence of "local" constraint-solving steps.

The `optimize` operation approximates a solution of the global
constraint problem iteratively.
The constraints are:
- Edges should keep their lengths.
- Faces should keep their shape.
  (That is, faces should stay flat and
  angles between edges should be preserved.)
- The star tips should coincide.
- Vertices that have been replicated by `reattach` operations
  should coincide.

Actually the current implementation of `optimize` does not take care
of faces and angles.  To avoid this problem, the manifold should be fully
triangulated (using `bend` and `bend2`) before calling `optimize`.

The current implementation is very simplistic but apparently sufficient.
(The iterative approximation could probably be made to converge much
faster.)

`optimize` takes one argument, namely the number of iterations.


Output
------

To execute the operations, click the "run" button.

Then you can select the step after which you want to see the manifold.
Initially the last attempted (successful or failed) step is selected
because that's what you are probably most interested in.
(The step menu automatically gets the UI focus,
so that you can just use the up and down arrow keys of your keyboard
to navigate over the steps.)

There are also a few options to customize the view.

You can use your mouse or touch device
to zoom and to rotate the camera around the manifold.
(For details see
<a href="https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction#arc-rotate-camera"
target="_blank">here</a>.)
To scroll the entire page,
move the mouse pointer out of the graphics canvas first.

Below the graphic output the steps are listed again.
Clicking a step opens/closes a bunch of log messages.
These are intended for myself during development
but some of them might be helpful for you as well.
For example an exception mentioning a "negative discriminant"
indicates that a quadradic equation could not be solved.
This means that some spheres or circles do not intersect as expected.

Operations may fail due to unmet preconditions
(or due to implementation bugs).
Unfortunately many error messages are not yet very helpful.
(Better error reporting should be implemented.)
But at least it is clarified which step was the first one
to have a problem.


### Peers

For each edge of the initial star it is obvious to which other edge
it will be aligned/merged in a properly folded polyhedron.
We say that two such edges are each other's "peers".

You can check one of the checkboxes to display the pairs of peers in the
graphic output.

The operations `bend2` and `reattach` make sure that they will only merge peers.
Furthermore `reattach` declares the two new boundary edges created by
cutting a face to be each other's peers
so that they can be merged again in a later step.
