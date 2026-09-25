import { describe, expect, it } from 'vitest';

import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import { buildTurnstileBody, getTurnstileMode, isTurnstileSuccess } from '@/lib/security/turnstile-core';

describe('safeErrorMessage', () => {
  it('passes through messages from our own RAISE EXCEPTION (P0001)', () => {
    expect(safeErrorMessage({ code: 'P0001', message: 'Customers can only cancel a shipment' })).toBe(
      'Customers can only cancel a shipment',
    );
  });

  it('hides RLS and constraint details behind friendly messages', () => {
    const rls = safeErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "shipments"' });
    expect(rls).toBe('You are not allowed to do that.');
    expect(rls).not.toContain('shipments');

    const dup = safeErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "vehicles_plate_number_key"' });
    expect(dup).not.toContain('vehicles_plate_number_key');
  });

  it('falls back for unknown or missing errors', () => {
    expect(safeErrorMessage({ code: 'XX000', message: 'internal detail' })).toBe('Something went wrong. Please try again.');
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
  it('is enforced whenever a secret is configured', () => {
    expect(getTurnstileMode({ secret: 's', nodeEnv: 'production' })).toBe('enforced');
    expect(getTurnstileMode({ secret: 's', nodeEnv: 'development', disabled: 'true' })).toBe('enforced');
  });

  it('is off in development without a secret', () => {
    expect(getTurnstileMode({ nodeEnv: 'development' })).toBe('disabled');
  });

  it('fails closed in production when the secret is missing', () => {
    expect(getTurnstileMode({ nodeEnv: 'production' })).toBe('misconfigured');
  });

  it('can only be switched off in production explicitly', () => {
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
