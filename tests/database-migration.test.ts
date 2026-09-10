import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/202609100001_initial_schema.sql", import.meta.url),
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const databaseTypes = readFileSync(
  fileURLToPath(new URL("../lib/supabase/database.types.ts", import.meta.url)),
  "utf8",
).toLowerCase();

const tables = [
  "profiles",
  "topics",
  "topic_preferences",
  "sources",
  "raw_items",
  "stories",
  "story_sources",
  "story_state",
  "tags",
  "story_tags",
  "digests",
  "digest_stories",
  "job_runs",
];

describe("initial database migration", () => {
  it.each(tables)("creates and enables RLS on %s", (table) => {
    expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it.each(tables)("exposes %s through the Supabase Database type", (table) => {
    expect(databaseTypes).toContain(`${table}: table<`);
  });

  it("keeps profile provisioning server-only", () => {
    expect(migration).not.toMatch(/on public\.profiles for insert\s+to authenticated/);
    expect(migration).toContain('create policy "profiles_select_own"');
    expect(migration).toContain('create policy "profiles_update_own"');
    expect(migration).toContain("profiles_single_user_key");
  });

  it("guards global reads behind a provisioned current profile", () => {
    expect(migration).toContain("create function public.is_current_profile()");
    for (const table of ["topics", "sources", "raw_items", "stories", "digests", "job_runs"]) {
      expect(migration).toContain(`on public.${table} for select to authenticated`);
      expect(migration).toContain("using ((select public.is_current_profile()))");
    }
  });

  it("limits mutable user state to auth.uid", () => {
    for (const table of ["topic_preferences", "story_state"]) {
      for (const operation of ["select", "insert", "update", "delete"]) {
        expect(migration).toContain(`on public.${table} for ${operation} to authenticated`);
      }
    }

    expect(migration).toContain("profile_id = (select auth.uid())");
  });

  it("protects deduplication and digest idempotency at the database layer", () => {
    expect(migration).toContain("canonical_url text unique not null");
    expect(migration).toContain("raw_items_source_external_id_key");
    expect(migration).toContain("unique (type, date)");
    expect(migration).toContain("story_sources_one_primary_per_story");
  });

  it("seeds every documented topic with its initial weight", () => {
    const expectedTopics = [
      ["ai", 5],
      ["cybersecurity", 2],
      ["technology", 4],
      ["finance", 3],
      ["world", 4],
      ["music", 5],
      ["photography", 4],
    ] as const;

    for (const [slug, weight] of expectedTopics) {
      expect(migration).toMatch(new RegExp(`'${slug}',\\s*'[^']+',\\s*${weight}\\)`));
    }
  });
});
