# steam-cli

- CLI, SDK, MCP and REST call the same service operations.
- Default tests use synthetic data and local HTTP servers, never real browser cookies or accounts.
- Never log credentials, cookie values, refresh tokens, API keys or authorization headers.
- Writes submit once. Report unknown outcomes without automatic retries. Verify account and ownership before editing reviews; preserve unspecified fields.
- Distinguish preview, accepted, verified and unknown outcomes. Never treat a private profile or an incomplete page as an empty successful read.
- Do not change system proxy settings, Steam configuration or browser profiles during tests.
- Keep credentials, browser databases, exported account data and downloaded games out of Git and packages.
- Backend integrations must identify the dependency and actual execution status. Forwarding a backend command does not establish native feature parity.
- Run npm run verify, package smoke tests and git diff --check before delivery.
