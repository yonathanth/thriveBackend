import { SiteService, parsePlanDescription } from './site.service';

/** A repository stand-in whose find() returns rows matching `where.entity` / `where.status`. */
function repo(rows: any[]) {
  return {
    find: jest.fn(async (opts: any = {}) => {
      const where = opts.where;
      if (Array.isArray(where)) {
        return rows.filter(r => where.some((w: any) => r.localId === w.localId));
      }
      return rows.filter(
        r =>
          (!where?.entity || r.entity === where.entity) &&
          (!where?.status || r.status === where.status),
      );
    }),
  } as any;
}

const record = (entity: string, localId: number, data: Record<string, unknown>) => ({
  entity,
  localId,
  data,
});

describe('SiteService', () => {
  const services = [
    { id: 10, localId: 1, name: 'Full Time', category: 'Gym', description: null, price: '2500.00', period: 30, status: 'active', usageType: 'unlimited', maxUsageCount: null, groupSize: null },
    { id: 11, localId: 2, name: 'Aerobics', category: 'Classes', description: 'x', price: '1800', period: 30, status: 'active', usageType: 'limited', maxUsageCount: 12, groupSize: null },
    { id: 12, localId: 3, name: 'Old', category: 'Gym', description: null, price: '100', period: 30, status: 'inactive', usageType: 'unlimited', maxUsageCount: null, groupSize: null },
  ];
  const staff = [{ localId: 7, fullName: 'Abel Tesfaye Kebede', phoneNumber: '0911000000' }];
  const records = [
    record('additional_service', 1, { name: 'Sauna', category: 'Wellness', price: 800, is_free: 0, status: 'active' }),
    record('additional_service', 2, { name: 'Locker', price: 50, is_free: 1, status: 'active' }),
    record('additional_service', 3, { name: 'Gone', price: 50, is_free: 0, status: 'inactive' }),
    record('additional_service_variant', 1, { additional_service_id: 1, name: 'Quarterly', period_days: 90, price: 2100, status: 'active', sort_order: 1 }),
    record('additional_service_variant', 2, { additional_service_id: 1, name: 'Monthly', period_days: 30, price: 800, status: 'active', sort_order: 0 }),
    record('additional_service_variant', 3, { additional_service_id: 1, name: 'Weekly', period_days: 7, price: 250, status: 'retired', sort_order: 2 }),
    record('schedule', 1, { name: 'Main', is_main: 1, is_active: 1 }),
    record('schedule', 2, { name: 'Other', is_main: 0, is_active: 1 }),
    record('schedule_item', 1, { schedule_id: 1, day_of_week: 3, title: 'Boxing', start_time: '18:00', end_time: '19:00' }),
    record('schedule_item', 2, { schedule_id: 1, day_of_week: 1, title: 'Aerobics', start_time: '06:00', end_time: '07:00', staff_id: 7, room: 'Studio' }),
    record('schedule_item', 3, { schedule_id: 2, day_of_week: 2, title: 'Not main', start_time: '20:00', end_time: '21:00' }),
    record('schedule_item', 4, { schedule_id: 1, day_of_week: 9, title: 'Bad day', start_time: '20:00', end_time: '21:00' }),
  ];

  const service = new SiteService(repo(services), repo(staff), repo(records));

  it('lists active plans with the desktop id and numeric prices', async () => {
    const { plans } = await service.getCatalog();
    expect(plans.map(p => p.id)).toEqual([1, 2]);
    expect(plans[0]).toMatchObject({ price: 2500, periodDays: 30, maxUsageCount: null });
    expect(plans[1]).toMatchObject({ maxUsageCount: 12 });
  });

  it('lists active add-ons with active variants in order, free ones at zero', async () => {
    const { addons } = await service.getCatalog();
    expect(addons.map(a => a.name)).toEqual(['Locker', 'Sauna']);
    expect(addons[0]).toMatchObject({ isFree: true, price: 0 });
    expect(addons[1].variants.map(v => v.name)).toEqual(['Monthly', 'Quarterly']);
  });

  it("returns the main schedule's valid classes in week order, trainer first name only", async () => {
    const { classes } = await service.getCatalog();
    expect(classes.map(c => c.title)).toEqual(['Aerobics', 'Boxing']);
    expect(classes[0]).toMatchObject({ dayOfWeek: 1, trainer: 'Abel', room: 'Studio' });
    expect(JSON.stringify(classes)).not.toContain('0911000000');
  });
});

describe('parsePlanDescription', () => {
  it('turns {"benefits": [...]} into a benefit list', () => {
    expect(parsePlanDescription('{"benefits":["Full access","Shower","Locker"]}')).toEqual({
      text: null,
      benefits: ['Full access', 'Shower', 'Locker'],
    });
  });

  it('tidies spacing and drops empty entries', () => {
    expect(parsePlanDescription('{"benefits":["Professionally designed diet  plan", " "]}').benefits).toEqual([
      'Professionally designed diet plan',
    ]);
  });

  it('accepts a bare array', () => {
    expect(parsePlanDescription('["Coach","Class"]').benefits).toEqual(['Coach', 'Class']);
  });

  it('keeps plain text as text', () => {
    expect(parsePlanDescription('Gym floor any time')).toEqual({ text: 'Gym floor any time', benefits: [] });
  });

  it('keeps broken JSON as text rather than failing', () => {
    expect(parsePlanDescription('{not json')).toEqual({ text: '{not json', benefits: [] });
  });

  it('handles empty values', () => {
    expect(parsePlanDescription(null)).toEqual({ text: null, benefits: [] });
    expect(parsePlanDescription('  ')).toEqual({ text: null, benefits: [] });
  });
});
