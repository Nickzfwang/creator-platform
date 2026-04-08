-- Remove API_DCARD and add RSS_AIPOSTHUB to TrendSourcePlatform enum

-- Step 1: Migrate existing API_DCARD references
UPDATE "trend_topics" SET "source_platform" = 'RSS_ITHOME' WHERE "source_platform" = 'API_DCARD';
UPDATE "trend_snapshots" SET "sources" = array_remove("sources", 'API_DCARD'::"TrendSourcePlatform") WHERE 'API_DCARD'::"TrendSourcePlatform" = ANY("sources");

-- Step 2: Rename old enum
ALTER TYPE "TrendSourcePlatform" RENAME TO "TrendSourcePlatform_old";

-- Step 3: Create new enum
CREATE TYPE "TrendSourcePlatform" AS ENUM (
  'RSS_TECHORANGE',
  'RSS_ITHOME',
  'RSS_BNEXT',
  'RSS_TECHCRUNCH',
  'RSS_THEVERGE',
  'RSS_PRODUCTHUNT',
  'RSS_CREATOR_ECONOMY',
  'RSS_REDDIT',
  'RSS_CLAUDE_CODE',
  'RSS_AIPOSTHUB',
  'API_YOUTUBE_TRENDING',
  'SCRAPER_TIKTOK',
  'SCRAPER_THREADS'
);

-- Step 4: Convert columns to new enum
ALTER TABLE "trend_topics"
  ALTER COLUMN "source_platform" TYPE "TrendSourcePlatform"
  USING ("source_platform"::text::"TrendSourcePlatform");

ALTER TABLE "trend_snapshots"
  ALTER COLUMN "sources" TYPE "TrendSourcePlatform"[]
  USING ("sources"::text[]::"TrendSourcePlatform"[]);

-- Step 5: Drop old enum
DROP TYPE "TrendSourcePlatform_old";
