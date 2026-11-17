# Architecture

HackTab uses native ES modules and Manifest V3. It has no runtime packages, CDN assets, injected page listeners, or build step.

| File | Responsibility |
| --- | --- |
| `src/devtools.js` | Registers the DevTools panel |
| `src/panel.js` | Editors, settings, session drafts, history, and user actions |
| `src/background.js` | Validated requests, tab-scoped header rules, Fetch requests, and navigation capture |
| `src/core.js` | Request validation, header/form parsing, and template helpers |
| `src/transforms.js` | Text encoders, decoders, and hashes |
| `src/payloads.js` | Searchable text template catalog |
| `src/payloads-extra.js` | SSTI, SSRF, and 403-bypass catalog entries |
| `styles/panel.css` | Responsive layout, system appearance, and explicit themes |

## Requests

The panel sends structured messages to the service worker. Only messages from the extension’s own `panel.html` are accepted. Validation is repeated in the worker. Per-tab queues serialize request changes; a separate queue serializes Fetch header rules.

Navigation uses `tabs.update` for GET and `scripting.executeScript` with structured arguments for form POST. The injected function creates hidden inputs in the isolated extension world and calls the native form submit method, including when a field is named `submit`.

Header modifications use declarative session rules. Navigation rules are constrained by tab, destination hostname, and main-frame resource type. Fetch rules use the extension initiator, destination hostname, and request resource type, and are removed in a `finally` block. Automatic redirects can be followed by Chrome; overrides do not match other destination hostnames. Fetch streams responses into a bounded text preview.

In manual redirect mode, Fetch uses `redirect: 'manual'`. Chrome returns an opaque redirect, so the worker records the matching extension request's intermediate status, response headers, and Location through the read-only `onHeadersReceived` event. Each next hop is built from the previous request and redirect status: `301`/`302` switch POST to GET; `303` switches non-GET/HEAD to GET; `307`/`308` preserve method and body. Browser tab navigation is offered only for GET hops. The worker queues Fetch requests so redirect capture is associated with one request at a time.

The panel resolves follow-up URL templates from the initial JSON response. It restricts these GETs to the response origin and passes them through the same serialized Fetch queue. Polling stays in the panel so users can stop it. It stops on the configured ready state, a failed state, or after 30 checks. Result tabs read a session-scoped text snapshot and render it through `textContent`; closing the tab deletes that snapshot. A redirect destination can be opened separately with a browser GET.

Top-level navigation request bodies and outgoing headers are captured with the read-only webRequest API. The header editor’s Fetch action runs a background GET through the serialized Fetch queue, observes its final outgoing headers with `onSendHeaders` and `extraHeaders`, and returns an editable subset. It does not navigate the tab, save a replay-history entry, or reuse a POST body. Response headers remain in the separate response preview.

Per-tab session state survives service worker suspension. Tab closure removes captured data, drafts, history, and header rules.

## Rendering

Payloads, response text, error messages, and history URLs are rendered through text nodes or editor values. Templates are substituted as strings. Text transformations never use `eval` or insert untrusted HTML. SHA hashes use Web Crypto; MD5 uses a local UTF-8 implementation. JWT decoding reports that its contents are unverified.

Only recognized option names are interpolated, preserving engine-native expressions such as `{{config}}`. Catalog entries may declare a header or URL destination. Header insertion performs a case-insensitive upsert to prevent duplicate override names; URL variants use the current origin and configured path. Ordinary payloads continue to insert at the active editor selection.

## Extension permissions

- `tabs`: resolve the inspected URL and navigate it.
- `scripting`: submit a POST form in the inspected page.
- `storage`: local preferences and ephemeral session data.
- `webRequest`: capture navigation method/body and outgoing request headers.
- `declarativeNetRequestWithHostAccess`: apply explicitly configured header overrides.
- HTTP/HTTPS host access: operate on user-selected request destinations.
