import { MigrationInterface, QueryRunner } from 'typeorm';

/** Database Schema §1: extensions required by every schema that follows. */
export class InitExtensions1700000000001 implements MigrationInterface {
  name = 'InitExtensions1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pgcrypto`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis`);
  }
}
