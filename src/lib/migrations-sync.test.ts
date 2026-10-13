import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Migrations are written in database/migrations (where database/test runs
// them) and deployed by `supabase db push`, which reads only
// supabase/migrations. A migration missing from either folder is either
// untested or never deployed — the app then fails at runtime on a missing
// table or function. This keeps the two lists identical.

const list = (folder: string) =>
  readdirSync(join(process.cwd(), folder))
    .filter((name) => name.endsWith('.sql'))
    .sort();

describe('migration folders', () => {
  it('database/migrations and supabase/migrations hold the same migrations', () => {
    const database = list('database/migrations');
    const supabase = list('supabase/migrations');
    expect(database.filter((name) => !supabase.includes(name))).toEqual([]);
    expect(supabase.filter((name) => !database.includes(name))).toEqual([]);
  });
});
