// @vitest-environment happy-dom

// The mobile app in "connect to my server" mode, launched with no network.
//
// The file mirror is written in this mode as well as the local-only one, but boot() only ever
// read it back on the local path, so an eviction of the WebView's localStorage that happened to
// coincide with being offline came up as an empty app standing next to a perfectly good file.
// The second test here is the one that matters: the restored copy has to keep the mirror's own
// timestamp, because _ts is what decides who wins against the server, and a mirror stamped
// "now" would outrank the newer state waiting on the server and be pushed over it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const savedMirror = { _ts: 1000, routines: [{ id: 'from-file', name: 'From the file', ex: [] }] }
const remoteFile = { mode: 'remote', base: 'https://gym.example.com', token: 'tok', user: { id: 'u1', name: 'Artem' } }

vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.reject(new Error('offline'))),
  setRemoteAuth: vi.fn()
}))
vi.mock('../lib/mobile.js', () => ({
  MOBILE: true,
  nativeLoad: vi.fn(() => Promise.resolve(savedMirror)),
  nativeSave: vi.fn(),
  syncReminder: vi.fn(),
  initReminderSync: vi.fn(),
  writeAutoBackup: vi.fn()
}))
vi.mock('../lib/remote.js', () => ({
  loadRemote: vi.fn(() => Promise.resolve(remoteFile)),
  chooseLocal: vi.fn(),
  forgetRemote: vi.fn(),
  connect: vi.fn(),
  connectWithPassword: vi.fn()
}))
vi.mock('../lib/coach-device.js', () => ({
  loadCoachDevice: vi.fn(() => Promise.resolve(null)),
  saveCoachDevice: vi.fn(),
  coachDeviceSettings: () => null
}))

import { DEF, restoredStateFor, useStore } from './useStore.js'

const clone = value => JSON.parse(JSON.stringify(value))

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: false })
})

describe('paired mobile app booting offline', () => {
  it('restores the file mirror when localStorage was evicted and the server is unreachable', async () => {
    await useStore.getState().boot()

    expect(useStore.getState().S.routines.map(r => r.id)).toEqual(['from-file'])
    // Still signed in: only a 401 means the token is actually gone, and there was no reply here.
    expect(useStore.getState().user).toEqual(remoteFile.user)
    expect(useStore.getState().ready).toBe(true)
  })

  it('keeps the mirror timestamp so the server copy still wins once back online', async () => {
    await useStore.getState().boot()

    expect(useStore.getState().S._ts).toBe(savedMirror._ts)
    // Which is the whole point: a newer server state must still be adopted on the next launch.
    const remote = { ...clone(DEF), _ts: savedMirror._ts + 1, routines: [{ id: 'from-server', name: 'Server', ex: [] }] }
    expect(restoredStateFor(useStore.getState().S, remote)).not.toBeNull()
  })
})
