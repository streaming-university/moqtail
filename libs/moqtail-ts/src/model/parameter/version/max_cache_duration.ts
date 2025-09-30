/**
 * Copyright 2025 The MOQtail Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { KeyValuePair } from '../../common/pair'
import { VersionSpecificParameterType } from '../constant'
import { Parameter } from '../parameter'

export class MaxCacheDuration implements Parameter {
  static readonly TYPE = VersionSpecificParameterType.MaxCacheDuration
  constructor(public readonly duration: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(MaxCacheDuration.TYPE, this.duration)
  }

  static fromKeyValuePair(pair: KeyValuePair): MaxCacheDuration | undefined {
    if (Number(pair.typeValue) !== MaxCacheDuration.TYPE || typeof pair.value !== 'bigint') return undefined
    return new MaxCacheDuration(pair.value)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('MaxCacheDuration', () => {
    test('fromKeyValuePair returns instance for valid pair', () => {
      const pair = new MaxCacheDuration(100n).toKeyValuePair()
      const param = MaxCacheDuration.fromKeyValuePair(pair)
      expect(param).toBeInstanceOf(MaxCacheDuration)
      expect(param?.duration).toBe(100n)
    })
    test('fromKeyValuePair returns undefined for wrong type', () => {
      const pair = KeyValuePair.tryNewVarInt(2, 100n)
      const param = MaxCacheDuration.fromKeyValuePair(pair)
      expect(param).toBeUndefined()
    })
  })
}
