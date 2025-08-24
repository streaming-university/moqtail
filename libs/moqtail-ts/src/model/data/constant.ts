export enum ObjectDatagramStatusType {
  WithoutExtensions = 0x02,
  WithExtensions = 0x03,
}
export namespace ObjectDatagramStatusType {
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

export enum ObjectDatagramType {
  WithoutExtensions = 0x00,
  WithExtensions = 0x01,
}
export namespace ObjectDatagramType {
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

export enum FetchHeaderType {
  Type0x05 = 0x05,
}
export namespace FetchHeaderType {
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

export enum SubgroupHeaderType {
  Type0x08 = 0x08,
  Type0x09 = 0x09,
  Type0x0A = 0x0a,
  Type0x0B = 0x0b,
  Type0x0C = 0x0c,
  Type0x0D = 0x0d,
}

export namespace SubgroupHeaderType {
  export function hasExplicitSubgroupId(t: SubgroupHeaderType): boolean {
    return t === SubgroupHeaderType.Type0x0C || t === SubgroupHeaderType.Type0x0D
  }
  export function hasExtensions(t: SubgroupHeaderType): boolean {
    return t === SubgroupHeaderType.Type0x09 || t === SubgroupHeaderType.Type0x0B || t === SubgroupHeaderType.Type0x0D
  }
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
 * Publisher's preferred object delivery mechanism for a track.
 *
 * Semantics:
 * - `Subgroup`: Objects are forwarded inside ordered subgroups (reliable / ordered within subgroup semantics per protocol).
 * - `Datagram`: Objects are forwarded as unreliable datagrams when possible (may be lost / reordered) – best effort, lower overhead.
 *
 * The preference is advisory: the relay / transport layer MAY override based on negotiated capabilities.
 */
export enum ObjectForwardingPreference {
  /** Use ordered subgroups (reliable) */
  Subgroup = 'Subgroup',
  /** Use unreliable datagrams when feasible */
  Datagram = 'Datagram',
}
export namespace ObjectForwardingPreference {
  export function tryFrom(value: number | bigint | string): ObjectForwardingPreference {
    if (value === 'Subgroup') return ObjectForwardingPreference.Subgroup
    if (value === 'Datagram') return ObjectForwardingPreference.Datagram
    throw new Error(`Invalid ObjectForwardingPreference: ${value}`)
  }
}

export enum ObjectStatus {
  Normal = 0x0,
  DoesNotExist = 0x1,
  EndOfGroup = 0x3,
  EndOfTrack = 0x4,
}
export namespace ObjectStatus {
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
