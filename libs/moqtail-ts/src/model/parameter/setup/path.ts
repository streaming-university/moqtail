import { KeyValuePair } from '../../common/pair'
import { SetupParameterType } from '../constant'
import { Parameter } from '../parameter'

export class Path implements Parameter {
  static readonly TYPE = SetupParameterType.Path
  constructor(public readonly moqtPath: string) {}

  toKeyValuePair(): KeyValuePair {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(this.moqtPath)
    return KeyValuePair.tryNewBytes(Path.TYPE, bytes)
  }

  static fromKeyValuePair(pair: KeyValuePair): Path | undefined {
    if (Number(pair.typeValue) !== Path.TYPE || !(pair.value instanceof Uint8Array)) return undefined
    const moqtPath = new TextDecoder().decode(pair.value)
    return new Path(moqtPath)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('PathParameter', () => {
    test('fromKeyValuePair returns instance for valid pair', () => {
      const pair = new Path('abc').toKeyValuePair()
      const param = Path.fromKeyValuePair(pair)
      expect(param).toBeInstanceOf(Path)
      expect(param?.moqtPath).toBe('abc')
    })
    test('fromKeyValuePair returns undefined for wrong type', () => {
      const pair = KeyValuePair.tryNewVarInt(SetupParameterType.MaxRequestId, 1n)
      const param = Path.fromKeyValuePair(pair)
      expect(param).toBeUndefined()
    })
  })
}
