import { describe, expect, it, vi } from "vitest";
import { shareWork } from "./ShareButton";

const data = { title: "Матильда", text: "Матильда — каталог НЭН", url: "https://example.test/movies/matilda" };

describe("shareWork", () => {
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
});
