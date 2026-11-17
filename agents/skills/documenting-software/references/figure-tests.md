# Figure tests

Load this file only when the set has figures: a diagram, a state list drawn as a figure, a concept-relation
map or an enforcement-boundary figure. A set without figures does not need it.

Run the four tests on every figure in the final draft, before the density table is reported. Record each
figure in the table's figure column as its count and the failing test letters, for example `2 (c)`; `2 (ok)`
means both pass.

The four figure kinds are covered by the same tests:

- **Wiring or flow**: components and the calls or data between them.
- **State or sequence**: states and transitions, or ordered steps.
- **Concept relations**: which concept contains, depends on or refines which. Boxes are concepts, edges are relations.
- **Enforcement boundary**: which rules a checker, gate or runtime enforces, and which are only documented. Draw the
  enforcing mechanism on one side of a line and the documented-only rules outside it.

## (a) Figure-only reader test

A reader of the page title, the two-sentence conclusion and this one figure can state the page's claim.

Procedure:

1. Take only the title, the conclusion and the figure. Hide the rest of the page.
2. Ask a reader to state the page's claim in one sentence. With no reader available, write the answer
   blind, as if one had never seen the page's body.
3. Pass when the statement matches the claim. Fail when it names only the topic, a different claim, or nothing.

Repair: move the claim into the conclusion, or redraw the figure so that the relation the claim rests on is
visible. Do not add prose beside the figure to rescue it.

Example. A page claims that a write is rejected before it reaches storage. Its figure shows three boxes,
"Gateway", "Core" and "Store", joined by arrows. A reader can say that data passes through three components,
but not that a write is rejected. Fail. Redraw with the rejection edge shown, and state the claim in the conclusion.

## (b) Headings follow the figure

On a page with a figure, each heading names a part of that figure: a box, an edge, a state or a boundary.

Procedure:

1. List the figure's parts.
2. List the page's headings.
3. Map each heading to a part. A heading with no part is a finding: move the section or drop the heading.
4. A part that the text explains but no heading covers is also a finding.

Example. A figure with states `Draft → Review → Published`. The headings "Draft", "Review" and "Publication"
map to parts and pass. "Background" and "Design goals" map to nothing and fail.

## (c) No figure is drawn twice in the set

Compare the figures across pages by content: the same nodes and edges, or the same relation under another
drawing. Keep one drawing on the page that owns the mechanism. Other pages link to it with a meaningful link
label and do not redraw it.

Fail: the same wiring diagram on three pages. Repair: keep the owner's drawing, replace the other two with a link.

## (d) Box and edge labels use the reader's words

Labels name the thing the way the reader would. Internal IDs, file names, module keys and table names are not
labels. An ID may appear in a traceability field, never as a box or edge label.

Procedure: read each label as a reader who has only the glossary would. A label that the glossary does not define
for that reader, or that only the author recognizes, fails.

Example. The label `CFG-7 resolver` fails. `Settings lookup` passes, provided the page or glossary defines it.
