// Role model for the API (audit S1's RBAC half).
//
// Roles are a total order, so every permission check is "at least this rank".
// That keeps authorisation decisions as one comparison instead of a matrix
// nobody maintains.
export const ROLES = ["VIEWER", "ANALYST", "CONTROL_OWNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  ANALYST: 1,
  CONTROL_OWNER: 2,
  ADMIN: 3,
};

export function atLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const ROLE_LABEL: Record<Role, string> = {
  VIEWER: "Viewer",
  ANALYST: "Analyst",
  CONTROL_OWNER: "Control owner",
  ADMIN: "Admin",
};

// What each role is for, shown on the sign-in screen so the demo explains its
// own access model rather than needing a separate page.
export const ROLE_DESCRIPTION: Record<Role, string> = {
  VIEWER: "Read the register, posture and exports. Changes nothing.",
  ANALYST: "Run and persist simulations, create and update risks.",
  CONTROL_OWNER: "Everything an analyst can do, plus set control coverage and attach evidence.",
  ADMIN: "Full access, including the audit trail, sign-off and organisation settings.",
};
