import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, newSessionToken, hashSessionToken } from "./password";

test("a correct password verifies", async () => {
  const h = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", h), true);
});

test("a wrong password does not verify", async () => {
  const h = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse batterz", h), false);
  assert.equal(await verifyPassword("", h), false);
});

test("the same password hashes differently every time (random salt)", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

test("the stored hash contains no plaintext and carries its parameters", async () => {
  const h = await hashPassword("hunter2hunter2");
  assert.ok(!h.includes("hunter2"));
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
});

test("trivially short passwords are refused at the boundary", async () => {
  await assert.rejects(() => hashPassword("short"));
});

test("malformed stored hashes verify false rather than throwing", async () => {
  for (const bad of ["", "nonsense", "scrypt$1$2$3", "bcrypt$1$2$3$4$5", "scrypt$x$y$z$$"]) {
    assert.equal(await verifyPassword("anything", bad), false, `stored: ${bad}`);
  }
});

test("session tokens are unique and high-entropy", () => {
  const seen = new Set(Array.from({ length: 500 }, () => newSessionToken()));
  assert.equal(seen.size, 500);
  assert.ok(newSessionToken().length >= 42);
});

test("only the token hash is storable, and it is deterministic", () => {
  const t = newSessionToken();
  assert.equal(hashSessionToken(t), hashSessionToken(t));
  assert.notEqual(hashSessionToken(t), t);
  assert.notEqual(hashSessionToken(t), hashSessionToken(newSessionToken()));
});
