import { describe, expect, it } from "vitest";
import { homeQuickActions } from "./HomePage";

describe("recommend quick actions", () => {
  it("reuses all four canonical format routes", () => {
    expect(homeQuickActions.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Выбрать мультфильм", href: "/cartoons" },
      { label: "Выбрать мультсериал", href: "/animated-series" },
      { label: "Выбрать фильм", href: "/movies" },
      { label: "Выбрать сериал", href: "/series" },
    ]);
  });
});
