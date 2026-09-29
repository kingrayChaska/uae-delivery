export const BATCH_STATUSES = ['processing', 'submitted', 'partially_failed', 'failed'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// A batch is a group of shipments booked together: a customer's
// multi-shipment booking, or a manager's business-account CSV upload.
export type BulkRowResult = { rowNumber: number; ok: boolean; message: string };

// Pickup dates are UAE calendar days, whatever timezone the server or the
// browser happens to run in.
export const todayInUae = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());

// Grouping of shipment statuses used by batch_shipment_stats (migration
// 0021) — the database computes these counts.
export type BatchProgress = { awaitingDispatch: number; inProgress: number; delivered: number; issues: number };
