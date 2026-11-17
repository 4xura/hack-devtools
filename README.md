# HackTab

A DevTools workspace for composing HTTP requests, transforming text, and preparing security test payloads.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project folder.
3. Open an HTTP or HTTPS page, open DevTools, and select **HackTab**. The panel may be under the DevTools overflow menu.

Chrome 120 or newer is required. The extension runs directly from source; no build or dependency installation is needed.

## Workspace

- **Navigate tab** sends GET or form POST requests in the inspected tab.
- **Fetch response** supports GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS, with form, JSON, XML, or plain text bodies. Responses appear as text, with status, timing, and headers. Requests time out after 30 seconds; previews are limited to 1 MiB.
- **Header overrides** accept one `Name: value` per line. **Fetch** performs a background GET of the inspected page and replaces the editor with the outgoing request headers Chrome exposes. It keeps the tab in place and does not replay POST bodies. Captured page authentication and content negotiation are reused where available. Browser framing, compression, and `Sec-*` context headers are omitted from the editable list. **Reset** clears the editor and active navigation overrides. Presets cover Referer, User-Agent, Cookie, Authorization, Content-Type, and X-Forwarded-For.
- **Load page** restores the inspected URL and its latest captured navigation body. POST capture covers requests made while the extension is enabled; it does not recover requests from before installation.
- **Scratchpad** provides a separate text editor. Transforms use selected text, or the whole active field when nothing is selected. Payload insertion replaces the selection or inserts at the cursor. **Undo** restores the previous insertion or transformation in that field.
- **Ctrl+Enter** sends a request; **Command+Enter** also works on macOS.

Navigation header overrides apply only to the inspected tab’s top-level requests to the configured destination hostname. They remain active until the next Navigate request replaces them, **Reset** is pressed, the workspace is cleared, or the tab closes. Fetch overrides apply only during that request. Cross-host redirects do not inherit custom overrides.

Form bodies preserve repeated names, empty values, Unicode, and standard `+`/percent encoding. Navigate POST uses a browser form; use Fetch when exact JSON, XML, or text bodies are needed. Browser policies, network restrictions, cookies, and page form policies can affect requests. Response headers reflect what Chrome exposes to the extension.

## Payload library

Search and filter SQL, XSS, SSTI, SSRF, LFI, XXE, 403-bypass, shell snippets, and request body templates. SQL entries cover MySQL, PostgreSQL, MSSQL, Oracle, and SQLite, including column discovery, metadata, error probes, boolean tests, and delays. Entries marked **legacy** depend on database versions and features.

SSTI covers detection and engine-specific syntax for Jinja2, Django, Mako, Tornado, Twig, Smarty, Blade, FreeMarker, Velocity, Java EL, Thymeleaf, Ruby, JavaScript, Razor, and EEx. Native template expressions such as `{{config}}` remain literal payload text. SSRF includes alternate address forms, parser checks, URL schemes, and cloud metadata templates.

403-bypass includes path variants, URL rewrite headers, method override headers, and client-IP header combinations. Header entries add or replace the corresponding override; path entries replace the URL using its current origin and the configured **Target path**. These actions prepare the composer without sending a request. Chrome normalizes some dot-segment paths and URL forms; it is not a raw HTTP transport.

Template options configure column count, database, table, column names, file path, host, port, delay, and target path. Options are inserted as text. Review the resulting syntax before sending. Optional URL encoding applies to payloads inserted into the active editor; structured header and full-URL entries keep their request syntax. Payloads are never automatically sent or evaluated by the library. References and applicable notices are in `THIRD_PARTY_NOTICES.md`.

## Appearance and storage

Appearance defaults to **System** and follows OS color preferences. **Light** and **Dark** override that choice. Appearance and template options persist locally.

Drafts, scratchpads, captured bodies, and the latest 30 successful requests per tab are kept in browser session storage and cleared when the browser session ends. Closing a tab removes its session data. The extension has no telemetry, licensing service, remote scripts, or automatic update endpoint. Network requests are initiated through the request workspace.

## Development

Node.js 22 or newer is needed for development checks:

```sh
npm test
npm run check
npm run test:browser
npm run package
```

Browser tests use an isolated Chrome profile and a loopback HTTP server. Set `CHROME_PATH` if Chrome is not at its standard Windows location. Test profiles and screenshots are written under `work/`. Packaging writes `dist/hacktab-0.1.0.zip` and excludes tests, development files, and Git metadata.

This repository is private. Distribution is reserved for a future release.
