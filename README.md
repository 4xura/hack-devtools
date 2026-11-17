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
- **Header overrides** accept one `Name: value` per line. Presets cover Referer, User-Agent, Cookie, Authorization, Content-Type, and X-Forwarded-For. Chrome manages Host, Content-Length, and connection framing.
- **Load page** restores the inspected URL and its latest captured navigation body. POST capture covers requests made while the extension is enabled; it does not recover requests from before installation.
- **Scratchpad** provides a separate text editor. Transforms use selected text, or the whole active field when nothing is selected. Payload insertion replaces the selection or inserts at the cursor. **Undo** restores the previous insertion or transformation in that field.
- **Ctrl+Enter** sends a request; **Command+Enter** also works on macOS.

Navigation header overrides apply only to the inspected tab’s top-level requests to the configured destination hostname. They remain active until the next Navigate request replaces them, **Reset active header overrides** is pressed, the workspace is cleared, or the tab closes. Fetch overrides apply only during that request. Cross-host redirects do not inherit custom overrides.

Form bodies preserve repeated names, empty values, Unicode, and standard `+`/percent encoding. Navigate POST uses a browser form; use Fetch when exact JSON, XML, or text bodies are needed. Browser policies, network restrictions, cookies, and page form policies can affect requests. Response headers reflect what Chrome exposes to the extension.

## Payload library

Search and filter SQL, XSS, LFI, XXE, shell snippets, and request body templates. SQL entries cover MySQL, PostgreSQL, MSSQL, Oracle, and SQLite, including column discovery, metadata, error probes, boolean tests, and delays. Entries marked **legacy** depend on database versions and features.

Template options configure column count, database, table, column names, file path, host, port, and delay. Options are inserted as text. Review the resulting syntax before sending. Optional URL encoding applies to inserted payloads. Payloads are never automatically sent or evaluated by the library.

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
