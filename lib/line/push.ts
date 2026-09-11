interface DigestNotification {
  accessToken: string;
  targetUserId: string;
  appUrl: string;
  itemCount: number;
  topicCounts: Record<string, number>;
  retryKey?: string;
}

export async function sendLineDigestNotification(
  notification: DigestNotification,
  fetchImplementation: typeof fetch = fetch,
) {
  const digestUrl = new URL("/digest", notification.appUrl).toString();
  const counts = Object.entries(notification.topicCounts)
    .filter(([, count]) => count > 0)
    .map(([topic, count]) => `${topic} ${count}`)
    .join(" · ");
  const text = [
    `今天有 ${notification.itemCount} 則值得你看 👀`,
    counts,
    "查看今日 Digest",
    digestUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetchImplementation("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notification.accessToken}`,
      "Content-Type": "application/json",
      ...(notification.retryKey ? { "X-Line-Retry-Key": notification.retryKey } : {}),
    },
    body: JSON.stringify({
      to: notification.targetUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE push failed with HTTP ${response.status}.`);
  }
}
