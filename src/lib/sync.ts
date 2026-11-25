import { mergeIntoLocal } from '../db/repo'
import type { Dataset, SyncRecord, Trip } from '../db/types'
import { ConflictError, getFile, listDir, putFile, repoInfo, type GhConfig } from './github'

const FORMAT = 1

/** JSON with sorted keys so the same data always serializes to the same text. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(
    v,
    (_k, val) =>
      val && typeof val === 'object' && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : val,
    1,
  ) + '\n'
}

const byId = <T extends SyncRecord>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

export function serialize(ds: Dataset): Map<string, string> {
  const files = new Map<string, string>()
  files.set('people.json', stableStringify({ format: FORMAT, people: byId(ds.people) }))
  files.set(
    'vehicles.json',
    stableStringify({ format: FORMAT, vehicleTypes: byId(ds.vehicleTypes), vehicleUnits: byId(ds.vehicleUnits) }),
  )
  const years = new Map<string, Trip[]>()
  for (const t of ds.trips) {
    const y = /^\d{4}/.exec(t.date)?.[0] ?? 'undated'
    years.set(y, [...(years.get(y) ?? []), t])
  }
  for (const [y, trips] of years) files.set(`trips/${y}.json`, stableStringify({ format: FORMAT, trips: byId(trips) }))
  return files
}

export function parse(files: Map<string, string>): Dataset {
  const ds: Dataset = { trips: [], vehicleTypes: [], vehicleUnits: [], people: [] }
  for (const [path, text] of files) {
    const j = JSON.parse(text) as Partial<Dataset>
    if (path === 'people.json') ds.people.push(...(j.people ?? []))
    else if (path === 'vehicles.json') {
      ds.vehicleTypes.push(...(j.vehicleTypes ?? []))
      ds.vehicleUnits.push(...(j.vehicleUnits ?? []))
    } else ds.trips.push(...(j.trips ?? []))
  }
  return ds
}

export interface SyncResult {
  pulled: number
  pushed: number
}

/** Pulls every file, merges into the local database and pushes the files whose content changed. */
export async function syncWithGitHub(cfg: GhConfig, deviceName = 'device'): Promise<SyncResult> {
  if (!(await repoInfo(cfg)).private) throw new Error(`${cfg.owner}/${cfg.repo} is public; trips are only synced to a private repository`)
  for (let attempt = 0; ; attempt++) {
    const paths = ['people.json', 'vehicles.json', ...(await listDir(cfg, 'trips')).map((n) => `trips/${n}`)]
    const remote = new Map<string, { sha: string; text: string }>()
    await Promise.all(
      paths.map(async (p) => {
        const f = await getFile(cfg, p)
        if (f) remote.set(p, f)
      }),
    )
    const remoteData = parse(new Map([...remote].map(([p, f]) => [p, f.text])))
    const merged = await mergeIntoLocal(remoteData)
    const out = serialize(merged)
    let pushed = 0
    try {
      for (const [path, text] of out) {
        const cur = remote.get(path)
        if (cur?.text === text) continue
        await putFile(cfg, path, text, cur?.sha, `Sync ${path} from ${deviceName}`)
        pushed++
      }
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) continue
      throw e
    }
    const pulled = Object.values(remoteData).reduce((n, xs: unknown[]) => n + xs.length, 0)
    return { pulled, pushed }
  }
}
