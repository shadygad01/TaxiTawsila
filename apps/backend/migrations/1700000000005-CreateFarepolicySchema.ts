import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * farepolicy schema (Database Schema §1). Schema-only migration — this
 * bounded context's module is a wired, empty stub in Phase 2 (see
 * src/modules/farepolicy/README.md); its owning module adds real tables in the
 * phase that implements its business logic. Creating the schema now keeps
 * migration ownership 1:1 with module ownership from day one (Coding
 * Standards §2), rather than retrofitting it later.
 */
export class CreateFarePolicySchema1700000000005 implements MigrationInterface {
  name = 'CreateFarePolicySchema1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS farepolicy`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS farepolicy`);
  }
}
