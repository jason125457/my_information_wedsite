import { isAuthorizedCronRequest } from "@/lib/cron/authorize";
import { generateDailyDigest } from "@/lib/digest/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await generateDailyDigest());
  } catch (error) {
    console.error("Daily digest job failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json({ error: "Daily digest job failed." }, { status: 500 });
  }
}
