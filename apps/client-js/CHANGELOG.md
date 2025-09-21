# client-js

## 0.4.0

### Minor Changes

- [#56](https://github.com/streaming-university/moqtail/pull/56) [`371c004`](https://github.com/streaming-university/moqtail/commit/371c0042fc28505acaa470678b34dfbee1cec17e) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Audio data sent error fixed while mic is off

- [#56](https://github.com/streaming-university/moqtail/pull/56) [`ec3ce03`](https://github.com/streaming-university/moqtail/commit/ec3ce03c8a762c844a23342dde8efc77ee956704) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Audio fetch request prevented, only video plays in the rewind player by choice

## 0.3.1

### Patch Changes

- [#48](https://github.com/streaming-university/moqtail/pull/48) [`b89e901`](https://github.com/streaming-university/moqtail/commit/b89e901bcce0d70d5d07ae9baaccafefbe757550) Thanks [@LeventAksakal](https://github.com/LeventAksakal)! - Add documentation for most of the public facing library api
  - add api-extractor for document standardization
  - add type-doc for static site generation based off tsdocs
  - add documentation for the following items:
    - moqtail client, client options
    - track, track source and object cache
    - some items under ./model (e.g reason phrase, full track name ...)
  - update client-js library imports to use aliases

## 0.3.0

### Minor Changes

- [#42](https://github.com/streaming-university/moqtail/pull/42) [`c8201a9`](https://github.com/streaming-university/moqtail/commit/c8201a99f09cc97d5ae59c2a3bff76db317f1b45) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Audio latency is displayed if camera is off.

- [#38](https://github.com/streaming-university/moqtail/pull/38) [`09098e2`](https://github.com/streaming-university/moqtail/commit/09098e22ec36e43e3de9a7daa46c5fb58a191624) Thanks [@zafergurel](https://github.com/zafergurel)! - Latency values now consistent across playback, and the global clock_normalizer.now() is used for all latency related calculations.

- [#30](https://github.com/streaming-university/moqtail/pull/30) [`c447866`](https://github.com/streaming-university/moqtail/commit/c447866eeaeae4d4a6e12217031ea9a3e666d988) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Fixed an issue where a stale video frame was briefly shown in the decoder when toggling camera from off to on.

- [#36](https://github.com/streaming-university/moqtail/pull/36) [`433eeec`](https://github.com/streaming-university/moqtail/commit/433eeec83d7bf5a52c2003b4e14249693cac5598) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Previously, MoQT audio objects were sent even when the mic was off. This fix ensures that audio is only enqueued when the mic is on.

- [#46](https://github.com/streaming-university/moqtail/pull/46) [`74de932`](https://github.com/streaming-university/moqtail/commit/74de932bfd6d002b350eda1e09208ca39975d745) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Media stream subscription management added with independent video/audio control.

## 0.2.0

### Minor Changes

- [#23](https://github.com/streaming-university/moqtail/pull/23) [`b3c1d3d`](https://github.com/streaming-university/moqtail/commit/b3c1d3de5728eb33a51aca8883cc26467eb59639) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Feature Added: Emoji Support in Chat Interface

  Issue:
  Previously, users could not send or view emojis in the MOQtail chat, resulting in a limited chat experience.

  Fix Summary:
  - Integrated an emoji picker UI with categorized emoji sets.
  - Enabled emoji insertion via quick reactions and full picker interface.
  - Implemented logic to detect and render emoji-only and mixed text messages.
  - Improved chat display for better readability and visual appeal of emojis.
