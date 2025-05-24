import { KeyValuePair } from '../common/pair'
import { Path } from './setup/path'
import { MaxRequestId } from './setup/max_request_id'
import { MaxAuthTokenCacheSize } from './setup/max_auth_token_cache_size'

export type SetupParameter = Path | MaxRequestId | MaxAuthTokenCacheSize
export namespace SetupParameter {
  export function fromKeyValuePair(pair: KeyValuePair): SetupParameter | undefined {
    return (
      Path.fromKeyValuePair(pair) || MaxRequestId.fromKeyValuePair(pair) || MaxAuthTokenCacheSize.fromKeyValuePair(pair)
    )
  }
  export function toKeyValuePair(param: SetupParameter): KeyValuePair {
    return param.toKeyValuePair()
  }
  export function isPath(param: SetupParameter): param is Path {
    return param instanceof Path
  }
  export function isMaxRequestId(param: SetupParameter): param is MaxRequestId {
    return param instanceof MaxRequestId
  }
  export function isMaxAuthTokenCacheSize(param: SetupParameter): param is MaxAuthTokenCacheSize {
    return param instanceof MaxAuthTokenCacheSize
  }
}

export class SetupParameters {
  private kvps: KeyValuePair[] = []

  addMaxAuthTokenCacheSize(maxSize: bigint | number): this {
    this.kvps.push(new MaxAuthTokenCacheSize(BigInt(maxSize)).toKeyValuePair())
    return this
  }

  addMaxRequestId(maxId: bigint | number): this {
    this.kvps.push(new MaxRequestId(BigInt(maxId)).toKeyValuePair())
    return this
  }

  addPath(moqtPath: string): this {
    this.kvps.push(new Path(moqtPath).toKeyValuePair())
    return this
  }

  addRaw(pair: KeyValuePair): this {
    this.kvps.push(pair)
    return this
  }

  build(): KeyValuePair[] {
    return this.kvps
  }

  static fromKeyValuePairs(kvps: KeyValuePair[]): SetupParameter[] {
    const result: SetupParameter[] = []
    for (const kvp of kvps) {
      const parsed =
        Path.fromKeyValuePair(kvp) || MaxRequestId.fromKeyValuePair(kvp) || MaxAuthTokenCacheSize.fromKeyValuePair(kvp)
      if (parsed) result.push(parsed)
    }
    return result
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('SetupParameters', () => {
    test('build and fromKeyValuePairs returns correct parameters', () => {
      const kvps = new SetupParameters().addPath('abc').addMaxRequestId(42n).addMaxAuthTokenCacheSize(123n).build()
      const parsed = SetupParameters.fromKeyValuePairs(kvps)
      expect(parsed.length).toBe(3)
      expect(parsed[0] && SetupParameter.isPath(parsed[0]) && parsed[0].moqtPath === 'abc').toBe(true)
      expect(parsed[1] && SetupParameter.isMaxRequestId(parsed[1]) && parsed[1].maxId === 42n).toBe(true)
      expect(parsed[2] && SetupParameter.isMaxAuthTokenCacheSize(parsed[2]) && parsed[2].maxSize === 123n).toBe(true)
    })
    test('fromKeyValuePairs skips unknown parameter', () => {
      const unknown = KeyValuePair.tryNewVarInt(998, 1n)
      const kvps = new SetupParameters().addRaw(unknown).addPath('wololoo').build()
      const parsed = SetupParameters.fromKeyValuePairs(kvps)
      expect(parsed.length).toBe(1)
      expect(parsed[0] && SetupParameter.isPath(parsed[0]) && parsed[0].moqtPath === 'wololoo').toBe(true)
    })
  })
}
