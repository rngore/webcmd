# Nexus Architecture

Nexus is a local-first browser agent with one shared task model and two browser execution paths.

## System diagram

```text
Chrome / Edge
┌──────────────────────────────┐
│ Nexus side panel              │
│ popup.html / popup.js / css   │
└──────────────┬───────────────┘
               │ chrome.runtime
               v
┌──────────────────────────────┐
│ Manifest V3 background worker│
│ active-tab evidence capture  │
└──────────────┬───────────────┘
               │ HTTP localhost
               v
┌──────────────────────────────┐
│ Node companion :4173         │
│ task state and orchestration │
└───────┬───────────┬──────────┘
        │           │
        │           └── structured extraction and answer rendering
        │
        └── WebCMD adapter
                    │
                    v
             Managed live browser
```

## Execution modes

### Active-tab research

The extension reads the currently active HTTP(S) webpage using `chrome.scripting.executeScript`. It sends bounded evidence to the local companion, which performs page classification, structured retrieval, security filtering, response-depth selection, and answer synthesis.

This path does not intentionally open Google or a separate Chromium window.

### WebCMD action workflow

Action-oriented tasks use `src/webcmd.js` to create a named WebCMD profile and task-scoped session. The agent loop executes semantic browser actions, observes the resulting page, verifies the result, and either continues, recovers, requests confirmation, or stops.

## Core modules

| Module | Responsibility |
|---|---|
| `src/server.js` | HTTP API and task orchestration |
| `src/state.js` | Structured task state and event history |
| `src/planner.js` | Initial task plan and policy metadata |
| `src/capabilities.js` | Task capability classification |
| `src/actions.js` | Explicit action representation |
| `src/action-policy.js` | Risk policy and confirmation decisions |
| `src/agent-loop.js` | Observe, act, verify, recover loop |
| `src/verification.js` | Evidence-based success checks |
| `src/structured.js` | Page-type and field-specific extraction |
| `src/extractor.js` | Relevance filtering and answer generation |
| `src/response-depth.js` | Brief-to-comprehensive response selection |
| `src/security.js` | Prompt-injection and sensitive-content filtering |
| `src/recovery.js` | Bounded retry behavior |
| `src/webcmd.js` | WebCMD profile/session and browser operations |

## WebCMD boundary

WebCMD is the only managed browser automation layer. Nexus does not introduce Playwright, Puppeteer, Selenium, or another parallel browser system.

The adapter uses WebCMD for:

- profile and session lifecycle;
- site-memory context;
- page navigation;
- semantic browser actions;
- compact observations;
- session cleanup.

The upstream project is:

**[agentrhq/webcmd](https://github.com/agentrhq/webcmd)**

Nexus treats WebCMD memory as a hint. Current live browser state always wins.

## Retrieval architecture

```text
Question
  ↓
Page-type detection + requested-field classification
  ↓
Structured fast path OR semantic evidence retrieval
  ↓
Field-aware confidence and duplicate removal
  ↓
Completeness and conflict checks
  ↓
Response-depth policy
  ↓
Structured answer with source links
```

Structured questions do not depend on generic relevance alone. Event date/time questions, for example, prioritize JSON-LD, `time` elements, ARIA metadata, event-detail components, and visible date/time text before ordinary page prose.

## Safety model

- Webpage text is untrusted evidence.
- Page instructions cannot override user, developer, or system policy.
- Sensitive-looking values are redacted.
- High-consequence actions require explicit confirmation.
- CAPTCHA and authentication challenges require human handoff.
- Timeouts after writes are treated as ambiguous until a fresh observation proves the result.
- The agent never reports success without verification evidence.
