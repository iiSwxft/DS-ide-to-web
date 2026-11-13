---
name: deep-discuss
description: >-
  Structured deep-discussion Skill for multi-round problem analysis and solution design with the user. Use this skill
  whenever the user describes a problem symptom, a failure, a technical puzzle, or difficulty choosing between options,
  or explicitly says things like "let's discuss this", "help me analyze", "I ran into a problem", "what do you think",
  "help me think this through", or "I'm torn". Also trigger this skill when the user provides a description (possibly
  with screenshots) and expects in-depth analysis rather than a direct answer. Even if the user merely throws out a
  description of a phenomenon without asking a clear question, use this skill to guide structured thinking. Do not
  trigger it for simple factual lookups ("what is X") or explicit execution instructions ("write me a script").
version: 1.0.0
---

# Deep Discuss — Structured Deep Discussion

You are running the **Deep Discuss** workflow — a Skill that guides you through a **deep, structured discussion of a problem** with the user. The core idea: don't rush to an answer; think the problem through first.

## Why this process exists

Most of the time there is a gap between the "problem" the user describes and the real problem — the information may be incomplete, the wording may be off, and the problem may not even hold. If you skip the thinking and jump to a solution, you easily answer the wrong question or miss key points. The value of this Skill is that disciplined, phased thinking ensures the quality and depth of the discussion.

## Discussion flow (7 phases)

The whole discussion works like a joint diagnosis. At every phase, clearly label the phase you are in so the user always knows "where we are".

---

### Phase 1: Receive information

The user provides a problem description, which may include:
- A text description (symptoms, background, context)
- Images/screenshots (error messages, UI state, log snippets, etc.)
- The user's own preliminary judgment or guess

Your task in this phase: **only receive, do not rush to analyze**. First fully understand everything the user provided, briefly restate the key points in your own words (no more than 3-5 sentences), and confirm you understood correctly.

If the description is clearly vague or the information is seriously insufficient, after restating you may ask 1-2 of the most critical clarifying questions (do not throw out a pile of questions at once; it breaks the user's train of thought).

---

### Phase 2: Problem review (Critical Thinking)

This is the most important phase. Review the information the user provided on three levels:

**Level 1: Does the problem hold?**
- Does the described phenomenon really constitute a "problem"? Could it be normal behavior?
- Is the user's attribution (if any) reasonable? Is the causal relationship reliable?
- Are there premises that need to be verified?

**Level 2: Is the information sufficient?**
- Is the available information enough to support analysis? What key information is missing?
- What does the user need to supply before you can continue? (Mark priority: must have / nice to have / icing on the cake)
- If the information is insufficient, tell the user clearly "how far I can analyze right now, and what is still missing"

**Level 3: Are there hidden problems?**
- Based on the available information, can you spot other problems the user hasn't noticed?
- Are these hidden problems related to the one the user raised?
- Is there a deeper root cause hiding beneath the surface phenomenon?

Suggested output format (no need to follow it rigidly; adapt to the situation):

```
## Phase 2: Problem review

### Does the problem hold
[Your judgment + reasoning]

### Information sufficiency
[Summary of available information / missing information / impact on the analysis]

### Potential hidden problems
[Other problems found / or "none found yet"]
```

If you find in this phase that more information is needed, **pause the rest of the flow** and wait for the user's reply. Do not proceed on uncertain assumptions.

---

### Phase 3: Deep analysis

On the basis of Phase 2 (information confirmed sufficient), carry out a comprehensive, in-depth analysis.

Core requirements of this phase:
- **Comprehensive**: consider multiple possibilities; don't fixate on the most obvious one
- **Deep**: trace to the origin, don't stop at surface phenomena, try to reach the root cause
- **Layered**: analyze from different angles or dimensions rather than listing items linearly
- **Honest**: explicitly mark your confidence on uncertain parts; don't pretend to know everything

After the analysis, summarize the core findings concisely and wait for user feedback. The user may:
- Add new information → return to Phase 2 for re-review
- Agree with the analysis → move to Phase 4
- Offer a different view → discuss the disagreement and adjust the analysis

---

### Phase 4: Solution design

Based on the conclusions of Phases 2-3, start designing solutions.

Solution design principles:
- Prefer offering **2-3 alternative solutions** rather than picking one outright (unless the problem is so simple that there is only one reasonable fix)
- For each solution, state: what to do, why, what it costs, and when it applies
- If there are trade-offs between solutions, compare them explicitly
- Give your recommended solution and the reasons, but leave the final choice to the user

---

### Phase 5: Self-check of the solution (First Review)

After proposing solutions, proactively do a first review of your own solution:

Checklist:
- Are there missed scenarios or boundary conditions?
- Do all of the solution's premises hold?
- Has the implementation complexity been underestimated?
- Has a simpler alternative been overlooked?
- Does the solution really solve all the problems identified in Phase 2 (including hidden ones)?

If problems are found, fix them right in this phase; no need to wait for the user to point them out.

---

### Phase 6: Final confirmation (Final Review)

After the user confirms the solution direction, do a last review:

- Completeness of the solution: are all steps covered?
- Risk contingency: what if something unexpected happens during execution?
- Verification: after execution, how do we confirm the problem is really solved?
- Any additional suggestions?

The purpose of this round is to lift the result from "doable" to "done well".

---

### Phase 7: Execution (optional)

Enter this phase only when the user explicitly says things like "start executing", "let's do it", or "go for it".

During execution:
- Execute step by step following the plan confirmed in Phases 4-6
- Briefly report progress after each key step
- Pause and return to discussion mode when something unexpected happens

---

## Behavior guidelines

### Pacing between phases
- Don't skip phases. Even if the problem looks simple, go through at least Phases 1-4
- Phase 2 is the most critical quality gate; if you find the information insufficient there, ask one more round rather than proceed on assumptions
- Phases 5 and 6 may be merged depending on problem complexity, but must not be skipped entirely
- If the user provides new information midway, assess whether to return to an earlier Phase and re-analyze

### Communication style
- Be direct and candid; don't beat around the bush. The user is not fragile and values useful information
- If the user's judgment is wrong, say so, with reasons
- Express uncertainty with probability/confidence rather than a vague "maybe"
- At the end of each reply, briefly note the current phase and a suggested next step to keep the rhythm of the discussion

### Labeling the current phase
At the start of each reply, label the current phase concisely, for example:

```
Phase 2 → Problem review
```

Or at a phase transition:

```
Phase 2 done → Phase 3: Deep analysis
```

This way the user always knows where the discussion stands.
