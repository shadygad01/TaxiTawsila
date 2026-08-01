import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * config.city (Database Schema §2). Not a versioned-config aggregate — City
 * itself has no DRAFT/ACTIVE/SUPERSEDED lifecycle, it's simple reference data
 * every other schema's city_id FK points at (Architecture §10). Alexandria is
 * seeded as the first row (migrations/*-seed-alexandria.ts), not a hardcoded
 * assumption anywhere in code.
 */
@Entity({ name: 'city', schema: 'config' })
export class CityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: 'Egypt' })
  country!: string;

  @Index('idx_city_bounds', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  bounds!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
