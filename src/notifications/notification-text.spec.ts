import { notificationText, parseDesktopDate } from './notification-text';

const opts = { timeZone: 'Africa/Addis_Ababa', currency: 'ETB' };

describe('parseDesktopDate', () => {
  it('reads SQLite dates as UTC unless they say otherwise', () => {
    expect(parseDesktopDate('2026-10-01 00:00:00')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parseDesktopDate('2026-10-01T03:00:00+03:00')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parseDesktopDate('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parseDesktopDate('not a date')).toBeNull();
    expect(parseDesktopDate(null)).toBeNull();
  });
});

describe('notificationText', () => {
  it('describes a membership payment with method and discount', () => {
    expect(
      notificationText(
        'payment',
        {
          member_name: 'Abebe Kebede',
          amount: 1800,
          service_name: 'Monthly',
          payment_method: 'Telebirr',
          discount_amount: 200,
          discount_code: 'NEWYEAR',
        },
        opts,
      ),
    ).toEqual({
      title: 'Payment received',
      body: 'Abebe Kebede paid ETB 1,800 for Monthly via Telebirr (ETB 200 off, NEWYEAR).',
    });
  });

  it('names add-ons and drop-ins, and walk-ins without a member', () => {
    expect(
      notificationText('payment', { member_name: 'Sara', amount: 300, addon_name: 'Sauna', discount_amount: 0 }, opts).body,
    ).toBe('Sara paid ETB 300 for Sauna (add-on).');
    expect(notificationText('payment', { amount: 150, drop_in_name: 'Day pass' }, opts).body).toBe(
      'ETB 150 received for Day pass (drop-in).',
    );
  });

  it('describes a package change with the new period in the gym timezone', () => {
    expect(
      notificationText(
        'package_changed',
        {
          member_name: 'Abebe',
          old_service_name: 'Monthly',
          new_service_name: 'Quarterly',
          new_start_date: '2026-10-31 22:00:00',
          new_end_date: '2027-01-29 22:00:00',
        },
        opts,
      ),
    ).toEqual({
      title: 'Package changed',
      body: 'Abebe: Monthly → Quarterly, 1 Nov 2026 – 30 Jan 2027.',
    });
  });

  it('calls a first package an assignment', () => {
    expect(
      notificationText('package_changed', { member_name: 'New', new_service_name: 'Monthly' }, opts).title,
    ).toBe('Package assigned');
  });

  it('tells a renewal apart from a corrected start date', () => {
    const renewal = notificationText(
      'start_date_changed',
      {
        member_name: 'Abebe',
        new_service_name: 'Monthly',
        old_start_date: '2026-10-01 00:00:00',
        old_end_date: '2026-10-31 00:00:00',
        new_start_date: '2026-10-31 00:00:00',
        new_end_date: '2026-11-30 00:00:00',
      },
      opts,
    );
    expect(renewal).toEqual({
      title: 'Membership renewed',
      body: 'Abebe renewed Monthly: 31 Oct 2026 – 30 Nov 2026.',
    });

    const correction = notificationText(
      'start_date_changed',
      {
        member_name: 'Abebe',
        new_service_name: 'Monthly',
        old_start_date: '2026-10-01 00:00:00',
        old_end_date: '2026-10-31 00:00:00',
        new_start_date: '2026-10-05 00:00:00',
        new_end_date: '2026-11-04 00:00:00',
      },
      opts,
    );
    expect(correction).toEqual({
      title: 'Start date changed',
      body: 'Abebe (Monthly): start 1 Oct 2026 → 5 Oct 2026.',
    });
  });

  it('still says something when details are missing', () => {
    expect(notificationText('payment', {}, opts).body).toBe('A payment was received.');
    expect(notificationText('payment', { member_name: 'Sara' }, opts).body).toBe('Sara made a payment.');
    expect(notificationText('start_date_changed', {}, opts).body).toBe('A member: start ? → ?.');
  });

  it('says who made the change in the app, when the desktop said', () => {
    expect(
      notificationText(
        'start_date_changed',
        {
          member_name: 'Abebe',
          old_start_date: '2026-10-01 00:00:00',
          new_start_date: '2026-09-01 00:00:00',
          actor_username: 'nardo',
          actor_role: 'admin',
        },
        opts,
      ).body,
    ).toBe('Abebe: start 1 Oct 2026 → 1 Sept 2026. By nardo (admin).');
    expect(notificationText('payment', { amount: 150, actor_username: 'sara' }, opts).body).toBe(
      'ETB 150 received. By sara.',
    );
    expect(notificationText('payment', { amount: 150 }, opts).body).toBe('ETB 150 received.');
  });
});
