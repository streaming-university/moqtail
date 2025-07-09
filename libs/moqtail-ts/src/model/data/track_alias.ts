import { TrackAliasError } from '../error'
import { FullTrackName } from './full_track_name'

export class TrackAliasMap {
  private aliasToName = new Map<bigint, FullTrackName>()
  private nameToAlias = new Map<FullTrackName, bigint>()

  addMapping(alias: bigint, name: FullTrackName): void {
    if (this.aliasToName.has(alias)) {
      const existingName = this.aliasToName.get(alias)
      if (existingName === name) return
      throw new TrackAliasError(
        'TrackAliasMap::addMapping(existingName)',
        `Full track name already exists for alias: ${alias}`,
      )
    }
    if (this.nameToAlias.has(name)) {
      const existingAlias = this.nameToAlias.get(name)
      if (existingAlias === alias) return
      throw new TrackAliasError(
        'TrackAliasMap::addMapping(existingAlias)',
        `An alias already exists for full track name`,
      )
    }
    this.aliasToName.set(alias, name)
    this.nameToAlias.set(name, alias)
  }

  getNameByAlias(alias: bigint): FullTrackName {
    const name = this.aliasToName.get(alias)
    if (!name) throw new TrackAliasError('TrackAliasMap::getNameByAlias(name)', `Alias: ${alias} doesn't exist`)
    return name
  }

  getAliasByName(name: FullTrackName): bigint {
    const alias = this.nameToAlias.get(name)
    if (alias === undefined) throw new TrackAliasError('TrackAliasMap::getAliasByName(alias)', `Name does not exist`)
    return alias
  }

  removeMappingByAlias(alias: bigint): FullTrackName | undefined {
    const name = this.aliasToName.get(alias)
    if (name) {
      this.aliasToName.delete(alias)
      this.nameToAlias.delete(name)
      return name
    }
    return undefined
  }

  removeMappingByName(name: FullTrackName): bigint | undefined {
    const alias = this.nameToAlias.get(name)
    if (alias !== undefined) {
      this.nameToAlias.delete(name)
      this.aliasToName.delete(alias)
      return alias
    }
    return undefined
  }

  containsAlias(alias: bigint): boolean {
    return this.aliasToName.has(alias)
  }

  containsName(name: FullTrackName): boolean {
    return this.nameToAlias.has(name)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('TrackAliasMap', () => {
    test('add and get mapping roundtrip', () => {
      const map = new TrackAliasMap()
      const alias = 42n
      const name = FullTrackName.tryNew('namespace/test', 'bamboozeled')
      map.addMapping(alias, name)
      expect(map.getNameByAlias(alias)).toEqual(name)
      expect(map.getAliasByName(name)).toBe(alias)
    })
    test('add duplicate alias error', () => {
      const map = new TrackAliasMap()
      const alias = 1n
      const name1 = FullTrackName.tryNew('namespace/test', 'bamboozeled')
      const name2 = FullTrackName.tryNew('namespace/test/yeeahboii', 'bamboozeled')
      map.addMapping(alias, name1)
      expect(() => map.addMapping(alias, name2)).toThrow()
    })
  })
}
