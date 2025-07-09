/**
 * @deprecated This class is deprecated and will be removed in a future version.
 * Use ClockNormalizer (see ./clock_normalizer.ts) instead for better time synchronization.
 *
 * @see {@link ClockNormalizer} - Modern replacement with better accuracy
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Performance/now} Performance.now() for basic timing
 *
 * @example
 * ```typescript
 * // ❌ Deprecated - Don't use
 * const offset = await AkamaiOffset.getClockSkew()
 *
 * // ✅ Use ClockNormalizer instead
 * import { ClockNormalizer } from './clock_normalizer'
 * const normalizer = await ClockNormalizer.create()
 * const offset = normalizer.getSkew()
 * const normalizedTime = normalizer.now()
 * ```
 */
export class AkamaiOffset {
  private static _offset: number | null = null
  private static _promise: Promise<number> | null = null

  static async getClockSkew(): Promise<number> {
    if (AkamaiOffset._offset !== null) {
      return AkamaiOffset._offset
    }
    if (AkamaiOffset._promise) {
      return AkamaiOffset._promise
    }
    AkamaiOffset._promise = AkamaiOffset.ClockSkew().then((offset) => {
      AkamaiOffset._offset = offset
      return offset
    })
    const offset = await AkamaiOffset._promise
    return Math.round(offset)
  }

  private static async ClockSkew(): Promise<number> {
    const akamaiUrl = 'https://time.akamai.com?ms'

    performance.clearResourceTimings()

    const response = await fetch(akamaiUrl)
    const text = await response.text()
    const TR = parseFloat(text.trim()) * 1000

    const entry = performance
      .getEntriesByType('resource')
      .find((e) => e.name.includes('time.akamai.com')) as PerformanceResourceTiming

    if (!entry) {
      console.warn('No resource entry found for Akamai time request')
      return 0
    }

    const T0 = entry.fetchStart + performance.timeOrigin
    const T1 = entry.responseStart + performance.timeOrigin
    const offset = (T0 + T1) / 2 - TR
    return offset
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('AkamaiOffset', () => {
    test('getClockSkew returns a number', async () => {
      const offset = await AkamaiOffset.getClockSkew()
      expect(typeof offset).toBe('number')
    })
    test(
      'getClockSkew returns the same value on subsequent calls',
      async () => {
        const offset1 = await AkamaiOffset.getClockSkew()
        await new Promise((resolve) => setTimeout(resolve, 9000)) // wait a bit to ensure the next call is not instantaneous
        const offset2 = await AkamaiOffset.getClockSkew()
        expect(Math.round(offset1)).toBe(Math.round(offset2))
      },
      { timeout: 20000 },
    )
  })
}
