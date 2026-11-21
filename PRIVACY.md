# Hack-DevTools privacy policy

Hack-DevTools is a browser DevTools workspace for editing HTTP requests and inspecting their responses. It does not have an Axura account, analytics service, or developer-operated server.

## Data the extension handles

- The extension observes HTTP and HTTPS page navigations so **Load page** can recover the inspected tab's URL, method, request body, and request headers. This data can include form values, cookies, or authorization headers.
- The request editor handles URLs, headers, bodies, responses, Scratchpad text, and session history that you create while using the extension.
- When you click **Send**, **Fetch** under Header overrides, or a follow-up request control, the browser sends a request to the destination URL you chose. That destination receives the request data and any credentials you chose to include, as it would for a browser request.

## Storage and retention

The extension stores captured page requests and headers, request drafts, Scratchpad text, and up to 30 history entries per tab in browser session storage. It removes a tab's session data when the tab closes. Browser session storage also clears when the browser session ends. Appearance and template options are stored locally until you change them or remove the extension.

You can clear the request editor with **Clear** and delete saved requests with **Clear history**.

## Sharing

Hack-DevTools does not transmit browsing or request data to Axura. It does not sell user data or share it with advertising or analytics services. Requests you choose to send reach their destination websites, which handle those requests under their own policies.

Use of information received through Chrome APIs follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

Questions can be sent through the [project issue tracker](https://github.com/4xura/hack-devtools/issues).
