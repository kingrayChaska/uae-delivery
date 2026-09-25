// Database errors must not reach the browser verbatim: messages like
// 'new row violates row-level security policy for table "shipments"' or
// 'duplicate key value violates unique constraint "vehicles_plate_number_key"'
// leak table, policy and constraint names.
//
// The one exception is SQLSTATE P0001 — errors raised by our OWN
// functions and triggers with RAISE EXCEPTION ('Customers can only cancel
// a shipment', 'Arrive at the destination before completing delivery').
// Those messages were written for users, so they pass through.

type ErrorLike = { code?: string; message?: string } | null | undefined;

const FRIENDLY_BY_CODE: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'A related record could not be found.',
  '42501': 'You are not allowed to do that.',
  '22P02': 'Invalid input.',
  PGRST116: 'Not found.',
};

export const safeErrorMessage = (error: ErrorLike, fallback = 'Something went wrong. Please try again.'): string => {
  if (!error) return fallback;
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code && FRIENDLY_BY_CODE[error.code]) return FRIENDLY_BY_CODE[error.code];
  return fallback;
};
