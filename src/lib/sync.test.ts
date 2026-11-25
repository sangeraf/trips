import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { emptyDraft, loadAll, saveTrip } from '../db/repo'
import { fromBase64, toBase64 } from './github'
import { syncWithGitHub } from './sync'

/** Minimal in-memory GitHub Contents API. */
function fakeGitHub() {
  const files = new Map<string, { sha: string; text: string }>()
  let n = 0
  let isPrivate = true
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (new URL(url).pathname === '/repos/me/data') return json({ private: isPrivate, default_branch: 'main', permissions: { push: true } })
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/me\/data\/contents\//, ''))
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body as string) as { content: string; sha?: string }
      const cur = files.get(path)
      if (cur && cur.sha !== body.sha) return json({ message: 'sha mismatch' }, 409)
      files.set(path, { sha: `sha${n++}`, text: fromBase64(body.content) })
      return json({})
    }
    const f = files.get(path)
    if (f) return json({ sha: f.sha, content: toBase64(f.text), encoding: 'base64', size: f.text.length })
    const dir = [...files.keys()].filter((k) => k.startsWith(`${path}/`))
    if (dir.length) return json(dir.map((k) => ({ name: k.slice(path.length + 1), type: 'file' })))
    return json({ message: 'Not Found' }, 404)
  })
  return { files, fetchMock, setPrivate: (v: boolean) => (isPrivate = v) }
}

const cfg = { owner: 'me', repo: 'data', branch: '', token: 't' }

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('syncWithGitHub', () => {
  it('pushes local data, then pulls changes made on another device', async () => {
    const gh = fakeGitHub()
    vi.stubGlobal('fetch', gh.fetchMock)
    await saveTrip({ ...emptyDraft('city'), date: '2026-03-01', line: '4', companions: ['Anna'] })
    await saveTrip({ ...emptyDraft('car'), date: '2025-12-31', driver: 'Béla', manufacturer: 'Skoda' })
    expect((await syncWithGitHub(cfg)).pushed).toBe(4)
    expect([...gh.files.keys()].sort()).toEqual(['people.json', 'trips/2025.json', 'trips/2026.json', 'vehicles.json'])
    expect((await syncWithGitHub(cfg)).pushed).toBe(0)

    const other = JSON.parse(gh.files.get('trips/2026.json')!.text)
    other.trips[0].line = '6'
    other.trips[0].updatedAt += 10_000
    gh.files.set('trips/2026.json', { sha: 'other', text: JSON.stringify(other) })
    await syncWithGitHub(cfg)
    const trip = (await loadAll()).trips.find((t) => t.date === '2026-03-01')!
    expect(trip.mode === 'city' && trip.line).toBe('6')
  })

  it('retries when another device pushed in between', async () => {
    const gh = fakeGitHub()
    let raced = false
    const racing = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT' && !raced) {
        raced = true
        gh.files.set('people.json', { sha: 'race', text: '{"people":[]}' })
      }
      return gh.fetchMock(url, init)
    })
    vi.stubGlobal('fetch', racing)
    await saveTrip({ ...emptyDraft('city'), companions: ['Anna'] })
    await syncWithGitHub(cfg)
    expect(JSON.parse(gh.files.get('people.json')!.text).people).toHaveLength(1)
  })

  it('refuses to sync to a public repository', async () => {
    const gh = fakeGitHub()
    gh.setPrivate(false)
    vi.stubGlobal('fetch', gh.fetchMock)
    await saveTrip(emptyDraft('city'))
    await expect(syncWithGitHub(cfg)).rejects.toThrow(/public/)
    expect(gh.files.size).toBe(0)
  })
})
