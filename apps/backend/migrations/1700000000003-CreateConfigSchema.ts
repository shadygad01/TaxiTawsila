import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * config schema (Database Schema §2). Phase 2 creates only config.city — the
 * reference data every other schema's city_id FK depends on. The full
 * versioned-config aggregate inventory (TrustThresholdConfig,
 * FraudThresholdConfig, GpsThresholdConfig, DataQualityThresholdConfig,
 * RewardRuleConfig, AdvertisingTargetConfig, RateLimitConfig) is added by the
 * modules that own their business rules, in later phases — this migration
 * establishes the schema and its one Phase-2-scoped table.
 */
export class CreateConfigSchema1700000000003 implements MigrationInterface {
  name = 'CreateConfigSchema1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS config`);

    await queryRunner.query(`
      CREATE TABLE config.city (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         TEXT NOT NULL,
        country      TEXT NOT NULL DEFAULT 'Egypt',
        bounds       GEOMETRY(POLYGON, 4326) NOT NULL,
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_city_bounds ON config.city USING GIST (bounds)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS config.city`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS config`);
  }
}
