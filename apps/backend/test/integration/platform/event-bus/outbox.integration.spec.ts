import { DataSource, Repository } from 'typeorm';
import { testDatabaseConfigFromEnv } from '@taxitawsila/testing-utils';
import { OutboxEntryEntity } from '../../../../src/platform/event-bus/entities/outbox-entry.entity';
import { OutboxDeadLetterEntity } from '../../../../src/platform/event-bus/entities/outbox-dead-letter.entity';
import { EventConsumptionLogEntity } from '../../../../src/platform/event-bus/entities/event-consumption-log.entity';
import { OutboxPublisherService } from '../../../../src/platform/event-bus/outbox-publisher.service';
import { OutboxRelayService } from '../../../../src/platform/event-bus/outbox-relay.service';
import { EventConsumer } from '../../../../src/platform/event-bus/event-consumer';

/**
 * Exercises the outbox against the real Postgres schema created by
 * `apps/backend/migrations` (Testing Strategy §2 — no mocked DB for
 * repository-level correctness). Requires migrations to have been run first
 * (`pnpm migration:run`), matching how CI runs it (.github/workflows/ci.yml).
 */
describe('Outbox (integration)', () => {
  let dataSource: DataSource;
  let outboxRepo: Repository<OutboxEntryEntity>;
  let deadLetterRepo: Repository<OutboxDeadLetterEntity>;
  let consumptionLogRepo: Repository<EventConsumptionLogEntity>;

  beforeAll(async () => {
    const config = testDatabaseConfigFromEnv();
    dataSource = new DataSource({
      type: 'postgres',
      // TypeORM's DataSourceOptions field is `username`; testing-utils models
      // its config after `pg`'s Client, which uses `user` — map explicitly
      // rather than spreading, so this doesn't silently drop the credential.
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      database: config.database,
      entities: [OutboxEntryEntity, OutboxDeadLetterEntity, EventConsumptionLogEntity],
      synchronize: false,
    });
    await dataSource.initialize();
    outboxRepo = dataSource.getRepository(OutboxEntryEntity);
    deadLetterRepo = dataSource.getRepository(OutboxDeadLetterEntity);
    consumptionLogRepo = dataSource.getRepository(EventConsumptionLogEntity);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await consumptionLogRepo.query('DELETE FROM platform.event_consumption_log');
    await deadLetterRepo.query('DELETE FROM platform.outbox_dead_letter');
    await outboxRepo.query('DELETE FROM platform.outbox');
  });

  it('publishes a real row within a transaction and the relay dispatches it exactly once', async () => {
    const publisher = new OutboxPublisherService();

    await dataSource.transaction(async (manager) => {
      await publisher.publish(manager, {
        eventType: 'TripCompleted',
        eventVersion: 1,
        aggregateType: 'Trip',
        aggregateId: '11111111-1111-1111-1111-111111111111',
        correlationId: '22222222-2222-2222-2222-222222222222',
        occurredAt: new Date(),
        payload: { tripId: '11111111-1111-1111-1111-111111111111' },
      });
    });

    const handled: string[] = [];
    const consumer: EventConsumer = {
      name: 'test-consumer',
      handles: (eventType) => eventType === 'TripCompleted',
      handle: async (entry) => {
        handled.push(entry.id);
      },
    };

    const relay = new OutboxRelayService(outboxRepo, consumptionLogRepo, deadLetterRepo, [consumer]);
    const firstPass = await relay.pollAndDispatch();
    const secondPass = await relay.pollAndDispatch();

    expect(handled).toHaveLength(1);
    expect(firstPass.processed).toBe(1);
    expect(secondPass.processed).toBe(0); // already dispatched, not picked up again
  });

  it('rolls back the outbox insert if the caller transaction rolls back (same-transaction guarantee)', async () => {
    const publisher = new OutboxPublisherService();

    await expect(
      dataSource.transaction(async (manager) => {
        await publisher.publish(manager, {
          eventType: 'TripCompleted',
          eventVersion: 1,
          aggregateType: 'Trip',
          aggregateId: '33333333-3333-3333-3333-333333333333',
          correlationId: '44444444-4444-4444-4444-444444444444',
          occurredAt: new Date(),
          payload: {},
        });
        throw new Error('simulated failure after publish, before commit');
      }),
    ).rejects.toThrow('simulated failure');

    const rows = await outboxRepo.find();
    expect(rows).toHaveLength(0);
  });
});
