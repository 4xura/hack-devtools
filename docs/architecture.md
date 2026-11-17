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
| `styles/panel.css` | Responsive layout, system appearance, and explicit themes |

## Requests

The panel sends structured messages to the service worker. Only messages from the extension’s own `panel.html` are accepted. Validation is repeated in the worker. Per-tab queues serialize request changes; a separate queue serializes Fetch header rules.

Navigation uses `tabs.update` for GET and `scripting.executeScript` with structured arguments for form POST. The injected function creates hidden inputs in the isolated extension world and calls the native form submit method, including when a field is named `submit`.

Header modifications use declarative session rules. Navigation rules are constrained by tab, destination hostname, and main-frame resource type. Fetch rules use the extension initiator, destination hostname, and request resource type, and are removed in a `finally` block. Automatic redirects can be followed by Chrome; overrides do not match other destination hostnames. Fetch streams responses into a bounded text preview.

Top-level navigation request bodies are captured with the read-only webRequest API. Per-tab session state survives service worker suspension. Tab closure removes captured data, drafts, history, and header rules.

## Rendering

Payloads, response text, error messages, and history URLs are rendered through text nodes or editor values. Templates are substituted as strings. Text transformations never use `eval` or insert untrusted HTML. SHA hashes use Web Crypto; MD5 uses a local UTF-8 implementation. JWT decoding reports that its contents are unverified.

## Extension permissions

- `tabs`: resolve the inspected URL and navigate it.
- `scripting`: submit a POST form in the inspected page.
- `storage`: local preferences and ephemeral session data.
- `webRequest`: capture navigation method and body.
- `declarativeNetRequestWithHostAccess`: apply explicitly configured header overrides.
- HTTP/HTTPS host access: operate on user-selected request destinations.
