import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CityEntity } from '../infrastructure/city.entity';
import { CityService } from '../infrastructure/city.service';

/**
 * Configuration Context (Domain Model §9). Phase 2 scope: the generic
 * versioned-config framework (`domain/versioned-config.service.ts`, framework-
 * free, no NestJS wiring needed) and `CityEntity`/`CityService` — the one
 * piece of real config data every future module's city_id FK depends on. No
 * business-rule config aggregates (TrustThresholdConfig, FarePolicyVersion,
 * etc.) are implemented yet — those belong to the modules that own them,
 * built in later phases, plugging into the versioned-config framework
 * already proven here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CityEntity])],
  providers: [CityService],
  exports: [CityService, TypeOrmModule],
})
export class ConfigurationModule {}
