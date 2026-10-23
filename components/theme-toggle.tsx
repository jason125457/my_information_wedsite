"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const order: ThemeChoice[] = ["system", "light", "dark"];
const labels: Record<ThemeChoice, string> = { system: "跟隨系統", light: "淺色", dark: "深色" };

/** Inline in <head>: applies a saved theme before first paint (no flash). */
export const themeBootScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const CHANGE_EVENT = "themechange";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The applied override lives on <html data-theme>; no attribute means "system". */
function currentChoice(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

/** Cycles 跟隨系統 → 淺色 → 深色. "System" removes the override. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, currentChoice, () => "system" as ThemeChoice);

  function cycle() {
    const next = order[(order.indexOf(choice) + 1) % order.length];
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`外觀：${labels[choice]}（點擊切換）`}
      title={`外觀：${labels[choice]}`}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--line-strong)]"
    >
      <Icon aria-hidden="true" size={17} />
    </button>
  );
}
