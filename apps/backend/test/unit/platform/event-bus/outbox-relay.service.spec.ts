import { OutboxRelayService } from '../../../../src/platform/event-bus/outbox-relay.service';
import { OutboxEntryEntity } from '../../../../src/platform/event-bus/entities/outbox-entry.entity';
import { EventConsumer } from '../../../../src/platform/event-bus/event-consumer';

function makeRow(overrides: Partial<OutboxEntryEntity> = {}): OutboxEntryEntity {
  return {
    id: '1',
    eventType: 'TripCompleted',
    eventVersion: 1,
    aggregateType: 'Trip',
    aggregateId: 'trip-1',
    correlationId: 'corr-1',
    payload: {},
    createdAt: new Date(),
    dispatchedAt: null,
    attempts: 0,
    ...overrides,
  };
}

function makeConsumer(name: string, handles: boolean, impl: (row: OutboxEntryEntity) => Promise<void>): EventConsumer {
  return {
    name,
    handles: () => handles,
    handle: impl,
  };
}

describe('OutboxRelayService', () => {
  function buildRepos(row: OutboxEntryEntity) {
    const outboxRepo = {
      find: jest.fn().mockResolvedValue([row]),
      save: jest.fn().mockImplementation(async (r) => r),
    };
    const consumptionLogRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const deadLetterRepo = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    return { outboxRepo, consumptionLogRepo, deadLetterRepo };
  }

  it('marks a row dispatched once every applicable consumer succeeds', async () => {
    const row = makeRow();
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = makeConsumer('trust-engine', true, handler);

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      consumer,
    ]);

    const result = await relay.pollAndDispatch();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(consumptionLogRepo.insert).toHaveBeenCalledWith({ consumerName: 'trust-engine', outboxEventId: '1' });
    expect(row.dispatchedAt).not.toBeNull();
    expect(result).toEqual({ processed: 1, deadLettered: 0 });
  });

  it('skips a consumer not applicable to this event type', async () => {
    const row = makeRow();
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = makeConsumer('advertising', false, handler);

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      consumer,
    ]);

    await relay.pollAndDispatch();

    expect(handler).not.toHaveBeenCalled();
    expect(row.dispatchedAt).not.toBeNull(); // no applicable consumers => nothing to fail => dispatched
  });

  it('is idempotent: a consumer already recorded in event_consumption_log is not re-invoked', async () => {
    const row = makeRow();
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    consumptionLogRepo.findOneBy.mockResolvedValue({ consumerName: 'trust-engine', outboxEventId: '1' });
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = makeConsumer('trust-engine', true, handler);

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      consumer,
    ]);

    await relay.pollAndDispatch();

    expect(handler).not.toHaveBeenCalled();
    expect(row.dispatchedAt).not.toBeNull();
  });

  it('a second, legitimate event for the same aggregate is processed independently (ADR-0023)', async () => {
    // Two distinct outbox rows for the same aggregate/event type (e.g. an original
    // DataQualityAssessed and a post-CORRECTED re-assessment) must each be
    // processed once — proving idempotency keys on the outbox row id, not on
    // (eventType, aggregateId).
    const firstRow = makeRow({ id: '1' });
    const secondRow = makeRow({ id: '2' });
    const outboxRepo = {
      find: jest.fn().mockResolvedValue([firstRow, secondRow]),
      save: jest.fn().mockImplementation(async (r) => r),
    };
    const processedKeys = new Set<string>();
    const consumptionLogRepo = {
      findOneBy: jest.fn().mockImplementation(async ({ consumerName, outboxEventId }) =>
        processedKeys.has(`${consumerName}:${outboxEventId}`) ? { consumerName, outboxEventId } : null,
      ),
      insert: jest.fn().mockImplementation(async ({ consumerName, outboxEventId }) => {
        processedKeys.add(`${consumerName}:${outboxEventId}`);
      }),
    };
    const deadLetterRepo = { create: jest.fn().mockImplementation((input) => input), save: jest.fn() };
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = makeConsumer('data-quality-engine', true, handler);

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      consumer,
    ]);

    await relay.pollAndDispatch();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(firstRow.dispatchedAt).not.toBeNull();
    expect(secondRow.dispatchedAt).not.toBeNull();
  });

  it('increments attempts and does not dispatch when a consumer fails, below the retry ceiling', async () => {
    const row = makeRow({ attempts: 1 });
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    const handler = jest.fn().mockRejectedValue(new Error('transient failure'));
    const consumer = makeConsumer('reward-engine', true, handler);

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      consumer,
    ]);

    const result = await relay.pollAndDispatch();

    expect(row.attempts).toBe(2);
    expect(row.dispatchedAt).toBeNull();
    expect(deadLetterRepo.save).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(0);
  });

  it('moves a row to the dead letter table once max_attempts is reached (ADR-0024)', async () => {
    const row = makeRow({ attempts: 4 });
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    const handler = jest.fn().mockRejectedValue(new Error('poison event'));
    const consumer = makeConsumer('trust-engine', true, handler);

    const relay = new OutboxRelayService(
      outboxRepo as any,
      consumptionLogRepo as any,
      deadLetterRepo as any,
      [consumer],
      5,
    );

    const result = await relay.pollAndDispatch();

    expect(row.attempts).toBe(5);
    expect(deadLetterRepo.save).toHaveBeenCalledTimes(1);
    expect(deadLetterRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ originalOutboxId: '1', totalAttempts: 5, lastError: 'poison event' }),
    );
    // Dead-lettered rows are still marked dispatched (removed from the active
    // undispatched queue) — the row itself is retained, per append-only design.
    expect(row.dispatchedAt).not.toBeNull();
    expect(result.deadLettered).toBe(1);
  });

  it('does not dispatch a row until ALL applicable consumers have succeeded', async () => {
    const row = makeRow();
    const { outboxRepo, consumptionLogRepo, deadLetterRepo } = buildRepos(row);
    const succeeding = makeConsumer('trust-engine', true, jest.fn().mockResolvedValue(undefined));
    const failing = makeConsumer('data-quality-engine', true, jest.fn().mockRejectedValue(new Error('boom')));

    const relay = new OutboxRelayService(outboxRepo as any, consumptionLogRepo as any, deadLetterRepo as any, [
      succeeding,
      failing,
    ]);

    await relay.pollAndDispatch();

    expect(consumptionLogRepo.insert).toHaveBeenCalledWith({ consumerName: 'trust-engine', outboxEventId: '1' });
    expect(row.dispatchedAt).toBeNull();
    expect(row.attempts).toBe(1);
  });
});
