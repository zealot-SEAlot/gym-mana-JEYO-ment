import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App.tsx";

describe("App", () => {
  it("shows the gym's name as the page heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Jeyo's Hardhit Fitness Center",
    );
  });
});
