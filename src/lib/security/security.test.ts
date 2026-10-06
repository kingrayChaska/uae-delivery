import { describe, expect, it } from 'vitest';

import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import { buildTurnstileBody, getTurnstileMode, isTurnstileSuccess } from '@/lib/security/turnstile-core';

describe('safeErrorMessage', () => {
  it('turns messages from our own RAISE EXCEPTION (P0001) into translation keys', () => {
    expect(safeErrorMessage({ code: 'P0001', message: 'Customers can only cancel a shipment' })).toBe(
      'errors.db.customerCancelOnly',
    );
    expect(safeErrorMessage({ code: 'P0001', message: 'This delivery is 62.4 km, beyond the 50 km ParcelLink delivery limit' })).toBe(
      'errors.db.distanceLimit|{"distance":"62.4","limit":"50"}',
    );
  });

  it('passes an unknown P0001 message through as written', () => {
    expect(safeErrorMessage({ code: 'P0001', message: 'A brand new rule' })).toBe('A brand new rule');
  });

  it('hides RLS and constraint details behind friendly messages', () => {
    const rls = safeErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "shipments"' });
    expect(rls).toBe('errors.forbidden');
    expect(rls).not.toContain('shipments');

    const dup = safeErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "vehicles_plate_number_key"' });
    expect(dup).not.toContain('vehicles_plate_number_key');
  });

  it('falls back for unknown or missing errors', () => {
    expect(safeErrorMessage({ code: 'XX000', message: 'internal detail' })).toBe('errors.generic');
    expect(safeErrorMessage(null, 'Custom')).toBe('Custom');
  });
});

describe('isUuid', () => {
  it('accepts real UUIDs', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('d9b2d63d-a233-4123-847a-7a0b3f0c1e2f')).toBe(true);
  });

  it.each(['', 'abc', '1', "x,entity_id.neq.null", '00000000-0000-0000-0000-00000000000Z', null, 42])(
    'rejects %s — including PostgREST filter-injection attempts',
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});

describe('getTurnstileMode', () => {
  it('can be explicitly turned off even when a secret is configured', () => {
    expect(getTurnstileMode({ secret: 's', nodeEnv: 'production', disabled: 'true' })).toBe('disabled');
  });

  it('is enforced whenever a secret is configured and not explicitly disabled', () => {
    expect(getTurnstileMode({ secret: 's', nodeEnv: 'production' })).toBe('enforced');
    expect(getTurnstileMode({ secret: 's', nodeEnv: 'development' })).toBe('enforced');
  });

  it('is off in development without a secret', () => {
    expect(getTurnstileMode({ nodeEnv: 'development' })).toBe('disabled');
  });

  it('fails closed in production when the secret is missing', () => {
    expect(getTurnstileMode({ nodeEnv: 'production' })).toBe('misconfigured');
  });

  it('only treats explicit true as the disabled override', () => {
    expect(getTurnstileMode({ nodeEnv: 'production', disabled: 'true' })).toBe('disabled');
    expect(getTurnstileMode({ nodeEnv: 'production', disabled: 'yes' })).toBe('misconfigured');
  });
});

describe('turnstile request/response', () => {
  it('builds the form body with optional remote ip', () => {
    expect(buildTurnstileBody('sec', 'tok', '1.2.3.4').toString()).toBe('secret=sec&response=tok&remoteip=1.2.3.4');
    expect(buildTurnstileBody('sec', 'tok', null).toString()).toBe('secret=sec&response=tok');
  });

  it('only treats an explicit success:true as success', () => {
    expect(isTurnstileSuccess({ success: true })).toBe(true);
    expect(isTurnstileSuccess({ success: 'true' })).toBe(false);
    expect(isTurnstileSuccess({ success: false, 'error-codes': ['invalid-input-response'] })).toBe(false);
    expect(isTurnstileSuccess(null)).toBe(false);
  });
});
