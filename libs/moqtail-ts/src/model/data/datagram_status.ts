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

import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { KeyValuePair } from '../common/pair'
import { ObjectDatagramStatusType, ObjectStatus } from './constant'
import { Location } from '../common/location'

export class DatagramStatus {
  public readonly trackAlias: bigint
  public readonly location: Location

  private constructor(
    public readonly type: ObjectDatagramStatusType,
    trackAlias: bigint | number,
    location: Location,
    public readonly publisherPriority: number,
    public readonly extensionHeaders: KeyValuePair[] | null,
    public readonly objectStatus: ObjectStatus,
  ) {
    this.trackAlias = BigInt(trackAlias)
    this.location = location
  }

  get groupId(): bigint {
    return this.location.group
  }
  get objectId(): bigint {
    return this.location.object
  }

  static withExtensions(
    trackAlias: bigint | number,
    location: Location,
    publisherPriority: number,
    extensionHeaders: KeyValuePair[],
    objectStatus: ObjectStatus,
  ): DatagramStatus {
    return new DatagramStatus(
      ObjectDatagramStatusType.WithExtensions,
      trackAlias,
      location,
      publisherPriority,
      extensionHeaders,
      objectStatus,
    )
  }

  static newWithoutExtensions(
    trackAlias: bigint | number,
    location: Location,
    publisherPriority: number,
    objectStatus: ObjectStatus,
  ): DatagramStatus {
    return new DatagramStatus(
      ObjectDatagramStatusType.WithoutExtensions,
      trackAlias,
      location,
      publisherPriority,
      null,
      objectStatus,
    )
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.type)
    buf.putVI(this.trackAlias)
    buf.putVI(this.location.group)
    buf.putVI(this.location.object)
    buf.putU8(this.publisherPriority)
    if (this.type === ObjectDatagramStatusType.WithExtensions) {
      const extBuf = new ByteBuffer()
      if (this.extensionHeaders) {
        for (const header of this.extensionHeaders) {
          extBuf.putKeyValuePair(header)
        }
      }
      const extBytes = extBuf.toUint8Array()
      buf.putLengthPrefixedBytes(extBytes)
    }
    buf.putVI(this.objectStatus)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): DatagramStatus {
    const msgTypeRaw = buf.getNumberVI()
    const msgType = ObjectDatagramStatusType.tryFrom(msgTypeRaw)
    const trackAlias = buf.getVI()
    const groupId = buf.getVI()
    const objectId = buf.getVI()
    const publisherPriority = buf.getU8()
    let extensionHeaders: KeyValuePair[] | null = null
    switch (msgType) {
      case ObjectDatagramStatusType.WithExtensions: {
        const extBytes = buf.getLengthPrefixedBytes()
        const headerBytes = new FrozenByteBuffer(extBytes)
        extensionHeaders = []
        while (headerBytes.remaining > 0) {
          extensionHeaders.push(headerBytes.getKeyValuePair())
        }
        break
      }
      case ObjectDatagramStatusType.WithoutExtensions: {
        break
      }
    }
    console.log('Came here for trying tryFrom with object status')
    const objectStatus = ObjectStatus.tryFrom(buf.getVI())
    return new DatagramStatus(
      msgType,
      trackAlias,
      new Location(groupId, objectId),
      publisherPriority,
      extensionHeaders,
      objectStatus,
    )
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('DatagramStatus', () => {
    test('roundtrip', () => {
      const trackAlias = 144n
      const location = new Location(9n, 10n)
      const publisherPriority = 255
      const extensionHeaders = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
      ]
      const objectStatus = ObjectStatus.Normal
      const datagramStatus = DatagramStatus.withExtensions(
        trackAlias,
        location,
        publisherPriority,
        extensionHeaders,
        objectStatus,
      )
      const frozen = datagramStatus.serialize()
      const parsed = DatagramStatus.deserialize(frozen)
      expect(parsed).toEqual(datagramStatus)
    })
  })
}
