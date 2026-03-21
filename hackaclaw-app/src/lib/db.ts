/**
 * @deprecated — Supabase is now used instead of local SQLite.
 * See src/lib/supabase.ts for the database client.
 *
 * This file is kept only for reference. Do NOT import it.
 */

export function getDb(): never {
  throw new Error(
    "Local SQLite DB is deprecated. Use supabaseAdmin from @/lib/supabase instead."
  );
}
