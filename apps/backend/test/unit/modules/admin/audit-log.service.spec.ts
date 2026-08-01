import { AuditLogService } from '../../../../src/modules/admin/application/audit-log.service';

describe('AuditLogService', () => {
  it('records an audit entry with before/after state via the shared write path', async () => {
    const saved: unknown[] = [];
    const repo = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockImplementation(async (row) => {
        saved.push(row);
        return { id: '1', createdAt: new Date(), ...row };
      }),
    };
    const service = new AuditLogService(repo as any);

    const result = await service.record({
      adminUserId: 'admin-1',
      action: 'PUBLISH_CONFIG',
      entityType: 'TrustThresholdConfig',
      entityId: 'config-1',
      before: null,
      after: { minVerifiedScore: 70 },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ adminUserId: 'admin-1', action: 'PUBLISH_CONFIG' }),
    );
    expect(saved).toHaveLength(1);
    expect(result.entityType).toBe('TrustThresholdConfig');
  });

  it('defaults before/after to null when not provided', async () => {
    const repo = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockImplementation(async (row) => ({ id: '2', createdAt: new Date(), ...row })),
    };
    const service = new AuditLogService(repo as any);

    await service.record({ adminUserId: 'admin-1', action: 'LOGIN', entityType: 'AdminUser', entityId: 'admin-1' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ before: null, after: null }));
  });
});
