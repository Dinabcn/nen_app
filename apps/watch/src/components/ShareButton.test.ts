import { describe, expect, it, vi } from "vitest";
import { currentPageShareUrl, detailShareData, shareWork } from "./ShareButton";
import type { WatchTitle } from "../domain/catalog/types";

const data = { title: "Матильда", text: "Матильда — каталог НЭН", url: "https://example.test/movies/matilda" };

describe("shareWork", () => {
  it("builds the canonical detail URL for the exact work", () => {
    const title = { title: "Матильда", slug: "matilda", productionKind: "movie", contentType: "movie" } as WatchTitle;
    expect(detailShareData(title, "https://watch.example")).toEqual({
      title: "Матильда",
      text: "Посмотри, что можно посмотреть с ребёнком: Матильда",
      url: "https://watch.example/movies/matilda",
    });
  });

  it("uses Web Share API when it is available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(shareWork(data, { share }, copy)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    expect(copy).not.toHaveBeenCalled();
  });

  it("copies the exact detail URL when Web Share API is unavailable", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(shareWork(data, {}, copy)).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(data.url);
  });

  it("does not copy after the user cancels the native share sheet", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(shareWork(data, { share }, copy)).resolves.toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });

  it("falls back to copying after another Web Share error", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new Error("Unavailable"));
    await expect(shareWork(data, { share }, copy)).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(data.url);
  });

  it("keeps the complete collection state in the shared URL", () => {
    expect(currentPageShareUrl({
      origin: "https://watch.example",
      pathname: "/movies",
      search: "?age=8&mood=calm&theme=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0",
    })).toBe("https://watch.example/movies?age=8&mood=calm&theme=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0");
  });

  it("keeps different collections independent", () => {
    const first = currentPageShareUrl({ origin: "https://watch.example", pathname: "/cartoons", search: "?age=6" });
    const second = currentPageShareUrl({ origin: "https://watch.example", pathname: "/series", search: "?age=12&q=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0" });
    expect(first).not.toBe(second);
    expect(first).toBe("https://watch.example/cartoons?age=6");
    expect(second).toBe("https://watch.example/series?age=12&q=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0");
  });
});
