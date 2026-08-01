import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEntryEntity } from './entities/outbox-entry.entity';
import { OutboxDeadLetterEntity } from './entities/outbox-dead-letter.entity';
import { EventConsumptionLogEntity } from './entities/event-consumption-log.entity';
import { ProvenanceLogEntryEntity } from './entities/provenance-log-entry.entity';
import { OutboxPublisherService } from './outbox-publisher.service';
import { OutboxRelayService } from './outbox-relay.service';

/**
 * Event Bus / Transactional Outbox (ADR-0011, ADR-0023, ADR-0024).
 *
 * `OutboxRelayService` is exported without any registered consumers wired in
 * — Phase 2 has no business modules publishing real events yet. Each module
 * that publishes/consumes events (Trust, Data Quality, Reward — Phase 3+)
 * registers its `EventConsumer` implementations via this module once it
 * exists, following the pattern already proven by this module's tests.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEntryEntity,
      OutboxDeadLetterEntity,
      EventConsumptionLogEntity,
      ProvenanceLogEntryEntity,
    ]),
  ],
  providers: [
    OutboxPublisherService,
    {
      provide: OutboxRelayService,
      useFactory: (
        outboxRepo: Repository<OutboxEntryEntity>,
        consumptionLogRepo: Repository<EventConsumptionLogEntity>,
        deadLetterRepo: Repository<OutboxDeadLetterEntity>,
      ) => new OutboxRelayService(outboxRepo, consumptionLogRepo, deadLetterRepo, []),
      inject: [
        getRepositoryToken(OutboxEntryEntity),
        getRepositoryToken(EventConsumptionLogEntity),
        getRepositoryToken(OutboxDeadLetterEntity),
      ],
    },
  ],
  exports: [OutboxPublisherService, OutboxRelayService, TypeOrmModule],
})
export class EventBusModule {}
