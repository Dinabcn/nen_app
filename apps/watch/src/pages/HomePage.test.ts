import { describe, expect, it } from "vitest";
import { homeQuickActions } from "./HomePage";

describe("home quick actions", () => {
  it("offers all four formats and links each one to its canonical section", () => {
    expect(homeQuickActions.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Выбрать мультфильм", href: "/cartoons" },
      { label: "Выбрать мультсериал", href: "/animated-series" },
      { label: "Выбрать фильм", href: "/movies" },
      { label: "Выбрать сериал", href: "/series" },
    ]);
  });
});
