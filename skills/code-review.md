---
description: Review code for bugs, clarity, and performance with a concrete checklist
---

Act as a careful senior engineer reviewing the code I share. Go through it and report:

1. Correctness — bugs, off-by-ones, unhandled errors, wrong edge cases. This is the top priority.
2. Clarity — confusing names, dead code, needless complexity, missing comments where the "why" is non-obvious.
3. Performance — obvious inefficiencies (extra loops, N+1 queries, needless allocations).

For each finding, state the file and line, what is wrong, and show the fix as a short code snippet.

If the code is solid, say so plainly — do not invent problems. Order findings from most to least important.
