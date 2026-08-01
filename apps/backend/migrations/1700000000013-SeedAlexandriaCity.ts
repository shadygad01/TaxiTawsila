import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds Alexandria as the first row in config.city (Architecture §10:
 * "Alexandria is the first row, not a hardcoded assumption"). The bounds
 * polygon here is a coarse approximation of the Alexandria governorate
 * coastline — precise enough for Phase 2 (no geospatial queries depend on it
 * yet); refining it is a Phase 4 (Maps Platform) concern, not this
 * migration's.
 */
export class SeedAlexandriaCity1700000000013 implements MigrationInterface {
  name = 'SeedAlexandriaCity1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO config.city (name, country, bounds, active)
      VALUES (
        'Alexandria',
        'Egypt',
        ST_GeomFromText('POLYGON((29.75 31.10, 30.15 31.10, 30.15 31.35, 29.75 31.35, 29.75 31.10))', 4326),
        TRUE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM config.city WHERE name = 'Alexandria'`);
  }
}
