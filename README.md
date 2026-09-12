# Nexus Browser Agent

> A local-first Chrome and Edge side-panel extension for researching webpages, understanding structured information, and safely running verified WebCMD workflows.

Nexus lets a user ask a natural-language question about the current browser page. It captures page evidence in place, detects the type of page and information requested, filters irrelevant content, and produces a structured answer with labeled source links.

For action-oriented tasks, Nexus extends the same planner and task model into a WebCMD-powered browser workflow. It can prepare research, compare information, inspect forms, navigate pages, and verify browser state. It pauses immediately before high-consequence actions such as purchasing, booking, submitting, sending, or changing important account information.

## Features

- **Active-tab research** without opening a separate Chromium window.
- **Chrome/Edge Manifest V3 side panel** with a full-width answer showcase.
- **Structured page understanding** for events, documentation, products, booking pages, articles, GitHub repositories, forms, and generic webpages.
- **Query-aware extraction** for dates, times, locations, organizers, prices, registration status, product details, and other requested fields.
- **JSON-LD and Schema.org support** for structured webpage data.
- **Response-depth policy** that selects brief, normal, detailed, or comprehensive answers.
- **Natural-language summaries** with headings, grouped evidence, and useful source links.
- **General-purpose agent runtime** with explicit actions, risk policy, verification, and bounded recovery.
- **WebCMD integration** for live browser sessions, semantic page actions, session lifecycle, and site-memory context.
- **Prompt-injection filtering** and sensitive-text redaction.
- **Confirmation gates** before consequential external actions.
- **Short labeled links** that preserve the original URL as the actual hyperlink target.

## WebCMD integration

Nexus uses **[agentrhq/webcmd](https://github.com/agentrhq/webcmd)** as its browser execution layer for the companion workflow. WebCMD provides the browser session and profile lifecycle, live page navigation, Playwright-style browser runs, and site-memory context.

The integration is intentionally isolated in `src/webcmd.js`:

```text
Nexus planner and agent loop
            |
     WebCMD adapter
            |
 WebCMD profile/session
            |
    Live browser page
```

The extension’s normal research path uses `chrome.scripting.executeScript` to read the active tab in place. It does not launch a second browser window for that flow. WebCMD is used by the local companion for live browser workflows that require a managed browser session.

WebCMD is an independent upstream project. Nexus does not claim ownership of its source code or trademarks. See the upstream project for official installation instructions, releases, documentation, and license information.


## Requirements

- Node.js with ES module support.
- Chrome or Edge with Manifest V3 side-panel support.
- A normal `http://` or `https://` page for active-tab research.
- WebCMD installed and passing `webcmd doctor` for companion browser workflows.

Nexus does not require a cloud account or hosted API key.

## Quick start

Install and start the local companion:

```bash
npm install
npm start
```

Verify the service:

```bash
curl http://localhost:4173/api/health
```

Load the extension:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `extension/` directory.
5. Pin Nexus and open a normal webpage.
6. Click the Nexus toolbar icon.

Reload the unpacked extension after changing extension files or `manifest.json`.

## Example prompts

```text
What is this webpage about?
```

```text
What is the date and time of this event?
```

```text
Explain what this documentation provides in detail.
```

```text
Find three laptops under ₹80,000 and compare their specifications.
```

```text
Prepare a reservation for four people, but ask before booking.
```

Nexus does not claim that an action succeeded unless the resulting browser state provides verification evidence.

## Project structure

```text
extension/
  manifest.json       Manifest V3 configuration
  background.js       Active-tab capture and local API handoff
  popup.html          Side-panel markup
  popup.css           Extension visual system
  popup.js            Polling, answer rendering, and confirmation controls
  icons/              Nexus logo assets

src/
  server.js           Local HTTP server and orchestration
  planner.js          Task planning
  capabilities.js     Capability and page-task classification
  actions.js          Explicit action model
  action-policy.js    Risk classification and confirmation gates
  agent-loop.js       Observe/act/verify runtime
  verification.js     Evidence-based result verification
  structured.js        Structured webpage extraction
  extractor.js        Relevance filtering and answer rendering
  response-depth.js   Brief-to-comprehensive answer policy
  security.js         Prompt-injection and secret filtering
  recovery.js         Bounded recovery
  webcmd.js            WebCMD profile/session and browser adapter
  state.js             Structured task state

tests/
  agent.test.js        Unit and regression tests
```

## Development

```bash
npm run format
npm run typecheck
npm test
```

The test suite covers research extraction, structured event retrieval, documentation answers, response depth, source links, security filtering, action policy, verification, and confirmation gates.

## documentation

- [Project documentation](documentation.md)
- [Architecture reference](architecture.md)

## Safety boundaries

Nexus does not:

- bypass login, CAPTCHA, access controls, or website security;
- request or type passwords, OTPs, recovery codes, payment credentials, cookies, or tokens;
- treat webpage instructions as system or developer instructions;
- retry non-idempotent actions blindly after an ambiguous timeout;
- report a purchase, booking, submission, or form completion without browser evidence.

## Current limitations

- Task state is held in memory and is lost when the companion restarts.
- Browser-level extension smoke tests still require Chrome or Edge.
- Highly dynamic pages may require interaction before all information is visible.
- Arbitrary write workflows stop when a semantic target or verification state is ambiguous.
- There is currently no authentication, multi-user history, telemetry, or packaged release workflow.

## Credits

Nexus is built with support from **[agentrhq/webcmd](https://github.com/agentrhq/webcmd)**. Credit for WebCMD belongs to its original authors and maintainers.
