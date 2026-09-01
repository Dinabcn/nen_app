import { useState } from "react";
import type { WatchTitle } from "../domain/catalog/types";
import { detailHref } from "./MediaCard";

type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";
type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
};

export const currentPageShareUrl = (location: Pick<Location, "origin" | "pathname" | "search">) =>
  new URL(`${location.pathname}${location.search}`, location.origin).toString();

export const detailShareData = (title: WatchTitle, origin: string): ShareData => ({
  title: title.title,
  text: `Посмотри, что можно посмотреть с ребёнком: ${title.title}`,
  url: new URL(detailHref(title), origin).toString(),
});

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

function ShareControl({ label, ariaLabel, data }: { label: string; ariaLabel: string; data: () => ShareData }) {
  const [status, setStatus] = useState("");

  const handleShare = async () => {
    const outcome = await shareWork(data(), navigator);
    setStatus(outcome === "copied" ? "Ссылка скопирована" : outcome === "failed" ? "Не удалось скопировать ссылку" : "");
  };

  return <div className="share-control">
    <button className="share-button" type="button" onClick={handleShare} aria-label={ariaLabel}>
      ↗ {label}
    </button>
    <span className="share-status" role="status" aria-live="polite">{status}</span>
  </div>;
}

export function ShareButton({ title }: { title: WatchTitle }) {
  return <ShareControl
    label="Поделиться"
    ariaLabel={`Поделиться «${title.title}»`}
    data={() => detailShareData(title, window.location.origin)}
  />;
}

export function CollectionShareButton({ sectionTitle }: { sectionTitle: string }) {
  return <ShareControl
    label="Поделиться подборкой"
    ariaLabel={`Поделиться подборкой «${sectionTitle}»`}
    data={() => ({
      title: `Подборка: ${sectionTitle}`,
      text: "Вот подборка фильмов и мультфильмов для детей",
      url: currentPageShareUrl(window.location),
    })}
  />;
}
