# Nexus Project Documentation

This document explains how Nexus works, how to run it, and how to extend its research and WebCMD-powered workflow capabilities.

## 1. Product model

Nexus consists of:

1. A Chrome/Edge Manifest V3 side panel.
2. A background service worker that captures active-tab evidence.
3. A local Node.js companion service.
4. A shared planner and structured task-state model.
5. A WebCMD adapter for managed browser sessions.
6. Evidence extraction, security filtering, response synthesis, verification, and recovery modules.

The extension and WebCMD paths share task concepts but have different browser boundaries:

| Path | Browser boundary | Main use |
|---|---|---|
| Active-tab extension | `chrome.scripting.executeScript` | Read and answer questions about the current page |
| WebCMD companion | WebCMD profile/session and `browser run` | Live navigation, interaction, multi-step workflows, and verification |

## 2. Installation

### Companion

```bash
npm install
npm start
```

The companion defaults to `http://localhost:4173`. Configuration values are documented in `.env.example`.

### WebCMD

For the WebCMD companion path:

```bash
webcmd --version
webcmd doctor
```

`webcmd doctor` must pass before browser-session commands are used. Nexus follows the upstream WebCMD setup and browser skill guidance rather than replacing WebCMD with another browser automation framework.

### Extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `extension/`.
5. Pin Nexus.
6. Open a normal HTTP(S) page and click the Nexus icon.

## 3. Research flow

The active-tab research flow is:

```text
User objective
    ↓
Task creation
    ↓
Active-tab evidence capture
    ↓
Page-type detection
    ↓
Question and field classification
    ↓
Structured or semantic retrieval
    ↓
Security filtering
    ↓
Response-depth selection
    ↓
Answer with labeled sources
```

The extension collects bounded evidence such as:

- URL and title;
- meta description;
- headings;
- main content;
- visible links;
- JSON-LD;
- `time` and `datetime` values;
- ARIA labels;
- event-oriented metadata;
- GitHub repository and README fields where available.

## 4. Structured webpage understanding

`src/structured.js` detects page categories including:

- event;
- article;
- documentation;
- GitHub repository;
- product;
- booking;
- form;
- job;
- search results;
- generic webpage.

For structured questions, Nexus identifies requested fields before ranking evidence. An event question may request:

```json
{
  "pageType": "event",
  "requestedFields": ["date", "startTime", "endTime"]
}
```

Event evidence is collected from JSON-LD, semantic HTML, accessibility attributes, visible event-detail components, headings, and surrounding text. Structured data and visible data are cross-checked. Current visible page evidence takes precedence if it conflicts with stale structured data.

Nexus does not manufacture missing dates, times, locations, or prices.

## 5. Response depth

The response-depth policy selects:

| Level | Typical use |
|---|---|
| `BRIEF` | Title, price, date, count, or another simple fact |
| `NORMAL` | “What is this webpage?” |
| `DETAILED` | “What does this website offer?” |
| `COMPREHENSIVE` | “Explain this in detail,” “deep dive,” or “analyze everything important” |

The policy considers user wording, page type, task complexity, and available relevant evidence. It expands coverage without repeating claims or adding unsupported filler.

Documentation pages can include:

- what the documentation covers;
- what technologies or subjects it provides;
- important sections;
- getting-started information;
- relevant supporting evidence;
- source links.

## 6. General-purpose agent runtime

Action tasks use the same task model as research but add explicit actions:

```text
UNDERSTAND
→ CLASSIFY
→ PLAN
→ POLICY CHECK
→ EXECUTE THROUGH WEBCMD
→ OBSERVE
→ VERIFY
→ CONTINUE / RECOVER / ASK
→ REPORT
```

Supported action types include:

`NAVIGATE`, `SEARCH`, `CLICK`, `TYPE`, `SELECT`, `SCROLL`, `EXTRACT`, `COMPARE`, `ADD_TO_CART`, `FILL_FORM`, `SUBMIT`, `PURCHASE`, `BOOK`, `WAIT`, `VERIFY`, `ASK_USER`, and `FINISH`.

Every action records status, risk, target, history, and verification data. The runtime stops instead of guessing when an expected target or post-action state is unavailable.

## 7. Action policy

| Risk | Examples | Default behavior |
|---|---|---|
| Low | Search, read, compare, navigate, monitor, verify | Autonomous |
| Medium | Add to cart, save, fill a form, create a draft | Visible and controlled |
| High | Purchase, booking, sending, submission, accepting terms, account changes | Confirmation immediately before execution |

Confirmation details include the intended action, website, important details, and possible external consequences.

Endpoints:

```text
POST /api/tasks/:id/confirm
POST /api/tasks/:id/cancel
```

Nexus does not ask for or handle credentials, payment details, OTPs, cookies, or recovery codes.

## 8. WebCMD integration

The WebCMD integration is isolated in `src/webcmd.js`.

It is responsible for:

- creating or reusing a named WebCMD profile;
- creating a task-scoped session;
- loading site-memory context before live browser work;
- executing browser actions through WebCMD;
- returning compact observations;
- closing sessions after completion.

The integration follows the WebCMD operating model:

- memory is prior knowledge, not truth;
- live browser state is authoritative;
- semantic locators are preferred;
- snapshots and observations are refreshed after transitions;
- ambiguous write results are inspected before retrying;
- CAPTCHA and authentication challenges require human handoff.

See the upstream project for the authoritative WebCMD documentation:

**[agentrhq/webcmd](https://github.com/agentrhq/webcmd)**

## 9. Local API

### Health

```http
GET /api/health
```

### Create task

```http
POST /api/tasks
Content-Type: application/json
```

```json
{
  "objective": "What is this page about?",
  "execution": "extension-tab",
  "tabId": 123
}
```

### Submit active-tab evidence

```http
POST /api/tasks/:id/evidence
Content-Type: application/json
```

The evidence payload may contain `url`, `title`, `description`, `headings`, `text`, `links`, `jsonLd`, `eventLines`, `pageType`, and repository fields.

### Poll task

```http
GET /api/tasks/:id
```

The response contains status, events, answer, sources, findings, classification, actions, verification state, errors, and confirmation details where applicable.

## 10. Testing

Run:

```bash
npm run format
npm run typecheck
npm test
```

Important regression areas include:

- active-tab research;
- source-label rendering;
- long documentation answers;
- event date/time extraction;
- JSON-LD event extraction;
- page-type classification;
- response-depth selection;
- prompt-injection filtering;
- action risk policy;
- confirmation gating;
- verified cart/booking/submission outcomes;
- false-success prevention.

## 11. Troubleshooting

### The sidebar cannot connect

Start the companion:

```bash
npm start
```

Then check:

```bash
curl http://localhost:4173/api/health
```

### The extension cannot inspect the page

Use a normal `http://` or `https://` page. Browser-internal pages such as `chrome://newtab/` are intentionally rejected.

### Answers remain incomplete

The page may use lazy loading, virtual scrolling, interaction-gated content, login walls, or a CAPTCHA. Make the relevant section visible and retry. Nexus will not bypass access controls.

### A workflow stops before completion

Check the task’s action history, verification status, and latest event. A stop may indicate an unavailable semantic target, a changed layout, an authentication wall, a CAPTCHA, or an unverified post-action state.

## 12. Limitations

- Tasks are stored in memory.
- The extension requires the local companion.
- Dynamic websites may expose incomplete content without interaction.
- Arbitrary website actions require reliable semantic targets.
- No durable multi-user history or packaged browser-store release is currently included.
