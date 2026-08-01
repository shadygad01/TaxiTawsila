import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CityEntity } from './city.entity';

/**
 * Minimal read/write access to config.city — deliberately thin: City is
 * reference data (Database Schema §2), not a place for business logic. Admin
 * CRUD for cities and public `/config/cities` (API Specification §6) are
 * Phase 3+/Phase 9 concerns; this is the repository they'll be built on.
 */
@Injectable()
export class CityService {
  constructor(@InjectRepository(CityEntity) private readonly repo: Repository<CityEntity>) {}

  findActive(): Promise<CityEntity[]> {
    return this.repo.find({ where: { active: true } });
  }

  findById(id: string): Promise<CityEntity | null> {
    return this.repo.findOne({ where: { id } });
  }
}
