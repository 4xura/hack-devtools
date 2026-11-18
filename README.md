# HackTab

A DevTools workspace for composing HTTP requests, transforming text, and preparing security test payloads.

## Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project folder.
3. Open an HTTP or HTTPS page, open DevTools, and select **HackTab**. The panel may be under the DevTools overflow menu.

Chrome 120 or newer is required. The extension runs directly from source; no build or dependency installation is needed.

## Firefox

Firefox 142 or newer is required. Build the Firefox variant from the same source tree:

```sh
npm ci
npm run package:firefox
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox-unpacked/manifest.json`. Open DevTools on an HTTP or HTTPS page and select **HackTab**. Temporary add-ons are removed when Firefox restarts. The ZIP in `dist/` is unsigned and is not a permanent install package; permanent distribution requires Mozilla signing.

## Workspace

- **Navigate tab** sends GET or form POST requests in the inspected tab.
- **Fetch response** supports GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS, with form, JSON, XML, or plain text bodies. Responses appear as text, with status, timing, and headers. Requests time out after 30 seconds; previews are limited to 1 MiB.
- **Follow-up request** can build a same-origin GET URL from a JSON response using fields such as `{{response.job_id}}`. Send it once or poll every 400 ms until a configurable state field reaches its ready value, up to 30 checks. The configured result field appears below the response and can be opened in a separate HackTab result tab.
- **Open destination (GET)** appears when Fetch follows an HTTP redirect, including a POST that receives `302` and continues as GET. It opens the final URL with a browser GET. **Open result in tab** displays the response body as inert text, including HTML source, without running scripts from the response.
- **Pause on redirects** is available in Chrome with Fetch response. It shows the intermediate status, response headers, `Location`, and proposed next method before sending the next hop. Choose **Edit next request** to load the proposed URL, method, body, and headers into the main composer, where every field and the delivery choice can be changed before Send. **Follow with Fetch** sends the proposed hop directly; **Navigate tab** does so when it is GET. POST becomes GET for `301`/`302`; `303` switches non-GET/HEAD methods to GET; `307`/`308` preserve method and body, so direct tab navigation is disabled for those non-GET hops. Cross-origin hops do not copy explicit Authorization or Cookie overrides. Firefox follows Fetch redirects automatically because it does not expose the intermediate `Location` of an extension-origin Fetch request.
- **Header overrides** accept one `Name: value` per line. In Chrome, **Fetch** performs a background GET of the inspected page and replaces the editor with the outgoing request headers Chrome exposes. In Firefox, **Fetch** loads the most recently captured headers from that page; reload the page first if it was open before HackTab. It keeps the tab in place and does not replay POST bodies. Browser framing, compression, and `Sec-*` context headers are omitted from the editable list. **Reset** clears the editor and active navigation overrides. Presets cover Referer, User-Agent, Cookie, Authorization, Content-Type, and X-Forwarded-For.
- **Load page** restores the inspected URL and its latest captured navigation body. POST capture covers requests made while the extension is enabled; it does not recover requests from before installation.
- **Scratchpad** provides a separate text editor. Transforms use selected text, or the whole active field when nothing is selected. Payload insertion replaces the selection or inserts at the cursor. **Undo** restores the previous insertion or transformation in that field.
- **Format** below Request body converts JavaScript-style object notation with unquoted keys, single quotes, or trailing commas into strict JSON when Body is set to JSON. With Form encoded selected, it converts URL-encoded pairs or line-based `name: value` fields into a form body. Invalid JSON is explained beneath the body editor. Formatting runs only when the button is clicked, so deliberately malformed test bodies stay intact until you choose to convert them.
- **Ctrl+Enter** sends a request; **Command+Enter** also works on macOS.

Navigation header overrides apply only to the inspected tab’s top-level requests to the configured destination hostname. They remain active until the next Navigate request replaces them, **Reset** is pressed, the workspace is cleared, or the tab closes. Fetch overrides apply only during that request. Cross-host redirects do not inherit custom overrides.

Form bodies preserve repeated names, empty values, Unicode, and standard `+`/percent encoding. Navigate POST uses a browser form; use Fetch when exact JSON, XML, or text bodies are needed. Browser policies, network restrictions, cookies, and page form policies can affect requests. Response headers reflect what Chrome exposes to the extension.

Opening a redirected destination performs a new GET. If the final response depends on a POST body, use the captured response or a configured follow-up request instead.

In Chrome, to inspect a redirect chain, select **Fetch response**, check **Pause on redirects**, and send the first request. Read the intermediate response headers and target URL. Choose **Edit next request** if you want to revise the proposed hop in the main composer, then press **Send**. For an unchanged hop, use the direct Fetch or navigation button. The redirect card appears again if the next hop also redirects. Leave the checkbox off when the final response is all you need.

### Async job example

The reservation example uses an asynchronous job rather than an HTTP redirect. Send the lookup request, then send a JSON POST to `/api/check-in` with `reservation`, `family_name`, and `receipt_layout`. Its `202` response contains `job_id`. HackTab suggests `/api/print-jobs/{{response.job_id}}`; click **Poll until ready**. The default state and result fields, `state=ready` and `receipt_text`, display the finished receipt. **Open result in tab** shows the receipt in a separate tab. The site's own `/reservations` page updates its receipt area only when its JavaScript form handler runs.

## Payload library

Search and filter engine-specific SQL tabs for MySQL, PostgreSQL, MSSQL, Oracle, SQLite, DB2, and BigQuery, plus NoSQL-MongoDB. The catalog also includes XSS, LFI, XXE, SSTI, SSRF, 403-bypass, CORS, CMD, CRLF, CSS, CSV, Encoding, GraphQL, HPP, LDAP, SAML, Upload, WebSocket, XPath, shell snippets, and request body templates. SQL entries separate probes, enumeration, delays, advanced features, and legacy techniques where applicable.

SSTI covers detection and engine-specific syntax for Jinja2, Django, Mako, Tornado, Twig, Smarty, Blade, FreeMarker, Velocity, Java EL, Thymeleaf, Ruby, JavaScript, Razor, and EEx. Native template expressions such as `{{config}}` remain literal payload text. SSRF includes alternate address forms, parser checks, URL schemes, and cloud metadata templates.

403-bypass includes path variants, URL rewrite headers, method override headers, and client-IP header combinations. Header entries add or replace the corresponding override; path entries replace the URL using its current origin and the configured **Target path**. These actions prepare the composer without sending a request. Browsers normalize some dot-segment paths and URL forms; HackTab is not a raw HTTP transport.

Encoding includes explicit Unicode compatibility characters and visually similar letters. The transform menu provides NFC, NFD, NFKC, NFKD, and named Latin-to-lookalike substitutions. Greek omicron `ο` and Cyrillic `о` look like Latin `o` in many fonts, while NFKC keeps them distinct. Fullwidth `ｏ` normalizes to Latin `o`. See [Unicode confusables data](https://www.unicode.org/Public/security/latest/confusables.txt) and [Unicode normalization](https://www.unicode.org/reports/tr15/).

Upload and WebSocket entries are text snippets for composing requests or messages. The current request composer sends HTTP requests and does not upload binary files or open WebSocket connections. Raw duplicate JSON keys in the HPP and NoSQL sections should be left unformatted because JSON formatting collapses duplicate keys.

Template options configure column count, database, table, column names, file path, host, port, delay, target path, and a probe value. Options are inserted as text. Review the resulting syntax before sending. Optional URL encoding applies to payloads inserted into the active editor; structured header and full-URL entries keep their request syntax. Payloads are never automatically sent or evaluated by the library. References and applicable notices are in `THIRD_PARTY_NOTICES.md`.

## Appearance and storage

Appearance defaults to **System** and follows OS color preferences. **Light** and **Dark** override that choice. Appearance and template options persist locally.

Drafts, scratchpads, captured bodies, and the latest 30 successful requests per tab are kept in browser session storage and cleared when the browser session ends. Follow-up polling does not add each check to history. Result tabs use session storage and their stored response is removed when the tab closes. The extension has no telemetry, licensing service, remote scripts, or automatic update endpoint. Network requests are initiated through the request workspace.

## Development

Node.js 22 or newer is needed for development checks. The root folder is the Chrome unpacked extension; the Firefox build is generated under `dist/firefox-unpacked` from the same JavaScript, HTML, CSS, and assets. The build substitutes Firefox's `browser` Promise API and writes a Firefox MV3 background-page manifest. No generated files are committed.

```sh
npm ci
npm test
npm run check
npm run test:browser
npm run test:firefox
npm run package:all
npm run lint:firefox
```

Browser tests use isolated profiles and a loopback HTTP server. Set `CHROME_PATH` or `FIREFOX_PATH` when a browser is not at a standard Windows location. Test profiles and screenshots are written under `work/`. Packaging writes `dist/hacktab-1.1.0.zip` and `dist/hacktab-firefox-1.1.0.zip`, excluding tests, development files, and Git metadata.

For an authorized live environment that implements the reservation job example, set `HACKTAB_LIVE_ORIGIN` before `npm run test:browser` to exercise lookup, check-in, and job polling in addition to the local fixtures.

This repository is private. Distribution is reserved for a future release.
