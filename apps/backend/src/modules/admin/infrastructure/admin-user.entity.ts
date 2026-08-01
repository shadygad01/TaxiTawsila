import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * admin.admin_user (Database Schema §11). No CHECK constraint on `role` by
 * design — the AdminRole union (shared-contracts) is the compile-time source
 * of truth, so adding a role is a data change, not a migration.
 */
@Entity({ name: 'admin_user', schema: 'admin' })
export class AdminUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
