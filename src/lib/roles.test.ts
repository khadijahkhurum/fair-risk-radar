import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, atLeast, ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "./roles";

test("the ordering is total and ascending", () => {
  for (let i = 0; i < ROLES.length; i++) {
    for (let j = 0; j < ROLES.length; j++) {
      assert.equal(atLeast(ROLES[i], ROLES[j]), i >= j, `${ROLES[i]} >= ${ROLES[j]}`);
    }
  }
});

test("a viewer cannot do anything above read", () => {
  assert.equal(atLeast("VIEWER", "ANALYST"), false);
  assert.equal(atLeast("VIEWER", "CONTROL_OWNER"), false);
  assert.equal(atLeast("VIEWER", "ADMIN"), false);
  assert.equal(atLeast("VIEWER", "VIEWER"), true);
});

test("an analyst cannot set control coverage — that is the S5 boundary", () => {
  assert.equal(atLeast("ANALYST", "CONTROL_OWNER"), false);
});

test("admin outranks everything", () => {
  for (const r of ROLES) assert.equal(atLeast("ADMIN", r), true);
});

test("every role has a label and a description", () => {
  for (const r of ROLES) {
    assert.ok(ROLE_LABEL[r as Role]?.length > 0);
    assert.ok(ROLE_DESCRIPTION[r as Role]?.length > 0);
  }
});
