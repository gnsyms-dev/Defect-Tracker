// A const object plus a union type, NOT a TS enum: tsconfig sets erasableSyntaxOnly,
// which bans enums on the frontend outright. The values match the backend's
// varchar + CHECK constraint.
export const UserRole = {
  Supervisor: 'supervisor',
  QaManager: 'qa_manager',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Capability predicates rather than role checks scattered through the UI.
 *
 * Components ask "can this user resolve?" instead of "is this user a QA manager?",
 * so adding a third role later touches this file rather than every screen.
 */
export function canLogInspections(role: UserRole): boolean {
  return role === UserRole.Supervisor;
}

export function canResolveInspections(role: UserRole): boolean {
  return role === UserRole.QaManager;
}

export function canViewAllPlants(role: UserRole): boolean {
  return role === UserRole.QaManager;
}

export function roleLabel(role: UserRole): string {
  return role === UserRole.Supervisor ? 'Supervisor' : 'QA Manager';
}
