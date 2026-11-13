# Task Dependency Graph — pi-agent-core Integration Step A

```mermaid
graph TD
    subgraph P1["Phase 1 · Batch P1-B1 · Issue A0"]
        subgraph P1A["Lane A · Contract lane"]
            A0T1["A0-T1 AGENT_* event protocol golden contract test"]
        end
        subgraph P1B["Lane B · Dependency lane"]
            A0T2["A0-T2 pi-agent-core 0.83.0 pinning and narrow-entry probe"]
        end
    end
    subgraph P2["Phase 2 · Batch P2-B1 · Issue A1"]
        A1T1["A1-T1 StreamFn port definition"]
        A1T2["A1-T2 DeepSeekStreamFn thin adapter implementation"]
        A1T3["A1-T3 Event stream mapping contract and tree-shake tests"]
    end
    subgraph P3["Phase 3 · Batch P3-B1 · Issue A2"]
        A2T1["A2-T1 pi AgentTool to execution surface bridge"]
        A2T2["A2-T2 Result normalization and fail-closed defense"]
        A2T3["A2-T3 Authorization path regression tests"]
    end
    subgraph P4["Phase 4 · Batch P4-B1 · Issue A3"]
        A3T1["A3-T1 pi loop adapter layer and budget mapping"]
        A3T2["A3-T2 Replace runInlineAgentLoop body"]
        A3T3["A3-T3 Dual-track regression and golden alignment"]
    end
    subgraph P5["Phase 5 · Batch P5-B1 · Issue A4"]
        A4T1["A4-T1 Full verification and fixtures sync"]
        A4T2["A4-T2 Governance and documentation wrap-up"]
    end

    A0T1 -.->|regression baseline| A3T3
    A0T2 --> A1T1
    A0T2 --> A2T1
    A1T1 --> A1T2 --> A1T3
    A1T2 --> A3T1
    A2T1 --> A2T2
    A2T1 --> A2T3
    A2T2 --> A3T1
    A3T1 --> A3T2 --> A3T3
    A3T3 --> A4T1 --> A4T2

    P1 --> P2
    P1 --> P3
    P2 --> P4
    P3 --> P4
    P4 --> P5
```

Notes:
- A0-T1 and A0-T2 have no solid-line dependency (parallel lanes); dashed lines are "baseline/verification" relationships (golden is the reference baseline for A3-T3).
- Subgraphs are batch boundaries; solid lines between batches = PR merge order (the next batch starts only after the previous batch merges).
- A3 is strictly sequential internally (single-file replacement of loop.ts, no parallelism).
