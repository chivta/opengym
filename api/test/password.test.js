/* The password hash, on its own. server.js calls .listen() at import time and exports nothing,
 * so the two routes around this module are not reachable from a test process; what is testable
 * is the part that decides whether a password is right, which is the part worth testing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PW_MIN, hashPassword, verifyPassword } from '../password.js';

test('a password verifies against its own hash', async () => {
  const rec = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', rec), true);
});

test('a wrong password does not', async () => {
  const rec = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse batterz', rec), false);
  assert.equal(await verifyPassword('', rec), false);
});

test('the same password hashes differently every time', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  // Different salts, and both still verify: the salt really is being used, not just stored.
  assert.equal(await verifyPassword('same password', a), true);
  assert.equal(await verifyPassword('same password', b), true);
});

// A login route must not turn a hand-edited db.json into a 500. Every one of these is a
// "wrong password" answer, not an exception.
test('a malformed record is false rather than an exception', async () => {
  for (const rec of [null, undefined, {}, { salt: 'abc' }, { hash: 'abc' }, { salt: 1, hash: 2 }]) {
    assert.equal(await verifyPassword('anything', rec), false);
  }
});

test('a truncated hash is false rather than an exception', async () => {
  const rec = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', { ...rec, hash: rec.hash.slice(0, 20) }), false);
  assert.equal(await verifyPassword('correct horse battery', { ...rec, hash: '!!!not base64!!!' }), false);
});

test('the empty string is hashable and verifies only against itself', async () => {
  const rec = await hashPassword('');
  assert.equal(await verifyPassword('', rec), true);
  assert.equal(await verifyPassword('x', rec), false);
});

test('PW_MIN is exported for the routes to enforce', () => {
  assert.equal(typeof PW_MIN, 'number');
  assert.ok(PW_MIN > 0);
});
