import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * admin schema (Database Schema §11). Migrates FIRST of all bounded-context
 * schemas — every versioned-config table across config/farepolicy/feature
 * carries a created_by_admin_id/approved_by_admin_id FK to admin_user.
 */
export class CreateAdminSchema1700000000002 implements MigrationInterface {
  name = 'CreateAdminSchema1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS admin`);

    await queryRunner.query(`
      CREATE TABLE admin.admin_user (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL UNIQUE,
        role        TEXT NOT NULL,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE admin.audit_log_entry (
        id             BIGSERIAL PRIMARY KEY,
        admin_user_id  UUID NOT NULL REFERENCES admin.admin_user(id),
        action         TEXT NOT NULL,
        entity_type    TEXT NOT NULL,
        entity_id      TEXT NOT NULL,
        before         JSONB,
        after          JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_audit_entity ON admin.audit_log_entry (entity_type, entity_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_admin_user ON admin.audit_log_entry (admin_user_id, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin.audit_log_entry`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin.admin_user`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS admin`);
  }
}
