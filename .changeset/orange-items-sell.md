---
'moqtail-ts': minor
---

Refactor client API and enhance subscribe request functionality

- **BREAKING**: Updated subscribe request API for better control and lifecycle management
- **NEW**: Added update functionality to subscribe requests
  - Allows modifying subscription parameters after initial request
  - Enables dynamic subscription management
- **NEW**: Added cancel functionality to subscribe requests
  - Provides clean subscription cleanup
  - Prevents memory leaks from abandoned subscriptions
- **PERFORMANCE**: Removed slow Akamai unit tests
  - Tests were causing CI pipeline delays
- **API**: Improved client API ergonomics
  - Better type safety for subscribe operations
  - Remove redundant public identifiers (everything is public by default)
  - Use # for private members

This change provides better control over subscription lifecycle
