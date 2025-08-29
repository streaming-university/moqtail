export function getTransportPriority(priority: number): number {
  // Round to nearest integer and clamp between 0-255
  priority = Math.max(0, Math.min(255, Math.round(priority)))
  // Invert then map over 0-Number.MAX_SAFE_INTEGER so 0->MAX_SAFE_INTEGER and 255->0
  if (priority === 0) return Number.MAX_SAFE_INTEGER
  if (priority === 255) return 0
  // Due to floating-point precision below formula returns Number.MAX_SAFE_INTEGER + 1 for 0
  return Math.round((255 - priority) * (Number.MAX_SAFE_INTEGER / 255))
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest
  describe('getTransportPriority', () => {
    it('should map 0 to MAX_SAFE_INTEGER and 255 to 0', () => {
      expect(getTransportPriority(0)).toBe(Number.MAX_SAFE_INTEGER)
      expect(getTransportPriority(255)).toBe(0)
    })
    it('should be monotonic decreasing as priority increases', () => {
      let last = getTransportPriority(0)
      for (let p = 1; p <= 255; ++p) {
        const val = getTransportPriority(p)
        expect(val).toBeLessThan(last)
        last = val
      }
    })
    it('should clamp out-of-range values', () => {
      expect(getTransportPriority(-100)).toBe(Number.MAX_SAFE_INTEGER)
      expect(getTransportPriority(300)).toBe(0)
    })
    it('should round fractional priorities', () => {
      expect(getTransportPriority(0.4)).toBe(Number.MAX_SAFE_INTEGER)
      expect(getTransportPriority(254.6)).toBe(getTransportPriority(255))
    })
  })
}
