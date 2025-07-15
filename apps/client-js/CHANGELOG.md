# client-js

## 0.3.0

### Minor Changes

- [#30](https://github.com/streaming-university/moqtail/pull/30) [`c447866`](https://github.com/streaming-university/moqtail/commit/c447866eeaeae4d4a6e12217031ea9a3e666d988) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Fix: Resolved issue where a stale video frame was briefly shown in the decoder when toggling camera from off to on.

- [#36](https://github.com/streaming-university/moqtail/pull/36) [`433eeec`](https://github.com/streaming-university/moqtail/commit/433eeec83d7bf5a52c2003b4e14249693cac5598) Thanks [@kerembkmz](https://github.com/kerembkmz)! - Previously, MoQT audio objects were sent even when the mic was off. This fix ensures that audio is only enqueued when the mic is on.

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
