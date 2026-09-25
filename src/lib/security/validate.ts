const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Ids arrive from URLs and client calls. Validating the shape up front
// turns malformed input into a clean "not found" instead of a database
// error, and is essential anywhere an id is interpolated into a
// PostgREST filter string (e.g. .or(`actor_id.eq.${id}`)).
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
