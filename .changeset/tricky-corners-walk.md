---
'client-js': minor
---

Previously, MoQT audio objects were sent even when the mic was off. This fix ensures that audio is only enqueued when the mic is on.
