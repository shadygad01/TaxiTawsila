import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * platform schema (Database Schema §1.1): the transactional outbox (ADR-0011),
 * its dead-letter table (ADR-0024), the corrected idempotency mechanism
 * (event_consumption_log, ADR-0023), and the provenance log (ADR-0022).
 * Migrates last per Database Schema §12's dependency order — nothing in any
 * other schema references platform.* by FK, so ordering here is about
 * consistency with the documented sequence, not a hard dependency.
 */
export class CreatePlatformSchema1700000000012 implements MigrationInterface {
  name = 'CreatePlatformSchema1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS platform`);

    await queryRunner.query(`
      CREATE TABLE platform.outbox (
        id              BIGSERIAL PRIMARY KEY,
        event_type      TEXT NOT NULL,
        event_version   INT NOT NULL DEFAULT 1,
        aggregate_type  TEXT NOT NULL,
        aggregate_id    UUID NOT NULL,
        correlation_id  UUID NOT NULL,
        payload         JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        dispatched_at   TIMESTAMPTZ,
        attempts        INT NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_outbox_undispatched ON platform.outbox (created_at) WHERE dispatched_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX idx_outbox_aggregate ON platform.outbox (aggregate_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_outbox_correlation ON platform.outbox (correlation_id)`);

    await queryRunner.query(`
      CREATE TABLE platform.outbox_dead_letter (
        id                     BIGSERIAL PRIMARY KEY,
        original_outbox_id     BIGINT NOT NULL,
        event_type             TEXT NOT NULL,
        event_version          INT NOT NULL,
        aggregate_type         TEXT NOT NULL,
        aggregate_id           UUID NOT NULL,
        correlation_id         UUID NOT NULL,
        payload                JSONB NOT NULL,
        total_attempts         INT NOT NULL,
        last_error             TEXT,
        failed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        requeued_at            TIMESTAMPTZ,
        requeued_by_admin_id   UUID REFERENCES admin.admin_user(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_dead_letter_unresolved ON platform.outbox_dead_letter (failed_at) WHERE requeued_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE platform.event_consumption_log (
        consumer_name    TEXT NOT NULL,
        outbox_event_id  BIGINT NOT NULL,
        processed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (consumer_name, outbox_event_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE platform.provenance_log (
        id              BIGSERIAL PRIMARY KEY,
        entity_type     TEXT NOT NULL,
        entity_id       UUID NOT NULL,
        value           JSONB NOT NULL,
        source          TEXT NOT NULL,
        source_version  TEXT NOT NULL,
        recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_provenance_entity ON platform.provenance_log (entity_type, entity_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform.provenance_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform.event_consumption_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform.outbox_dead_letter`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform.outbox`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS platform`);
  }
}
