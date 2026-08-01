# Administration Context

Phase 2 scope: `AdminUserEntity` (`admin.admin_user`) and `AuditLogService` (`admin.audit_log_entry`) — the two pieces of infrastructure every other module's admin-facing action depends on (an actor to attribute an action to, and a single shared write path to record it). The full admin dashboard composition layer — reads/manages across every context, the Trust/Data-Quality review queues, Fare Policy publishing UI, Feature Management UI — is a Phase 9 deliverable (Roadmap), built once there is something to administer.
