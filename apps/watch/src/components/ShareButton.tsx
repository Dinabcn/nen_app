import { useState } from "react";
import type { WatchTitle } from "../domain/catalog/types";
import { detailHref } from "./MediaCard";

type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";
type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
};

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Не удалось скопировать ссылку");
}

export async function shareWork(
  data: ShareData,
  shareNavigator: ShareNavigator,
  copy: (value: string) => Promise<void> = copyToClipboard,
): Promise<ShareOutcome> {
  if (shareNavigator.share) {
    try {
      await shareNavigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await copy(data.url ?? "");
    return "copied";
  } catch {
    return "failed";
  }
}

export function ShareButton({ title }: { title: WatchTitle }) {
  const [status, setStatus] = useState("");

  const handleShare = async () => {
    const url = new URL(detailHref(title), window.location.origin).toString();
    const outcome = await shareWork({
      title: title.title,
      text: `${title.title} — каталог фильмов и сериалов НЭН`,
      url,
    }, navigator);
    setStatus(outcome === "copied" ? "Ссылка скопирована" : outcome === "failed" ? "Не удалось скопировать ссылку" : "");
  };

  return <div className="share-control">
    <button className="share-button" type="button" onClick={handleShare} aria-label={`Поделиться «${title.title}»`}>
      ↗ Поделиться
    </button>
    <span className="share-status" role="status" aria-live="polite">{status}</span>
  </div>;
}
