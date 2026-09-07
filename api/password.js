/* Password hashing for the name-and-password sign-in, kept out of server.js so the routes
 * there stay about routing. Nothing else in the tree needs to know that this is scrypt, what
 * a salt is, or how the two halves are encoded.
 *
 * scrypt because it is in node:crypto. The api has three dependencies and that count is a
 * project rule, so bcrypt and argon2 are both out; scrypt is memory-hard and the only
 * password hash Node ships. */
import crypto from 'node:crypto';

// Shortest password the routes accept. Low on purpose: the instances this runs on sit behind
// a VPN or an invite code, where the threat is a typo, not an offline cracking rig.
export const PW_MIN = 8;

// Node's own defaults except for the 64-byte output. Bumping N here re-costs every future
// hash; existing records keep verifying because the stored hash carries its own length.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SALT_BYTES = 16;

// scrypt is deliberately slow, and scryptSync would hold the event loop for all of it. The
// api is a single process serving every user, so a sync hash would stall unrelated requests.
const derive = (plain, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(plain, salt, SCRYPT.keylen, SCRYPT, (err, key) => err ? reject(err) : resolve(key));
});

/** Hash a new password. The returned object is what goes on `user.pw` in db.json. */
export async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(String(plain), salt);
  return { salt: salt.toString('base64url'), hash: key.toString('base64url') };
}

/**
 * Check a password against a stored record. Returns false rather than throwing for anything
 * malformed: the caller is a login route, and a record that has been hand-edited in db.json
 * should read as "wrong password", not as a 500 that tells the caller the account exists.
 */
export async function verifyPassword(plain, rec) {
  if (!rec || typeof rec.salt !== 'string' || typeof rec.hash !== 'string') return false;
  const expected = Buffer.from(rec.hash, 'base64url');
  // base64url decoding never throws, it just stops at the first bad character, so a truncated
  // or corrupted field arrives here as a short buffer. timingSafeEqual would throw on the
  // length mismatch, and a hash that is not keylen bytes cannot be one we wrote anyway.
  if (expected.length !== SCRYPT.keylen) return false;
  const key = await derive(String(plain), Buffer.from(rec.salt, 'base64url'));
  return crypto.timingSafeEqual(key, expected);
}
