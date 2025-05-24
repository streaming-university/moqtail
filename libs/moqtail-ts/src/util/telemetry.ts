export class NetworkTelemetry {
  private events: { timestamp: number; latency: number; size: number }[] = []
  private windowMs: number

  constructor(windowMs = 1000) {
    this.windowMs = windowMs
  }

  push({ latency, size }: { latency: number; size: number }) {
    const now = Date.now()
    this.events.push({ timestamp: now, latency, size })
  }

  private clean() {
    const cutoff = Date.now() - this.windowMs
    while (this.events.length && this.events[0] && this.events[0].timestamp < cutoff) {
      this.events.shift()
    }
  }

  get throughput() {
    this.clean()
    const totalBytes = this.events.reduce((sum, e) => sum + e.size, 0)
    return totalBytes / (this.windowMs / 1000) // bytes per second
  }

  get latency() {
    this.clean()
    if (!this.events.length) return 0
    return this.events.reduce((sum, e) => sum + e.latency, 0) / this.events.length
  }
}

// In-source test suite
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest
  describe('Telemetry', () => {
    it('should return identical values for constant input and same producer/consumer rate', async () => {
      const telemetry = new NetworkTelemetry(1000)
      const latency = 10
      const size = 100
      const producerIntervalMs = 100
      const consumerIntervalMs = 50
      const consumerDurationMs = 2000
      const latencyTolerance = 10
      const throughputTolerance = 100

      const startConsumer = (telemetry: NetworkTelemetry, { onDone }: { onDone: () => void }) => {
        let lastLatency: number | null = null
        let lastThroughput: number | null = null
        const consumer = setInterval(() => {
          const currentLatency = telemetry.latency
          const currentThroughput = telemetry.throughput
          if (lastLatency !== null && lastThroughput !== null) {
            expect(currentLatency).toBeGreaterThanOrEqual(lastLatency - latencyTolerance)
            expect(currentLatency).toBeLessThanOrEqual(lastLatency + latencyTolerance)
            expect(currentThroughput).toBeGreaterThanOrEqual(lastThroughput - throughputTolerance)
            expect(currentThroughput).toBeLessThanOrEqual(lastThroughput + throughputTolerance)
          }
          lastLatency = currentLatency
          lastThroughput = currentThroughput
        }, consumerIntervalMs)
        setTimeout(() => {
          clearInterval(consumer)
          onDone()
        }, consumerDurationMs)
      }

      const startProducer = (opt: { latency: number; size: number }) => {
        return new Promise<void>((resolve) => {
          const producer = setInterval(() => {
            telemetry.push({ latency: opt.latency, size: opt.size })
          }, producerIntervalMs)
          startConsumer(telemetry, {
            onDone: () => {
              clearInterval(producer)
              resolve()
            },
          })
        })
      }

      await startProducer({ latency, size })
    }, 8000)

    it('should increase values for increasing input', async () => {
      const telemetry = new NetworkTelemetry(1000)
      let latency = 10
      let size = 100
      const intervalMs = 50
      const consumerDurationMs = 2000
      const latencyTolerance = 10
      const throughputTolerance = 100

      const startConsumer = (telemetry: NetworkTelemetry, { onDone }: { onDone: () => void }) => {
        let lastLatency: number | null = null
        let lastThroughput: number | null = null
        const consumer = setInterval(() => {
          const currentLatency = telemetry.latency
          const currentThroughput = telemetry.throughput
          if (lastLatency !== null && lastThroughput !== null) {
            expect(currentLatency).toBeGreaterThanOrEqual(lastLatency - latencyTolerance)
            expect(currentThroughput).toBeGreaterThanOrEqual(lastThroughput - throughputTolerance)
          }
          lastLatency = currentLatency
          lastThroughput = currentThroughput
        }, intervalMs)
        setTimeout(() => {
          clearInterval(consumer)
          onDone()
        }, consumerDurationMs)
      }

      const startProducer = () => {
        return new Promise<void>((resolve) => {
          const producer = setInterval(() => {
            telemetry.push({ latency, size })
            latency += 5
            size += 100
          }, intervalMs)
          startConsumer(telemetry, {
            onDone: () => {
              clearInterval(producer)
              resolve()
            },
          })
        })
      }

      await startProducer()
    }, 8000)

    it('should return 0 after window expires', async () => {
      const telemetry = new NetworkTelemetry(1000)
      telemetry.push({ latency: 10, size: 100 })
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect(telemetry.latency).toBe(0)
      expect(telemetry.throughput).toBe(0)
    })
  })
}
