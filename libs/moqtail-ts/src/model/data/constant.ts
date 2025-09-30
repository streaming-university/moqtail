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

/**
 * @public
 * Object datagram status types for MOQT objects.
 * - `WithoutExtensions`: Object datagram without extensions.
 * - `WithExtensions`: Object datagram with extensions.
 */
export enum ObjectDatagramStatusType {
  WithoutExtensions = 0x02,
  WithExtensions = 0x03,
}

/**
 * @public
 * Namespace for ObjectDatagramStatusType utilities.
 */
export namespace ObjectDatagramStatusType {
  /**
   * Converts a number or bigint to ObjectDatagramStatusType.
   * @param value - The value to convert.
   * @returns The corresponding ObjectDatagramStatusType.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint): ObjectDatagramStatusType {
    const v = typeof value === 'bigint' ? Number(value) : value
    switch (v) {
      case 0x02:
        return ObjectDatagramStatusType.WithoutExtensions
      case 0x03:
        return ObjectDatagramStatusType.WithExtensions
      default:
        throw new Error(`Invalid ObjectDatagramStatusType: ${value}`)
    }
  }
}

/**
 * @public
 * Object datagram types for MOQT objects.
 * - `WithoutExtensions`: Object datagram without extensions.
 * - `WithExtensions`: Object datagram with extensions.
 */
export enum ObjectDatagramType {
  WithoutExtensions = 0x00,
  WithExtensions = 0x01,
}

/**
 * @public
 * Namespace for ObjectDatagramType utilities.
 */
export namespace ObjectDatagramType {
  /**
   * Converts a number or bigint to ObjectDatagramType.
   * @param value - The value to convert.
   * @returns The corresponding ObjectDatagramType.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint): ObjectDatagramType {
    const v = typeof value === 'bigint' ? Number(value) : value
    switch (v) {
      case 0x00:
        return ObjectDatagramType.WithoutExtensions
      case 0x01:
        return ObjectDatagramType.WithExtensions
      default:
        throw new Error(`Invalid ObjectDatagramType: ${value}`)
    }
  }
}

/**
 * @public
 * Fetch header types for MOQT fetch requests.
 */
export enum FetchHeaderType {
  Type0x05 = 0x05,
}

/**
 * Namespace for FetchHeaderType utilities.
 */
export namespace FetchHeaderType {
  /**
   * Converts a number or bigint to FetchHeaderType.
   * @param value - The value to convert.
   * @returns The corresponding FetchHeaderType.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint): FetchHeaderType {
    const v = typeof value === 'bigint' ? Number(value) : value
    switch (v) {
      case 0x05:
        return FetchHeaderType.Type0x05
      default:
        throw new Error(`Invalid FetchHeaderType: ${value}`)
    }
  }
}

/**
 * @public
 * Subgroup header types for MOQT subgroups.
 */
export enum SubgroupHeaderType {
  Type0x08 = 0x08,
  Type0x09 = 0x09,
  Type0x0A = 0x0a,
  Type0x0B = 0x0b,
  Type0x0C = 0x0c,
  Type0x0D = 0x0d,
}

/**
 * Namespace for SubgroupHeaderType utilities.
 */
export namespace SubgroupHeaderType {
  /**
   * Returns true if the header type has an explicit subgroup ID.
   * @param t - The SubgroupHeaderType.
   */
  export function hasExplicitSubgroupId(t: SubgroupHeaderType): boolean {
    return t === SubgroupHeaderType.Type0x0C || t === SubgroupHeaderType.Type0x0D
  }
  /**
   * Returns true if the header type has extensions.
   * @param t - The SubgroupHeaderType.
   */
  export function hasExtensions(t: SubgroupHeaderType): boolean {
    return t === SubgroupHeaderType.Type0x09 || t === SubgroupHeaderType.Type0x0B || t === SubgroupHeaderType.Type0x0D
  }
  /**
   * Converts a number or bigint to SubgroupHeaderType.
   * @param value - The value to convert.
   * @returns The corresponding SubgroupHeaderType.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint): SubgroupHeaderType {
    const v = typeof value === 'bigint' ? Number(value) : value
    switch (v) {
      case 0x08:
        return SubgroupHeaderType.Type0x08
      case 0x09:
        return SubgroupHeaderType.Type0x09
      case 0x0a:
        return SubgroupHeaderType.Type0x0A
      case 0x0b:
        return SubgroupHeaderType.Type0x0B
      case 0x0c:
        return SubgroupHeaderType.Type0x0C
      case 0x0d:
        return SubgroupHeaderType.Type0x0D
      default:
        throw new Error(`Invalid SubgroupHeaderType: ${value}`)
    }
  }
}

/**
 * @public
 * Publisher's preferred object delivery mechanism for a track.
 * - `Subgroup`: Use ordered subgroups (reliable).
 * - `Datagram`: Use unreliable datagrams when feasible.
 *
 * The preference is advisory: the relay/transport layer MAY override based on negotiated capabilities.
 */
export enum ObjectForwardingPreference {
  Subgroup = 'Subgroup',
  Datagram = 'Datagram',
}

/**
 * Namespace for ObjectForwardingPreference utilities.
 */
export namespace ObjectForwardingPreference {
  /**
   * Converts a number, bigint, or string to ObjectForwardingPreference.
   * @param value - The value to convert.
   * @returns The corresponding ObjectForwardingPreference.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint | string): ObjectForwardingPreference {
    if (value === 'Subgroup') return ObjectForwardingPreference.Subgroup
    if (value === 'Datagram') return ObjectForwardingPreference.Datagram
    throw new Error(`Invalid ObjectForwardingPreference: ${value}`)
  }
}

/**
 * @public
 * Object status codes for MOQT objects.
 * - `Normal`: Object exists and is available.
 * - `DoesNotExist`: Object does not exist.
 * - `EndOfGroup`: End of group marker.
 * - `EndOfTrack`: End of track marker.
 */
export enum ObjectStatus {
  Normal = 0x0,
  DoesNotExist = 0x1,
  EndOfGroup = 0x3,
  EndOfTrack = 0x4,
}

/**
 * Namespace for ObjectStatus utilities.
 */
export namespace ObjectStatus {
  /**
   * Converts a number or bigint to ObjectStatus.
   * @param value - The value to convert.
   * @returns The corresponding ObjectStatus.
   * @throws Error if the value is not valid.
   */
  export function tryFrom(value: number | bigint): ObjectStatus {
    const v = typeof value === 'bigint' ? Number(value) : value
    switch (v) {
      case 0x0:
        return ObjectStatus.Normal
      case 0x1:
        return ObjectStatus.DoesNotExist
      case 0x3:
        return ObjectStatus.EndOfGroup
      case 0x4:
        return ObjectStatus.EndOfTrack
      default:
        throw new Error(`Invalid ObjectStatus: ${value}`)
    }
  }
}
