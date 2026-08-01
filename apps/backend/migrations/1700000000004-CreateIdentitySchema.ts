import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * identity schema (Database Schema §1). Schema-only migration — this
 * bounded context's module is a wired, empty stub in Phase 2 (see
 * src/modules/identity/README.md); its owning module adds real tables in the
 * phase that implements its business logic. Creating the schema now keeps
 * migration ownership 1:1 with module ownership from day one (Coding
 * Standards §2), rather than retrofitting it later.
 */
export class CreateIdentitySchema1700000000004 implements MigrationInterface {
  name = 'CreateIdentitySchema1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS identity`);
  }
}
