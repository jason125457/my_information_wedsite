import { getAIModelConfig, getGeminiApiKey, getGeminiMinIntervalMs } from "@/lib/ai/config";
import { GeminiProvider } from "@/lib/ai/provider";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import {
  HackerNewsCollector,
  RssCollector,
  runCollectors,
  type Collector,
  type ContentTopic,
  type NormalizedCandidate,
} from "@/lib/collectors";
import { choosePrimarySource, type SourceChoice, type SourceReliability } from "@/lib/dedupe";
import { prefilterCandidates } from "@/lib/pipeline/prefilter";
import { processCandidates } from "@/lib/pipeline/process";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { loadFeedbackProfile, type FeedbackProfile } from "@/lib/ranking";

export interface SourceIngestStats {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  fetchedCount: number;
  filteredCount: number;
  processedCount: number;
  insertedCount: number;
  duplicateCount: number;
  error: string | null;
}

export interface IngestionJobTotals {
  fetched: number;
  filtered: number;
  duplicates: number;
  processed: number;
  storiesCreated: number;
  failures: number;
}

export interface IngestionJobResult {
  jobId: string;
  status: "succeeded" | "partial" | "failed";
  itemsProcessed: number;
  sources: SourceIngestStats[];
  totals: IngestionJobTotals;
  durationMs: number;
  warning?: string;
  error?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export interface IngestOptions {
  supabase?: AdminClient;
  editor?: StoryAIEditor;
  feedbackProfile?: FeedbackProfile;
  fetchImplementation?: typeof fetch;
  now?: Date;
  sources?: SourceRow[];
  minimumScore?: number;
  maxCandidatesPerSource?: number;
  maxTotalCandidates?: number;
}

interface CandidateChoice extends SourceChoice {
  candidate: NormalizedCandidate;
}

export async function ingestSources(options: IngestOptions = {}): Promise<IngestionJobResult> {
  const startTime = Date.now();
  const now = options.now ?? new Date();
  const supabase = options.supabase ?? createAdminClient();

  // 1. Fetch active sources and topic mappings
  let sources: SourceRow[];
  if (options.sources) {
    sources = options.sources;
  } else {
    const { data: dbSources, error: sourceError } = await supabase
      .from("sources")
      .select("id, name, type, url, reliability_type, primary_topic_id, is_discovery, is_active, config, created_at")
      .eq("is_active", true);

    if (sourceError) {
      throw new Error(`Failed to load sources: ${sourceError.message}`);
    }
    sources = dbSources ?? [];
  }

  const { data: dbTopics } = await supabase.from("topics").select("id, slug");
  const topicMap = new Map<string, ContentTopic>();
  const topicSlugToId = new Map<string, string>();
  let fallbackTopicId = "";

  if (dbTopics) {
    for (const topic of dbTopics) {
      topicMap.set(topic.id, topic.slug as ContentTopic);
      topicSlugToId.set(topic.slug, topic.id);
      if (topic.slug === "technology") fallbackTopicId = topic.id;
    }
    if (!fallbackTopicId && dbTopics[0]) fallbackTopicId = dbTopics[0].id;
  }

  const sourceReliabilityMap = new Map<string, SourceReliability>();
  for (const s of sources) {
    sourceReliabilityMap.set(s.id, s.reliability_type as SourceReliability);
  }

  // 2. Insert initial job_runs row
  const { data: job, error: jobError } = await supabase
    .from("job_runs")
    .insert({
      job_type: "ingestion",
      status: "running",
      metadata: { sourceCount: sources.length, startedAt: now.toISOString() },
    })
    .select("id")
    .single();

  if (jobError) {
    throw new Error(`Failed to start ingestion job: ${jobError.message}`);
  }

  const statsBySource = new Map<string, SourceIngestStats>();
  for (const source of sources) {
    statsBySource.set(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      fetchedCount: 0,
      filteredCount: 0,
      processedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      error: null,
    });
  }

  try {
    if (sources.length === 0) {
      const totals = computeTotals(statsBySource, 0);
      await finishJobRun(supabase, job.id, "succeeded", 0, statsBySource, totals, startTime);
      return {
        jobId: job.id,
        status: "succeeded",
        itemsProcessed: 0,
        sources: [],
        totals,
        durationMs: Date.now() - startTime,
      };
    }

    // Do not fetch sources when the editor cannot process them: fetched items
    // would otherwise sit unprocessed. An injected editor keeps tests and
    // controlled backfills independent of production secrets.
    if (!options.editor) {
      try {
        getGeminiApiKey();
        getAIModelConfig();
      } catch {
        const warning =
          "AI ingestion is not configured. Set GEMINI_API_KEY, GEMINI_MODEL_FAST, and GEMINI_MODEL_QUALITY.";
        const totals = computeTotals(statsBySource, 0);
        await finishJobRun(supabase, job.id, "partial", 0, statsBySource, totals, startTime, warning);
        return {
          jobId: job.id,
          status: "partial",
          itemsProcessed: 0,
          sources: Array.from(statsBySource.values()),
          totals,
          durationMs: Date.now() - startTime,
          warning,
        };
      }
    }

    // 3. Prepare collectors with failure isolation
    const collectorsToRun: Collector[] = [];
    for (const source of sources) {
      const topic = (source.primary_topic_id ? topicMap.get(source.primary_topic_id) : null) ?? "technology";
      try {
        const collector = createCollectorFromSource(source, topic, options.fetchImplementation);
        collectorsToRun.push(collector);
      } catch (err) {
        const stat = statsBySource.get(source.id);
        if (stat) {
          stat.error = err instanceof Error ? err.message : "Collector initialization failed.";
        }
      }
    }

    // 4. Run collectors. Reddit throttles unauthenticated feed requests from
    // shared CI IPs after the first one, so each run fetches a single Reddit
    // source, rotating through them by time slot (every source refreshes
    // within a few runs; their "top of the week/day" listings change slowly).
    const redditCollectors = collectorsToRun
      .filter((c) => c.sourceType === "reddit")
      .sort((first, second) => first.sourceId.localeCompare(second.sourceId));
    const redditThisRun = redditCollectors.length
      ? [redditCollectors[redditSlot(now) % redditCollectors.length]]
      : [];
    const collectorResults = await runCollectors([
      ...collectorsToRun.filter((c) => c.sourceType !== "reddit"),
      ...redditThisRun,
    ]);
    const allCandidates: NormalizedCandidate[] = [];

    for (const result of collectorResults) {
      const stat = statsBySource.get(result.sourceId);
      if (stat) {
        stat.fetchedCount = result.candidateCount;
        if (result.status === "failed") {
          stat.error = result.errorMessage ?? "Collector fetch failed.";
        }
      }
      const reliability = sourceReliabilityMap.get(result.sourceId) ?? "unknown";
      allCandidates.push(
        ...result.candidates.map((candidate) => ({ ...candidate, sourceReliability: reliability })),
      );
    }

    // 5. In-memory prefiltering
    const prefiltered = prefilterCandidates(allCandidates, now);
    for (const rejection of prefiltered.rejected) {
      const stat = statsBySource.get(rejection.candidate.sourceId);
      if (stat) {
        stat.filteredCount += 1;
        if (rejection.reason === "duplicate_url" || rejection.reason === "duplicate_external_id") {
          stat.duplicateCount += 1;
        }
      }
    }

    // 6. Database-level idempotency & deduplication check
    const existingCanonicalUrls = new Set<string>();
    const existingExternalKeys = new Set<string>();

    const candidateUrls = [...new Set(prefiltered.accepted.map((c) => c.canonicalUrl))];
    for (let i = 0; i < candidateUrls.length; i += 100) {
      const chunk = candidateUrls.slice(i, i + 100);
      const { data, error } = await supabase
        .from("raw_items")
        .select("canonical_url, source_id, external_id")
        .in("canonical_url", chunk);

      if (!error && data) {
        for (const row of data) {
          existingCanonicalUrls.add(row.canonical_url);
          if (row.external_id) {
            existingExternalKeys.add(`${row.source_id}:${row.external_id}`);
          }
        }
      }
    }

    const novelCandidates: NormalizedCandidate[] = [];
    for (const candidate of prefiltered.accepted) {
      const isDuplicateUrl = existingCanonicalUrls.has(candidate.canonicalUrl);
      const isDuplicateExternal =
        candidate.externalId ? existingExternalKeys.has(`${candidate.sourceId}:${candidate.externalId}`) : false;

      if (isDuplicateUrl || isDuplicateExternal) {
        const stat = statsBySource.get(candidate.sourceId);
        if (stat) {
          stat.filteredCount += 1;
          stat.duplicateCount += 1;
        }
        continue;
      }

      novelCandidates.push(candidate);
    }

    // Cap AI work per run, taking candidates round-robin across sources so one
    // busy feed cannot crowd out the rest. Anything over the cap is not
    // persisted and is picked up again on a later run.
    const candidatesToProcess = interleaveBySource(novelCandidates).slice(
      0,
      options.maxTotalCandidates ?? 150,
    );

    // If all candidates are duplicates or filtered out, end early without calling AI
    if (candidatesToProcess.length === 0) {
      const totals = computeTotals(statsBySource, 0);
      const hasErrors = Array.from(statsBySource.values()).some((s) => s.error !== null);
      const status = hasErrors
        ? collectorsToRun.length === 0
          ? "failed"
          : "partial"
        : "succeeded";

      await finishJobRun(supabase, job.id, status, 0, statsBySource, totals, startTime);
      return {
        jobId: job.id,
        status,
        itemsProcessed: 0,
        sources: Array.from(statsBySource.values()),
        totals,
        durationMs: Date.now() - startTime,
      };
    }

    // 7. AI processing pipeline
    let editor = options.editor;
    if (!editor) {
      const provider = new GeminiProvider(getGeminiApiKey(), {
        minIntervalMs: getGeminiMinIntervalMs(),
      });
      const models = getAIModelConfig();
      editor = new StoryAIEditor(provider, models);
    }

    const feedbackProfile =
      options.feedbackProfile ?? (await loadFeedbackProfile(supabase));

    const processingResult = await processCandidates(candidatesToProcess, editor, {
      now,
      minimumScore: options.minimumScore ?? 60,
      maxCandidates: options.maxTotalCandidates ?? 150,
      feedbackFor: (candidate) => feedbackProfile.feedbackFor(candidate),
    });

    for (const candidate of candidatesToProcess) {
      const stat = statsBySource.get(candidate.sourceId);
      if (stat) {
        stat.processedCount += 1;
      }
    }

    // 8. Database persistence
    // 8a. Persist processed raw_items with upsert on canonical_url. Candidates
    // whose AI step failed (e.g. quota exhausted) are left out so the next run
    // retries them instead of treating them as already-seen duplicates.
    const failedKeys = new Set(
      processingResult.failures.map((f) => `${f.sourceId}:${f.externalId}`),
    );
    const rawItemsMap = new Map<string, string>(); // canonicalUrl -> raw_item_id
    const rawPayload = candidatesToProcess
      .filter((c) => !failedKeys.has(`${c.sourceId}:${c.externalId}`))
      .map((c) => ({
      source_id: c.sourceId,
      external_id: c.externalId,
      url: c.url,
      canonical_url: c.canonicalUrl,
      title: c.title,
      excerpt: c.excerpt,
      published_at: c.publishedAt,
      fetched_at: now.toISOString(),
      raw_metadata: c.rawMetadata,
    }));

    const { data: insertedRaw, error: rawError } = await supabase
      .from("raw_items")
      .upsert(rawPayload, { onConflict: "canonical_url" })
      .select("id, canonical_url");

    if (rawError) {
      throw new Error(`Failed to persist raw items: ${rawError.message}`);
    }

    if (insertedRaw) {
      for (const item of insertedRaw) {
        rawItemsMap.set(item.canonical_url, item.id);
      }
    }

    // 8b. Persist stories and story_sources
    let totalStoriesCreated = 0;
    for (const storyDraft of processingResult.stories) {
      const allStoryCandidates = [storyDraft.candidate, ...storyDraft.additionalSources];

      const primaryChoice = choosePrimarySource<CandidateChoice>(
        allStoryCandidates.map((c) => ({
          id: c.sourceId,
          candidate: c,
          reliability: (sourceReliabilityMap.get(c.sourceId) ?? "unknown") as SourceReliability,
          publishedAt: c.publishedAt,
        })),
      );
      const primaryCandidate = primaryChoice?.candidate ?? storyDraft.candidate;

      const primaryTopicSlug =
        storyDraft.classification.topics[0] ?? primaryCandidate.topic;
      const topicId =
        topicSlugToId.get(primaryTopicSlug) ??
        topicSlugToId.get(primaryCandidate.topic) ??
        fallbackTopicId;

      const { data: storyRow, error: storyError } = await supabase
        .from("stories")
        .insert({
          title: storyDraft.summary.title,
          summary: storyDraft.summary.summary,
          why_recommended: storyDraft.summary.why_recommended,
          primary_topic_id: topicId,
          content_type: storyDraft.classification.content_type,
          interest_relevance: storyDraft.classification.interest_relevance,
          information_value: storyDraft.classification.information_value,
          importance: storyDraft.classification.importance,
          freshness: storyDraft.classification.freshness,
          discussion_popularity: storyDraft.classification.discussion_popularity,
          discovery_value: storyDraft.classification.discovery_value,
          final_score: storyDraft.ranking.finalScore,
          primary_url: primaryCandidate.url,
          published_at: primaryCandidate.publishedAt,
          image_url:
            primaryCandidate.imageUrl ??
            allStoryCandidates.find((c) => c.imageUrl)?.imageUrl ??
            null,
        })
        .select("id")
        .single();

      if (storyError) {
        console.error("Failed to insert story:", storyError.message);
        continue;
      }

      totalStoriesCreated += 1;
      const primaryStat = statsBySource.get(primaryCandidate.sourceId);
      if (primaryStat) {
        primaryStat.insertedCount += 1;
      }

      // Link raw items to story
      const links = allStoryCandidates
        .map((c) => {
          const rawItemId = rawItemsMap.get(c.canonicalUrl);
          if (!rawItemId) return null;
          return {
            story_id: storyRow.id,
            raw_item_id: rawItemId,
            is_primary: c === primaryCandidate,
          };
        })
        .filter((link): link is NonNullable<typeof link> => link !== null);

      if (links.length > 0) {
        const { error: linkError } = await supabase
          .from("story_sources")
          .upsert(links, { onConflict: "story_id,raw_item_id" });

        if (linkError) {
          console.error("Failed to attach story sources:", linkError.message);
        }
      }
    }

    // 9. Finalize job_runs record
    const totals = computeTotals(statsBySource, totalStoriesCreated);
    const hasSourceErrors = Array.from(statsBySource.values()).some((s) => s.error !== null);
    const status = hasSourceErrors
      ? totalStoriesCreated > 0
        ? "partial"
        : "failed"
      : "succeeded";

    await finishJobRun(supabase, job.id, status, totalStoriesCreated, statsBySource, totals, startTime);

    return {
      jobId: job.id,
      status,
      itemsProcessed: totalStoriesCreated,
      sources: Array.from(statsBySource.values()),
      totals,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ingestion job failed.";
    const totals = computeTotals(statsBySource, 0);
    await finishJobRun(supabase, job.id, "failed", 0, statsBySource, totals, startTime, errorMessage);
    throw error;
  }
}

export function createCollectorFromSource(
  source: SourceRow,
  topic: ContentTopic,
  fetchImplementation?: typeof fetch,
): Collector {
  const config =
    typeof source.config === "object" && source.config !== null
      ? (source.config as Record<string, unknown>)
      : {};

  switch (source.type) {
    case "rss": {
      const feedUrl =
        (typeof config.feedUrl === "string" && config.feedUrl) || source.url;
      return new RssCollector({
        sourceId: source.id,
        sourceName: source.name,
        feedUrl,
        topic,
        isDiscovery: source.is_discovery,
        fetchImplementation,
      });
    }

    case "hacker_news": {
      const list = (typeof config.list === "string" ? config.list : "topstories") as
        | "topstories"
        | "beststories"
        | "newstories";
      return new HackerNewsCollector({
        sourceId: source.id,
        sourceName: source.name,
        list,
        topic,
        fetchImplementation,
      });
    }

    case "reddit": {
      // Public subreddit RSS feed: no OAuth application or API key required.
      // "a+b+c" combines several subreddits into one request (multireddit).
      const subreddit =
        (typeof config.subreddit === "string" && config.subreddit) ||
        source.url.match(/\/r\/([A-Za-z0-9_+]+)/i)?.[1] ||
        "";
      if (!/^[A-Za-z0-9_]{2,21}(\+[A-Za-z0-9_]{2,21})*$/.test(subreddit)) {
        throw new Error(`Reddit source "${source.name}" has no valid subreddit configured.`);
      }
      const listing = typeof config.listing === "string" ? config.listing : "top";
      const period = typeof config.period === "string" ? config.period : "day";
      const feedUrl = new URL(`https://www.reddit.com/r/${subreddit}/${listing}/.rss`);
      if (listing === "top") feedUrl.searchParams.set("t", period);

      return new RssCollector({
        sourceId: source.id,
        sourceName: source.name,
        sourceType: "reddit",
        feedUrl: feedUrl.toString(),
        topic,
        isDiscovery: source.is_discovery,
        maxItems: 25,
        fetchImplementation,
      });
    }

    case "youtube": {
      // Public channel uploads feed: no YouTube Data API key required.
      const channelId =
        (typeof config.channelId === "string" && config.channelId) ||
        source.url.match(/\/channel\/([A-Za-z0-9_-]+)/)?.[1] ||
        "";
      if (!channelId) {
        throw new Error(`YouTube source "${source.name}" has no valid channelId configured.`);
      }

      return new RssCollector({
        sourceId: source.id,
        sourceName: source.name,
        sourceType: "youtube",
        feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
        topic,
        isDiscovery: source.is_discovery,
        maxItems: 15,
        fetchImplementation,
      });
    }

    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

/** Two-hour slot index, matching the ingestion schedule. */
function redditSlot(now: Date) {
  return Math.floor(now.getTime() / (2 * 60 * 60 * 1000));
}

function interleaveBySource(candidates: NormalizedCandidate[]) {
  const queues = new Map<string, NormalizedCandidate[]>();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.sourceId) ?? [];
    queue.push(candidate);
    queues.set(candidate.sourceId, queue);
  }

  const interleaved: NormalizedCandidate[] = [];
  for (let round = 0; interleaved.length < candidates.length; round += 1) {
    for (const queue of queues.values()) {
      if (round < queue.length) interleaved.push(queue[round]);
    }
  }
  return interleaved;
}

function computeTotals(
  statsMap: Map<string, SourceIngestStats>,
  storiesCreated = 0,
): IngestionJobTotals {
  let fetched = 0;
  let filtered = 0;
  let duplicates = 0;
  let processed = 0;
  let failures = 0;

  for (const stat of statsMap.values()) {
    fetched += stat.fetchedCount;
    filtered += stat.filteredCount;
    duplicates += stat.duplicateCount;
    processed += stat.processedCount;
    if (stat.error !== null) failures += 1;
  }

  return {
    fetched,
    filtered,
    duplicates,
    processed,
    storiesCreated,
    failures,
  };
}

async function finishJobRun(
  supabase: AdminClient,
  jobId: string,
  status: "succeeded" | "partial" | "failed",
  itemsProcessed: number,
  statsBySource: Map<string, SourceIngestStats>,
  totals: IngestionJobTotals,
  startTime: number,
  errorMessage?: string,
) {
  const durationMs = Date.now() - startTime;
  await supabase
    .from("job_runs")
    .update({
      status,
      items_processed: itemsProcessed,
      finished_at: new Date().toISOString(),
      error_message: errorMessage ?? (status === "failed" ? "Ingestion job failed." : null),
      metadata: {
        sources: Array.from(statsBySource.values()),
        totals,
        durationMs,
      } as unknown as Json,
    })
    .eq("id", jobId);
}
