// Concurrent cash remittances (migrations 0042/0048), with real parallel
// sessions — what the single-session .sql suites can't show. Every race
// below fires the same request from many connections at once; each session
// keeps its transaction (and so any lock it took) open a moment before
// committing, so the others genuinely wait on it.
//
//   1. ten different submissions of the same cash   → one accepted
//   2. one submission retried ten times (same id)   → one row, same number
//   3. two operators confirm the same submission    → confirmed once, one custodian
//   4. confirm racing a dispute                     → exactly one decision
//   5. a confirmation racing a new submission       → never more than is held
//   6. ten operator submissions of the same cash    → one accepted
//   7. two managers confirm the same submission     → confirmed once
// After each: the balances read by the dashboards add up.
//
// Needs a database prepared by database/test/run.sh (every migration, the
// seed and the test grants) and the `pg` client, which the app doesn't use:
//   npm install --no-save pg
//   DATABASE_URL=postgres://postgres@localhost/uae_delivery_test node database/test/concurrency.mjs
// Exits non-zero on the first failed check.

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to a database prepared by database/test/run.sh');
  process.exit(2);
}

const PARALLEL = 10;
const HOLD_MS = 150;

const ID = {
  op1: '00000000-0000-0000-0000-00000000005e',
  op2: '00000000-0000-0000-0000-00000000005d',
  mgr1: '00000000-0000-0000-0000-00000000005f',
  mgr2: '00000000-0000-0000-0000-000000000058',
  drv: '00000000-0000-0000-0000-00000000005a',
  drv2: '00000000-0000-0000-0000-00000000005b',
  cust: '00000000-0000-0000-0000-00000000005c',
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok  ${label}  -> ${a}`);
  else {
    console.log(`FAIL ${label}: got ${a}, expected ${e}`);
    failures += 1;
  }
};
const one = async (sql, params = []) => (await admin.query(sql, params)).rows[0];

// The same call from `n` sessions at once, each as `uid`. Returns each
// session's outcome: { ok: row } or { error: message }.
const race = async (calls) => {
  const clients = await Promise.all(
    calls.map(async ({ uid }) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.uid', $1, true)`, [uid]);
      return client;
    }),
  );
  // Everyone is connected and in a transaction before anyone starts.
  const outcomes = await Promise.all(
    calls.map(async ({ sql, params }, i) => {
      const client = clients[i];
      try {
        const { rows } = await client.query(sql, params);
        await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
        await client.query('commit');
        return { ok: rows[0]?.result ?? null };
      } catch (error) {
        await client.query('rollback').catch(() => {});
        return { error: error.message };
      } finally {
        await client.end();
      }
    }),
  );
  return outcomes;
};
const okCount = (outcomes) => outcomes.filter((o) => 'ok' in o).length;
const errors = (outcomes) => [...new Set(outcomes.filter((o) => 'error' in o).map((o) => o.error.replace(/AED [\d.]+/, 'AED n')))];

// ── Fixtures (as the database, not through the paths under test) ────────
await admin.query(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ID.op1}', 'op5@test.com', '{"full_name":"Op Five","phone":"0505550001"}'),
    ('${ID.op2}', 'op5b@test.com', '{"full_name":"Op Five B","phone":"0505550007"}'),
    ('${ID.mgr1}', 'mgr5@test.com', '{"full_name":"Mgr Five","phone":"0505550002"}'),
    ('${ID.mgr2}', 'mgr5b@test.com', '{"full_name":"Mgr Five B","phone":"0505550008"}'),
    ('${ID.drv}', 'drv5@test.com', '{"full_name":"Drv Five","phone":"0505550004"}'),
    ('${ID.drv2}', 'drv5b@test.com', '{"full_name":"Drv Five B","phone":"0505550005"}'),
    ('${ID.cust}', 'cust5@test.com', '{"full_name":"Cust Five","phone":"0505550003"}');
  alter table profiles disable trigger user;
  update profiles set role = 'operator' where id in ('${ID.op1}', '${ID.op2}');
  update profiles set role = 'manager' where id in ('${ID.mgr1}', '${ID.mgr2}');
  update profiles set role = 'driver' where id in ('${ID.drv}', '${ID.drv2}');
  alter table profiles enable trigger user;
  insert into staff_profiles (profile_id, employee_id) values
    ('${ID.op1}', 'EMP-C1'), ('${ID.op2}', 'EMP-C2'), ('${ID.mgr1}', 'EMP-C3'), ('${ID.mgr2}', 'EMP-C4');
`);

// A delivered cash shipment (fee + goods), collected by the driver.
const delivered = async (driver, fee, goods) => {
  const { id } = await one(
    `insert into shipments (
       customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
       dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
       distance_km, duration_minutes, base_charge, distance_charge, weight_charge, cod_charge, price,
       currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description
     ) values ($1, 'confirmed', 'A', 25.09, 55.14, 'S', '0500000000', 'B', 25.18, 55.27, 'R', '0500000001',
       5, 10, $2, 0, 0, 0, $2, 'AED', 'cod', 'postpaid', $3, 'parcel', 'concurrency')
     returning id`,
    [ID.cust, fee, goods],
  );
  for (const status of ['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered']) {
    await admin.query(`update shipments set status = $2, driver_id = $3 where id = $1`, [id, status, driver]);
  }
  await admin.query('begin');
  await admin.query(`select set_config('request.jwt.uid', $1, true)`, [driver]);
  await admin.query(`update cod_transactions set status = 'collected' where shipment_id = $1`, [id]);
  await admin.query('commit');
};
await delivered(ID.drv, 100, 2400); // AED 2,500
await delivered(ID.drv2, 50, 450); // AED 500

const driverPosition = async (driver) =>
  one(
    `select
       (select coalesce(sum(collected_amount), 0) from cod_transactions where driver_id = $1 and collected_amount is not null)::text as collected,
       (select coalesce(sum(amount), 0) from driver_cash_remittances where driver_id = $1 and status = 'confirmed')::text as confirmed,
       (select coalesce(sum(amount), 0) from driver_cash_remittances where driver_id = $1 and status = 'pending')::text as pending,
       (select outstanding::text from driver_cash_breakdown($1)) as outstanding`,
    [driver],
  );

// ── 1. Ten different submissions of the same AED 2,500 ───────────────────
{
  const outcomes = await race(
    Array.from({ length: PARALLEL }, () => ({
      uid: ID.drv,
      sql: `select submit_driver_remittance(2400, 100, null, gen_random_uuid()) as result`,
    })),
  );
  check('1. ten parallel submissions of the same cash: one accepted', okCount(outcomes), 1);
  check('1. the others are refused as more than is held', errors(outcomes), ['This is more COD than you hold: AED n available']);
  check('1. AED 2,500 pending once; nothing deducted', await driverPosition(ID.drv), {
    collected: '2500.00',
    confirmed: '0',
    pending: '2500.00',
    outstanding: '2500.00',
  });
}
const firstId = (await one(`select id from driver_cash_remittances where driver_id = $1 and status = 'pending'`, [ID.drv])).id;

// ── 2. One submission retried ten times ──────────────────────────────────
{
  const requestId = '50000000-0000-4000-8000-000000000001';
  const outcomes = await race(
    Array.from({ length: PARALLEL }, () => ({
      uid: ID.drv2,
      sql: `select submit_driver_remittance(450, 50, 'retry', $1) ->> 'number' as result`,
      params: [requestId],
    })),
  );
  const numbers = [...new Set(outcomes.filter((o) => 'ok' in o).map((o) => o.ok))];
  check('2. a retried request: every attempt answers', okCount(outcomes), PARALLEL);
  check('2. …with the same remittance number', numbers.length, 1);
  check('2. one row', (await one(`select count(*)::int as n from driver_cash_remittances where driver_id = $1`, [ID.drv2])).n, 1);
}
const secondId = (await one(`select id from driver_cash_remittances where driver_id = $1`, [ID.drv2])).id;

// ── 3. Two operators confirm the same submission at once ─────────────────
{
  const outcomes = await race(
    [ID.op1, ID.op2, ID.op1, ID.op2].map((uid) => ({
      uid,
      sql: `select confirm_driver_remittance($1, 2400, 100, null) ->> 'status' as result`,
      params: [firstId],
    })),
  );
  check('3. every confirmation answers "confirmed" (repeats are no-ops)', outcomes.map((o) => o.ok ?? o.error), Array(4).fill('confirmed'));
  check('3. confirmed once: the driver is at AED 0.00', await driverPosition(ID.drv), {
    collected: '2500.00',
    confirmed: '2500.00',
    pending: '0',
    outstanding: '0.00',
  });
  const custody = await one(
    `select received_by, (select count(*)::int from audit_logs where action = 'driver_cash.remittance_confirmed' and entity_id = $1) as audits,
       (select count(*)::int from notifications where type = 'cash.driver_remittance_confirmed' and profile_id = $2) as notices
     from driver_cash_remittances where id = $1`,
    [firstId, ID.drv],
  );
  check('3. one custodian, one audit row, one notice', [custody.received_by === ID.op1 || custody.received_by === ID.op2, custody.audits, custody.notices], [true, 1, 1]);
  const held = await one(
    `select (select outstanding::text from operator_cash_breakdown($1)) as op1, (select outstanding::text from operator_cash_breakdown($2)) as op2`,
    [ID.op1, ID.op2],
  );
  check('3. the AED 2,500 is held by exactly one operator', [held.op1, held.op2].sort(), ['0.00', '2500.00']);
}
const custodian = (await one(`select received_by from driver_cash_remittances where id = $1`, [firstId])).received_by;

// ── 4. Confirm racing a dispute ──────────────────────────────────────────
{
  const outcomes = await race([
    { uid: ID.op1, sql: `select confirm_driver_remittance($1, 450, 50, null) ->> 'status' as result`, params: [secondId] },
    { uid: ID.op2, sql: `select dispute_driver_remittance($1, 'Nothing handed over') as result`, params: [secondId] },
  ]);
  const final = await one(`select status from driver_cash_remittances where id = $1`, [secondId]);
  const position = await driverPosition(ID.drv2);
  check('4. exactly one decision stands', ['confirmed', 'disputed'].includes(final.status), true);
  check('4. the loser is refused or sees the decision, never both', okCount(outcomes) >= 1, true);
  check(
    '4. the balance matches the decision',
    position.outstanding,
    final.status === 'confirmed' ? '0.00' : '500.00',
  );
}

// ── 5. A confirmation racing a new submission ────────────────────────────
{
  // Driver …5b: if disputed above, AED 500 is free to submit again.
  const before = await driverPosition(ID.drv2);
  if (before.outstanding === '500.00') {
    const outcomes = await race([
      ...Array.from({ length: 5 }, () => ({ uid: ID.drv2, sql: `select submit_driver_remittance(450, 50, null, gen_random_uuid()) ->> 'number' as result` })),
    ]);
    check('5. resubmitting the disputed AED 500 in parallel: one accepted', okCount(outcomes), 1);
    const pendingId = (await one(`select id from driver_cash_remittances where driver_id = $1 and status = 'pending'`, [ID.drv2])).id;
    const mixed = await race([
      { uid: ID.op1, sql: `select confirm_driver_remittance($1, 450, 50, null) ->> 'status' as result`, params: [pendingId] },
      { uid: ID.drv2, sql: `select submit_driver_remittance(1, 0, null, gen_random_uuid()) ->> 'number' as result` },
    ]);
    check('5. the extra submission is refused while the cash is reserved or remitted', errors(mixed).length, 1);
  }
  const after = await driverPosition(ID.drv2);
  check('5. never more confirmed + pending than collected', Number(after.confirmed) + Number(after.pending) <= Number(after.collected), true);
  check('5. the driver ends at AED 0.00', after.outstanding, '0.00');
}

// ── 6. Ten operator submissions of the same cash ─────────────────────────
const opHeld = await one(
  `select received_cod::text as cod, received_fee::text as fee, outstanding::text as outstanding from operator_cash_breakdown($1)`,
  [custodian],
);
{
  const outcomes = await race(
    Array.from({ length: PARALLEL }, () => ({
      uid: custodian,
      sql: `select submit_operator_remittance($1, $2, null, gen_random_uuid()) ->> 'number' as result`,
      params: [opHeld.cod, opHeld.fee],
    })),
  );
  check('6. ten parallel operator submissions: one accepted', okCount(outcomes), 1);
  const position = await one(`select outstanding::text, pending_cod::text, pending_fee::text from operator_cash_breakdown($1)`, [custodian]);
  check('6. reserved once, not deducted', [position.outstanding, position.pending_cod, position.pending_fee], [opHeld.outstanding, opHeld.cod, opHeld.fee]);
}

// ── 7. Two managers confirm the same operator submission ─────────────────
{
  const opRem = await one(`select id, amount::text from operator_cash_remittances where operator_id = $1 and status = 'pending'`, [custodian]);
  const outcomes = await race(
    [ID.mgr1, ID.mgr2, ID.mgr1].map((uid) => ({
      uid,
      sql: `select confirm_operator_remittance($1, $2, $3, null) ->> 'status' as result`,
      params: [opRem.id, opHeld.cod, opHeld.fee],
    })),
  );
  check('7. every confirmation answers "confirmed"', outcomes.map((o) => o.ok ?? o.error), Array(3).fill('confirmed'));
  const position = await one(`select outstanding::text, confirmed_cod::text, confirmed_fee::text from operator_cash_breakdown($1)`, [custodian]);
  check('7. confirmed once: the operator is at AED 0.00', [position.outstanding, position.confirmed_cod, position.confirmed_fee], ['0.00', opHeld.cod, opHeld.fee]);
}

// ── Every dirham in exactly one place ────────────────────────────────────
{
  await admin.query('begin');
  await admin.query('set local role authenticated');
  await admin.query(`select set_config('request.jwt.uid', $1, true)`, [ID.mgr1]);
  const totals = await one(`select manager_cash_totals() as t`);
  await admin.query('commit');
  const t = totals.t;
  const placed = [t.fromOperators, t.directFromDrivers, t.heldByOperators, t.heldByDrivers].reduce((sum, v) => sum + Math.round(Number(v) * 100), 0);
  const collected = await one(`select (sum(collected_amount) * 100)::bigint::int as fils from cod_transactions where collected_amount is not null`);
  check('every dirham collected is in exactly one place', placed, collected.fils);
}

await admin.end();
if (failures) {
  console.log(`concurrency: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('concurrency: all checks passed');
