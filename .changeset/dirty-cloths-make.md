---
'moqtail-ts': minor
---

Refactor fetch message structure for better type safety and API design

- **BREAKING**: Refactored `Fetch` class to use discriminated union for `typeAndProps`
  - Removed static factory methods (`Fetch.newStandAlone`, `Fetch.newRelative`, `Fetch.newAbsolute`)
  - Combined fetch type and properties into a single discriminated union field
  - Enables automatic TypeScript type narrowing based on fetch type
- **NEW**: Implemented both publisher and subscriber functionality for fetch operations
- **TODO**: Joining fetches require additional handling (partial implementation)
- **PERFORMANCE**: Reduced test timeouts to improve CI pipeline speed
  - Telemetry tests: 5s → 1s timeouts
  - ControlStream tests: 3s → 1s timeouts
  - AkamaiOffset tests: mocked network calls instead of real ones

This change provides a more idiomatic and type-safe API for fetch operations while maintaining backward compatibility for serialization/deserialization.
