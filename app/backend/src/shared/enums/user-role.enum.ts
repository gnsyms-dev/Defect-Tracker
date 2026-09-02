// Lives in shared/, not in the auth module, because three consumers outside auth
// depend on it: the RolesGuard, the @Roles() decorator, and the inspections module's
// scope derivation. That is exactly the project-structure convention's test for
// shared -- "reused across modules but not owned by any one feature".
//
// The operative constraint on everything in src/shared/ is that it must not import
// from src/modules/. This file imports nothing at all.
export enum UserRole {
  Supervisor = 'supervisor',
  QaManager = 'qa_manager',
}
