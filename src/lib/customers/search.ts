// The staff customer search box (?q=). Whatever is typed is matched
// literally and case-insensitively by search_customers() (migration 0030),
// which escapes LIKE wildcards itself; this only tidies the text and caps
// its length. An empty search means "list everyone".
export const CUSTOMER_SEARCH_MAX_LENGTH = 100;

export const normalizeCustomerSearch = (value: string | string[] | undefined | null): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const query = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH).trim();
  return query ? query : null;
};
