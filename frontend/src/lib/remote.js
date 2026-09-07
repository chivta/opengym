// Mobile build only: "connect to my server" mode (see mobile.js's header comment for why the
// mobile flavor has no backend at all by default). This is the alternative — pairing the app to
// an already self-hosted openGym server instead of keeping data device-local.
//
// Passkeys can't be used from inside the app's own WebView (its origin never matches the
// server's RP_ID), so there are two other ways in, both ending at the same bearer token:
// a short one-time code redeemed from an already signed-in browser tab (Settings → "Pair the
// mobile app", see /api/pair/create + /api/pair/redeem), or the account's name and password
// (/api/password/login), which needs no second device to be signed in anywhere.
import { pairRedeem, passwordConnect, setRemoteAuth } from './api.js'
import { loadRemoteFile, saveRemoteFile } from './mobile.js'

// Accepts what someone actually types: bare host, no scheme, trailing slash, stray whitespace.
// Defaults to https:// (self-hosting docs already push for HTTPS; the one exception, localhost,
// still parses fine without a scheme). Returns null for anything that isn't a usable URL at all.
export function normalizeServerUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s
  try {
    const u = new URL(withScheme)
    if (!u.hostname) return null
    return u.origin
  } catch (e) { return null }
}

export async function loadRemote() {
  return loadRemoteFile()
}

export async function chooseLocal() {
  await saveRemoteFile({ mode: 'local' })
}

export async function forgetRemote() {
  await saveRemoteFile({ mode: 'local' })
  setRemoteAuth('', null)
}

// Redeems the pairing code, wires api.js at the resolved base, and persists the connection so
// boot() can restore it on the next launch.
export async function connect(rawUrl, code) {
  return finish(rawUrl, base => pairRedeem(base, String(code || '').trim()))
}

// The same connection, proved with a name and a password instead of a pairing code. Needed
// because a pairing code can only be minted from a browser tab that is already signed in, and
// a phone being set up on its own has no such tab.
export async function connectWithPassword(rawUrl, name, password) {
  return finish(rawUrl, base => passwordConnect(base, String(name || '').trim(), String(password || '')))
}

// Both routes hand back the same { token, user }, so everything after the exchange is shared.
async function finish(rawUrl, exchange) {
  const base = normalizeServerUrl(rawUrl)
  if (!base) throw new Error('Enter a valid server address')
  const { token, user } = await exchange(base)
  setRemoteAuth(base, token)
  await saveRemoteFile({ mode: 'remote', base, token, user })
  return user
}
