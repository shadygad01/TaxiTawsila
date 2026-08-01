import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * advertising schema (Database Schema §1). Schema-only migration — this
 * bounded context's module is a wired, empty stub in Phase 2 (see
 * src/modules/advertising/README.md); its owning module adds real tables in the
 * phase that implements its business logic. Creating the schema now keeps
 * migration ownership 1:1 with module ownership from day one (Coding
 * Standards §2), rather than retrofitting it later.
 */
export class CreateAdvertisingSchema1700000000010 implements MigrationInterface {
  name = 'CreateAdvertisingSchema1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS advertising`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS advertising`);
  }
}
