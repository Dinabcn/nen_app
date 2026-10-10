import { describe, expect, it } from "vitest";
import type { WatchTitle } from "../domain/catalog/types";
import { frameCaption, frameTypeLabel } from "./MediaCard";

const title = (productionKind: WatchTitle["productionKind"]) => ({
  productionKind,
  title: "Тест",
  year: 2024,
  frame: { url: "https://example.com/frame.jpg" },
} as WatchTitle);

describe("frame captions", () => {
  it.each([
    ["animated-feature", "мультфильма"],
    ["animated-short", "мультфильма"],
    ["animated-series", "мультсериала"],
    ["movie", "фильма"],
    ["series", "сериала"],
  ] as const)("uses the correct genitive form for %s", (kind, expected) => {
    expect(frameTypeLabel(title(kind))).toBe(expected);
    expect(frameCaption(title(kind))).toBe(`Кадр из ${expected} «Тест» (2024)`);
  });
});
