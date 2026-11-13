# DeepSeek++ Module Inventory

## Scope and Rating

This inventory is based on the 2026-07-13 PC-only refactor mainline, excluding `node_modules/`, `dist/`, `docs/archives/`, and generated assets. The roughly 1.1 MB of bundled Skill docs in `core/skill/*-official/` are recorded as resources and are not counted in TypeScript LOC. The Android support surface has been deleted and is no longer within the compatibility scope.

S.U.P.E.R scoring: 🟢 compliant; 🟡 partially compliant; 🔴 clearly violating or costly to replace. The format is `S/U/P/E/R`: Single Purpose, Unidirectional Flow, Ports over Implementation, Environment-Agnostic, Replaceable Parts.

## Core Module Inventory

| Module | Responsibility / Public Surface | Main Dependencies and Boundary | Files / LOC | Complexity | S.U.P.E.R |
|:--|:--|:--|--:|:--|:--|
| Core root (`types`, `constants`, `messaging`, `version`, `whats-new`) | Cross-domain types/barrel, prompt constants, runtime messaging, version update state | Depended on by many domains, while also importing prompt/tool/MCP/platform implementations in reverse | 5 / ~860 | High | S🔴 U🔴 P🟡 E🔴 R🔴 |
| `artifact` | Artifact tool, ZIP, exact codec, single IndexedDB truth; `saveArtifact`, `getArtifact(s)`, `executeArtifactToolCall` | Dexie; Chrome storage only as a one-time legacy migration input; tool/i18n | 6 / 893 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `automation` | Schedule, execution context, runner, durable run lease, conservative retry/timeout, runtime request codec; `runAutomation`, `runDeepSeekAutomation` | Scheduler injects the executor; runner depends on the narrow `DeepSeekAutomationClient`/prompt/tool-loop; store depends on Chrome storage | 10 / 2,819 | High | S🟢 U🟢 P🟢 E🔴 R🟢 |
| `background` | Background image configuration normalize/store | Chrome storage, root types | 2 / 43 | Low | S🟢 U🟢 P🟡 E🔴 R🔴 |
| `browser` | Context-invalidated safe proxy for WXT/browser | `browser` / `chrome` globals | 1 / 68 | Low | S🟢 U🟢 P🟡 E🟢 R🟢 |
| `browser-control` | CDP connection, tab/snapshot/actions, tool provider; `BrowserControlService` | Chrome debugger/tabs, tool, platform, storage; the Side Panel response codec reuses the core boundary | 8 / 2,023 | High | S🟡 U🟡 P🟢 E🔴 R🟡 |
| `chat` | Chat enable, API key, official config contract, active-loop marker, pending-text mailbox | Chrome local/session storage; pending text uses a single typed slot/controller | 6 / 260 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `deepseek` | Pure route/request/SSE codecs, active Web client, PoW/upload/history, Official API, export transport | Codecs are environment-independent; the active client composes injected fetch policy, Chrome storage/page localStorage, and WASM; old adapter/parser paths are kept only as compatibility re-exports | 11 / 2,488 | High | S🟡 U🟢 P🟢 E🟡 R🟢 |
| `export` | Conversation schema/normalize/attachments/sanitize/HTML/MD/PDF; `ConversationExportTransport`, `runConversationExport` | Explicit transport port; mostly pure functions | 11 / 1,600 | Medium | S🟢 U🟢 P🟢 E🟢 R🟢 |
| `floating-chat` | Floating chat enable store and runtime state machine | Chrome storage + browser permission/runtime state; `disabled / missing-permission / ready / invalidated` are projected from a single pure state model | 2 / 46 | Low | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `i18n` | Typed locale keys, translator, resources, preference store | Chrome storage; bilingual resources and audit are fairly complete | 5 / 3,193 | Medium | S🟢 U🟢 P🟢 E🟡 R🟡 |
| `inline-agent` | Continuation loop, prompt, markdown, renderer, trace codec/store/types | DeepSeek, interceptor, tool-loop, DOM UI; trace storage goes through a single codec/repository | 8 / 1,423 | High | S🟡 U🟡 P🟢 E🔴 R🟡 |
| `interceptor` | Fetch/XHR/IDB hooks, SSE/tool parsing, history cleanup, token speed | prompt, memory, skill, inline-agent, tool; modifies browser prototypes | 9 / 3,203 | Critical | S🔴 U🔴 P🟡 E🔴 R🔴 |
| `mcp` | MCP client/discovery/store and HTTP/SSE/bridge/native transports | JSON-RPC port is clear; permission/header/store are coupled to the Chrome implementation | 13 / 2,414 | High | S🟢 U🟡 P🟢 E🟡 R🟢 |
| `memory` | Sole codec, Dexie migrations/repository, atomic import, scope, selector, injector/tool | Dexie, root types, prompt/i18n, shared persistence lock; local/sync/import/UI reuse the same codec | 8 / 829 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `messaging/` | MAIN/content bridge envelope validation, single runtime command ownership/typed contracts, full payload codecs, runtime broadcast helper | R4.1–R4.4 brought all 121 receiver commands into the typed registry; all 80 payload-bearing commands are decoded at the receiving boundary; bridge disconnect is the only additive lifecycle handshake, and runtime failure/error projection has only one core authority | 17 / 3,433 | High | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `model` | Model type preference store | Chrome storage | 1 / 20 | Low | S🟢 U🟢 P🟡 E🔴 R🔴 |
| `multimodal` | Media policy, settings, MCP preset/contracts | MCP, tool, Chrome storage, external host package | 5 / 477 | Medium | S🟢 U🟡 P🟢 E🔴 R🟡 |
| `network` | Caller cancellation/deadline composition, injected fetch, UTF-8 request/response budget, late-response cleanup; `createAbortScope`, `fetchWithNetworkPolicy` | Standard Fetch/Streams/Abort APIs, no dependency on domain modules or `AbortSignal.any` | 2 / 314 | Medium | S🟢 U🟢 P🟢 E🟢 R🟢 |
| `pet` | Pet config, lines, store | i18n, Chrome storage | 3 / 134 | Low | S🟢 U🟢 P🟡 E🔴 R🟡 |
| `persistence` | Sync-owned serialization/recovery, versioned repository/storage slot, coalescing mutation queue | FIFO/repository/coalescer depend on narrow ports; Chrome slot remains the browser adapter and only eligible stores consume the coalescer | 5 / 199 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `platform` | 15-key capability matrix, optional Chrome API reader, Native/MCP gating | R3.9 deleted the zero-consumer broad services facade; 67 core/entrypoint TypeScript files still use `chrome.*` directly, and narrow ports will be introduced later only along with real consumers | 4 / 160 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `preset` | Prompt preset CRUD | Chrome storage, root types, shared persistence lock | 1 / 74 | Low | S🟢 U🟢 P🟡 E🔴 R🔴 |
| `project` | Project/conversation binding, lossless v1→v2 codec, pending context, journaled Project/Memory cascade | Versioned repository, Memory store, shared persistence/recovery lock; local/sync/UI reuse a single codec | 5 / 649 | Medium | S🟢 U🟢 P🟢 E🔴 R🟢 |
| `prompt` | Prompt augmentation, settings, visible marker | memory/tool/shell/i18n; settings depend on root constants in reverse | 4 / 427 | Medium | S🟢 U🟡 P🟢 E🟡 R🟡 |
| `sandbox` | Tool contract, Worker/Pyodide execution, types | tool/i18n; the same request is validated repeatedly across multiple layers | 5 / 493 | Medium | S🟢 U🟡 P🟡 E🟡 R🟡 |
| `saved-items` | Saved prompt/bookmark CRUD, legacy/versionless/v1 exact codec | Versioned repository, shared persistence lock; local/sync/UI reuse a single codec | 4 / 241 | Low | S🟢 U🟢 P🟢 E🔴 R🟢 |
| `scenario` | Context-menu scenario CRUD/template application, released bare-array codec | Versioned repository, shared persistence lock; Background is the cross-MV3-realm mutation authority, and the old payload-less refresh remains compatible | 3 / 212 | Low | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `shell` | Shell MCP names/spec/policy/preset contract | Pure data/policy, serializable | 3 / 196 | Low | S🟢 U🟢 P🟢 E🟢 R🟢 |
| `skill` | Built-ins, registry, GitHub/local import, creator tool, lazy bundled resources | Chrome storage, fetch/GitHub, MCP, Shell, shared persistence lock; the bundled manifest/loader reads only the target resource on demand | 12 / 3,897 + resources | High | S🟡 U🟡 P🟢 E🟡 R🟢 |
| `sync` | Config, snapshot, generation, schema, OAuth, WebDAV/GDrive/OneDrive backends, local staged apply/recovery | The remote `StorageBackend` and local state/journal ports both have production consumers; provider factory, generation pipeline, pure apply coordinator, browser/Dexie adapters, and retryable recovery barrier are separated | 18 / 2,152 | High | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `theme` | DeepSeek theme store | Chrome storage | 1 / 16 | Low | S🟢 U🟢 P🟡 E🔴 R🔴 |
| `token` | Rough token estimation | Pure functions | 1 / 13 | Low | S🟢 U🟢 P🟢 E🟢 R🟢 |
| `tool` | Tool types/catalog/runtime/restore/history, execution-block codec/store, built-in providers | Depends on artifact/browser-control/MCP/memory/project/skill; provider dispatch is still centralized, and UI restore storage has converged on a single codec/repository | 24 / 3,841 | Critical | S🔴 U🟡 P🟡 E🔴 R🟡 |
| `tool-loop` | Generic continuation loop; `runToolContinuationLoop` | Callback ports, serializable records | 1 / 88 | Low | S🟢 U🟢 P🟢 E🟢 R🟢 |
| `ui` | Injected UI, skill popup, tool result renderer registry | DOM, artifact/i18n; the renderer registry is replaceable | 5 / 1,389 | High | S🟡 U🟢 P🟢 E🔴 R🟢 |
| `usage` | Usage input codec, aggregate, store | Codec/stats are pure; the released whole-array storage is coalesced by a store-local queue for adjacent unobserved writes | 7 / 785 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `voice` | Voice settings/capability detection | Web Speech, Chrome storage | 1 / 58 | Low | S🟢 U🟢 P🟢 E🟡 R🟡 |

`core/developer/` is currently empty and does not constitute a module. `packages/multimodal-mcp/` is also an empty local directory; the actual multimodal MCP is installed via an external npm package.

## Entrypoint, Native, and Build Modules

| Module | Responsibility / Public Surface | Main Issue | Size | Complexity | S.U.P.E.R |
|:--|:--|:--|--:|:--|:--|
| `entrypoints/background.ts` + background handlers | MV3 bootstrap, single 121-command registry, automation/sync/tool/sandbox composition and lifecycle | All 121 commands use typed handlers; auth, multimodal, chat, export, usage, sync, automation, and scenario all go through injected handlers/services and receiving codecs, and the old switch has been deleted | 1,411 root LOC + 28 extracted handler/service/composition modules | High | S🟡 U🟢 P🟡 E🟡 R🟢 |
| `entrypoints/content.ts` + content controllers/adapters | DeepSeek DOM capability composition, tool/agent UI, export, multimodal, theme, pet, history/project | A single lifecycle kernel owns the controller epoch and the listener/observer/timer/root/port ledger; bridge, navigation, mutation hub, and codec/store have been split out, while the root file still retains considerable DOM/domain composition | 7,417 root + 4,164 content-module LOC | Critical | S🟡 U🟡 P🟡 E🔴 R🟡 |
| `entrypoints/main-world.content.ts` + controllers | MAIN hook/bridge/navigation composition | Root reduced to 89 LOC; fetch/navigation patches are owned by idempotent controllers and lifecycle scopes; restarting either bridge world alone explicitly releases the old Port, revokes the old runtime state, and re-handshakes | 89 root + 427 controller LOC | High | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `entrypoints/floating-chat.content.ts` + launcher lifecycle | Site-wide launcher startup | `<all_urls>` permission, context invalidation, BFCache, and DOM/drag cleanup are owned by the four-state model and idempotent start/stop | 22 root + 220 adapter LOC | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `entrypoints/sidepanel/` | React UI, lazy pages, typed runtime client, domain controllers | Pages no longer send runtime requests directly; MCP/Tools/Chat/Settings/Library policy moved into controllers, and route chunks load on demand; Settings bootstrap decode and PET event/load ordering are explicitly tested | 13,390 TS/TSX + CSS | High | S🟡 U🟢 P🟢 E🟡 R🟢 |
| Sandbox entrypoints | Offscreen relay, sandbox iframe/Worker execution | Request/result validation is duplicated across layers; Chromium offscreen dependency | ~358 LOC | High | S🟢 U🟡 P🟡 E🔴 R🟡 |
| `packages/shell-host` | Installer, Native Messaging/MCP host, session/process/file/skill/picker/OS providers | Native root 54 LOC, installer root 214 LOC; framing/router/providers/adapters each have a single owner, and the protocol and tool order stay frozen | 2,878 native/lib LOC | High | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `wxt.config.ts` | Manifest, ASCII JS, exact-once Pyodide/Skill asset plugins | The manifest and build plugins are still in the same file; each browser artifact contains only the 5 Pyodide runtime files, and a strict bundled-Skill manifest is generated | 255 LOC | Medium | S🟡 U🟢 P🟢 E🟡 R🟢 |
| `scripts/` | CI/release/manifest/i18n/smoke/performance budgets | File responsibilities are largely single; package/chunk/burst policies are executable gates; i18n/automation smoke follows the current controller/provider owners rather than the old large-file locations | 21 / 3,871 | Medium | S🟢 U🟢 P🟢 E🟡 R🟢 |
| `tests/` | Vitest/jsdom unit and contract tests | 182 TS files / 161 test files; fault/restart/migration/runtime/resource/performance contracts are covered, but there is still no full real-browser or coverage gate | 182 / 34,292 | Medium | S🟢 U🟢 P🟡 E🟡 R🟢 |

## Dependency Graph Findings

The static TypeScript import graph shows:

- `entrypoints/background.ts` directly depends on 89 internal files and is the highest fan-out file.
- `entrypoints/content.ts` directly depends on about 34 internal files.
- `core/types.ts` is directly imported by about 77 files and is the highest fan-in center.
- `core/tool/runtime.ts` directly depends on 16 internal files and recognizes multiple providers through hardcoded branches.
- R5.1 scanned 351 source files in `core/` and `entrypoints/` with the TypeScript AST; the current relative-import graph has `0` strongly connected components.
- `core/types.ts` and `entrypoints/background.ts` are still high fan-in/fan-out centers, but form no changed-path import cycle; subsequent splitting must keep this zero-cycle baseline.

## Duplicate Contracts and Multiple Truth Sources

1. **Runtime messages**
   - The single production registry now owns `121 typed / 0 legacy / 2 client-only`; `background.ts` no longer contains a transitional switch.
   - `MessageAction` in `core/types.ts` still has 91 variants; the live-only receiver commands of R4.2–R4.3 were taken over through narrow typed contracts without expanding the old union, and the remaining live-only names are converged by R4.4.
   - All 80 payload-bearing commands are decoded at the handler receiving boundary by exhaustive command-codec maps; Memory, Skill, and Preset reuse their own domain codecs, while MCP, permission, sandbox, tool authorization, sync, automation, and Scenario are validated before privileged IO. There is no direct payload coercion or delegated payload reader.

2. **Platform access**
   - R3.9 deleted `PlatformServices`, its browser implementation, and the unconsumed storage/runtime/download/file-picker ports, without establishing a replacement facade.
   - Environment access remains in real composition/controller consumers; this batch added no zero-consumer broad facades, and all new ports are used by production paths.

3. **Skill import**
   - GitHub/local importers each maintain their own parsed document, size limits, naming conflicts, and resource policy.
   - Boundaries such as `MAX_SKILL_BYTES` are duplicated across browser/native paths.

4. **Sandbox validation**
   - Tool schema, background, offscreen, and runner each hand-write request/result validation.

5. **MCP UI policy**
   - Origin permission, allowlist, provider, and transport form policy are handled by the Side Panel controller calling core contracts; pages only render state and dispatch intents.

6. **DeepSeek protocol**
   - R3.3/R3.4 converged active and passive route/request/SSE into pure codecs + a single network policy. Passive Fetch/XHR keeps only browser interception, prompt augmentation, and visible stream rewriting, and no longer maintains a substring router, SSE framing/parser, or token metrics facade.

7. **Persistence**
   - The Floating chat key and state projection are shared by `core/floating-chat` + the launcher adapter, with no second enabled/default truth.
   - R3.6 made IndexedDB the only runtime truth for Artifact; legacy Chrome storage is only a one-time migration input with strict, retryable, verifiably cleaned-up semantics.
   - Usage and Tool History keep the released whole-array shape, but adjacent unobserved mutations go through store-local FIFO coalescing, with read/clear as explicit barriers; Sync does not take part in coalescing.
   - Project, Saved Items, and Scenario share a narrow storage slot/versioned repository; Scenario mutations are centralized in Background across realms, and the old refresh notification remains compatible. Memory/Artifact, tool execution blocks, and inline-agent traces each have a unique codec/store truth.

## Hotspot Details

### `entrypoints/background.ts`

- **Responsibility**: Extension composition root, runtime command registry, remaining cross-domain application services, and Chrome lifecycle.
- **Public API**: Single entry point for the 121 live runtime commands; 121 typed handlers, zero legacy cases.
- **Internal dependencies**: Almost all domains, including Memory, Skill, MCP, tool, sync, automation, DeepSeek, export, sandbox, and browser control.
- **Transformation note**: R4.4 completed the final 17 command cutovers and deleted the old switch; remaining consolidation may only shrink the composition/lifecycle root and must not restore a second routing or validator.
- **S.U.P.E.R issue**: Command ownership has been consolidated; the root file still composes multi-domain lifecycle/IO, and subsequent changed-path audits continue to check for deletable application-service residue.

### `entrypoints/content.ts`

- **Responsibility**: All long-running capabilities in the DeepSeek page isolated world.
- **Public API**: MAIN bridge handler, runtime listener, DOM controllers, tool/agent render/restore.
- **Internal dependencies**: 34 direct imports spanning 16 core domains.
- **Transformation note**: R4.5–R4.7 established a single epoch kernel, the MAIN/isolated bridge, the DOM capability controller, the mutation hub, and strict persistence codecs; an explicit peer-disconnect handshake lets restarting either the MAIN or isolated side release the old session and reconnect; R6.1 deleted the two permanent 500ms route pollers and reduced shared full-page mutation delivery from 126 to 21 in the fixed trace.
- **S.U.P.E.R issue**: Resource ownership, reinjection/BFCache, and teardown are now explicit; the root file still hosts considerable domain state/DOM implementation and is a later local maintenance hotspot, but it may no longer add long-lived resources around the lifecycle scope.

### `core/interceptor/fetch-hook.ts`

- **Responsibility**: Network interception, stream filtering, history/IDB cleanup, tool events, token speed.
- **Public API**: `installFetchHook`, `updateHookState`, and response payload types.
- **Transformation note**: Separate the DeepSeek request/stream contract from the page patch adapter; preserve byte-for-byte prompt and stream semantics.

### `core/tool` + root barrels

- **Responsibility**: Tool contracts, catalog, providers, dispatch, and persistence.
- **Public API**: `ToolDescriptor`, `ToolCall`, `executeRuntimeToolCall`, catalog helpers.
- **Transformation note**: Make the contract files free of implementation dependencies; replace hardcoded domain recognition with a provider registry/composition root; gradually dismantle the central barrel in `core/types.ts`.

### `core/platform`

- **Responsibility**: Declare capabilities for the PC browser-extension / all-false unknown environments, read possibly unavailable Chrome APIs, and provide Native/MCP gating.
- **Current state**: The 15-key PC capability matrix and generated manifests keep their contracts; Side Panel runtime requests go through only one typed client, and floating-chat expresses permission/invalidated degradation with the four-state model.
- **Transformation note**: R3.9 deleted the zero-consumer broad facade. Later, narrow ports may only be introduced in the same task as a real production consumer of storage/runtime/permission/identity/download.

### `core/sync`

- **Responsibility**: Remote backend, OAuth, schema validation, and snapshot sync.
- **Public API**: `StorageBackend`, `createStorageBackend`, generation publisher/reader, snapshot serializer, schema validators.
- **Transformation note**: The generation pointer, local journal, and recovery barrier of T2.4/T2.5 remain the sole commit protocol; R3.5–R3.10 unify the domain codec/mutation authority. R6.5 only coalesces adjacent unobserved whole-key writes of Usage/Tool History, and the order of Sync config/status, journal, and confirmed-target is entirely unchanged.

### `core/skill`

- **Responsibility**: Skill registry, import, bundled resources, and creator tool.
- **Transformation note**: The sole Skill/Source codec, local-only sync policy, and recovery journal of R3.10 remain unchanged. R6.3 moved 28 official resources out of the startup bundle, fetching/caching them on demand via a strict manifest + extension URL; default startup reads only the manifest and `deep-discuss`, and the final hashes of the 15 Skill objects and the existing library order are unchanged.

### `core/preset` and History Organizer

- **Responsibility**: Preset/active-ID persistence, History tag codec, and content controller.
- **Transformation note**: The released shapes, Preset journal, domain-first response, and History FIFO of R3.10 are unchanged; R4.7 brings the History controller into the Content lifecycle, while it remains explicit that only the content realm writes that key, with no new runtime writer or second persistence truth.

### `packages/shell-host`

- **Responsibility**: Native protocol, Shell/Python/session/file/Skill/picker/OS path/logging.
- **Transformation note**: R4.12–R4.13 split framing, router, session/process/file/Skill/picker/OS/logger and the installer adapters apart; the Native root composes only providers, and the 12-tool order, framing, path/env, and npm package surface stay compatible.

## Healthy Reference Modules

- `core/export`: complete layering of transport port, schema, normalizer, and renderer.
- `core/tool-loop`: a pure engine that injects external behavior through callbacks.
- `core/shell`: protocol and policy independent of the native host implementation.
- `core/token`, `automation/schedule.ts`: pure functions, low replacement cost.
- `core/mcp/transports`: JSON-RPC/transport contract is relatively clear.

These modules should serve as refactoring style references: independent contracts, one-way dependencies, and external IO injected through narrow ports.
