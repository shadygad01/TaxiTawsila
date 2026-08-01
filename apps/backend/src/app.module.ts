import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { LoggerModule } from './common/logging/logger.module';
import { HealthModule } from './common/monitoring/health.module';
import { MetricsModule } from './common/monitoring/metrics.module';
import { SecurityModule } from './common/security/security.module';
import { RolesGuard } from './common/security/roles.guard';
import { EventBusModule } from './platform/event-bus/event-bus.module';
import { ConfigurationModule } from './modules/configuration/interface/configuration.module';
import { AdminModule } from './modules/admin/interface/admin.module';
import { IdentityModule } from './modules/identity/interface/identity.module';
import { TripModule } from './modules/trip/interface/trip.module';
import { FarePolicyModule } from './modules/farepolicy/interface/farepolicy.module';
import { TrustModule } from './modules/trust/interface/trust.module';
import { RewardModule } from './modules/reward/interface/reward.module';
import { AdvertisingModule } from './modules/advertising/interface/advertising.module';
import { DataQualityModule } from './modules/dataquality/interface/dataquality.module';
import { FeatureModule } from './modules/feature/interface/feature.module';

/**
 * Composition root (Architecture §1/§3). Every bounded context is wired here
 * as a real Nest module — 8 of the 10 are empty stubs in Phase 2 (Identity,
 * Trip, Fare Policy, Trust, Reward, Advertising, Data Quality, Feature — see
 * each module's own README for why), Configuration and Admin have their
 * Phase 2 infrastructure (versioned-config framework + City; audit log),
 * and the platform Event Bus is fully implemented and ready for the first
 * real publisher/consumer.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        username: process.env.DATABASE_USER ?? 'postgres',
        password: process.env.DATABASE_PASSWORD ?? 'postgres',
        database: process.env.DATABASE_NAME ?? 'taxitawsila',
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    LoggerModule,
    HealthModule,
    MetricsModule,
    SecurityModule,
    EventBusModule,
    ConfigurationModule,
    AdminModule,
    IdentityModule,
    TripModule,
    FarePolicyModule,
    TrustModule,
    RewardModule,
    AdvertisingModule,
    DataQualityModule,
    FeatureModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
