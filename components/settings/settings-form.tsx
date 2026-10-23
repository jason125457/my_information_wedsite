"use client";

import { useState } from "react";

import { setSourceActive, setTopicWeight, type SettingsActionResult } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

export interface SettingsTopic {
  id: string;
  slug: string;
  label: string;
  weight: number;
}

export interface SettingsSource {
  id: string;
  name: string;
  typeLabel: string;
  topicSlug: string;
  isActive: boolean;
  isDiscovery: boolean;
}

const weightHints: Record<number, string> = {
  1: "幾乎不看",
  2: "偶爾",
  3: "一般",
  4: "常看",
  5: "最愛",
};

export function SettingsForm({ topics, sources }: { topics: SettingsTopic[]; sources: SettingsSource[] }) {
  const [topicState, setTopicState] = useState(topics);
  const [sourceState, setSourceState] = useState(sources);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  async function save(id: string, apply: () => void, rollback: () => void, action: () => Promise<SettingsActionResult>) {
    if (pending.has(id)) return;
    setPending((current) => new Set(current).add(id));
    apply();
    const result = await action().catch(() => ({ ok: false, message: "無法儲存，請再試一次。" }));
    if (result.ok) {
      setStatus({ tone: "ok", text: "已儲存" });
    } else {
      rollback();
      setStatus({ tone: "error", text: result.message ?? "無法儲存，請再試一次。" });
    }
    setPending((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function changeWeight(topic: SettingsTopic, weight: number) {
    if (weight === topic.weight) return;
    const previous = topic.weight;
    const set = (value: number) =>
      setTopicState((current) => current.map((item) => (item.id === topic.id ? { ...item, weight: value } : item)));
    void save(topic.id, () => set(weight), () => set(previous), () => setTopicWeight(topic.id, weight));
  }

  function toggleSource(source: SettingsSource) {
    const set = (value: boolean) =>
      setSourceState((current) => current.map((item) => (item.id === source.id ? { ...item, isActive: value } : item)));
    void save(source.id, () => set(!source.isActive), () => set(source.isActive), () => setSourceActive(source.id, !source.isActive));
  }

  const activeCount = sourceState.filter((source) => source.isActive).length;

  return (
    <div className="pb-16">
      <p
        aria-live="polite"
        className={cn(
          "sticky top-[72px] z-10 mt-4 h-6 text-right text-[13px] font-medium",
          status?.tone === "error" ? "text-[var(--danger)]" : "text-[var(--accent)]",
        )}
      >
        {status?.text}
      </p>

      <section aria-labelledby="weights-heading">
        <h2 id="weights-heading" className="font-serif text-2xl font-semibold">
          主題權重
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">權重越高，該主題的文章越容易排在前面；不代表固定篇數。</p>
        <ul className="mt-5 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {topicState.map((topic) => (
            <li key={topic.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span data-topic={topic.slug} className="inline-flex items-center gap-2 font-medium">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--topic)]" />
                {topic.label}
                <span className="text-[13px] font-normal text-[var(--muted)]">{weightHints[topic.weight]}</span>
              </span>
              <div role="radiogroup" aria-label={`${topic.label} 的權重`} className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    role="radio"
                    aria-checked={topic.weight === weight}
                    aria-label={`${weight}：${weightHints[weight]}`}
                    disabled={pending.has(topic.id)}
                    onClick={() => changeWeight(topic, weight)}
                    className={cn(
                      "size-10 cursor-pointer rounded-full border text-sm font-semibold tabular-nums transition-colors",
                      topic.weight === weight
                        ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                        : weight < topic.weight
                          ? "border-[var(--line-strong)] bg-[var(--surface-subtle)] text-[var(--ink-soft)]"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--line-strong)]",
                    )}
                  >
                    {weight}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sources-heading" className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="sources-heading" className="font-serif text-2xl font-semibold">
            來源
          </h2>
          <span className="text-[13px] text-[var(--muted)]">
            啟用 {activeCount} / {sourceState.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">關掉的來源下次抓取就不再讀取；已收錄的文章不受影響。</p>
        {topicState.map((topic) => {
          const group = sourceState.filter((source) => source.topicSlug === topic.slug);
          if (!group.length) return null;
          return (
            <div key={topic.id} className="mt-6">
              <h3 data-topic={topic.slug} className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
                <span aria-hidden="true" className="size-2 rounded-full bg-[var(--topic)]" />
                {topic.label}
              </h3>
              <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                {group.map((source) => (
                  <li key={source.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className={cn("min-w-0", !source.isActive && "opacity-55")}>
                      <span className="block truncate font-medium">{source.name}</span>
                      <span className="text-[13px] text-[var(--muted)]">
                        {source.typeLabel}
                        {source.isDiscovery ? " · 探索" : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={source.isActive}
                      aria-label={`${source.name}：${source.isActive ? "已啟用" : "已停用"}`}
                      disabled={pending.has(source.id)}
                      onClick={() => toggleSource(source)}
                      className={cn(
                        "relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50",
                        source.isActive ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform",
                          source.isActive && "translate-x-5",
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
