import { isAuthorizedCronRequest } from "@/lib/cron/authorize";
import { ingestSources } from "@/lib/pipeline/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleCronRequest(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestSources();
    return Response.json(result);
  } catch (error) {
    console.error("Ingestion job failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json({ error: "Ingestion job failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCronRequest(request);
}

export async function POST(request: Request) {
  return handleCronRequest(request);
}
