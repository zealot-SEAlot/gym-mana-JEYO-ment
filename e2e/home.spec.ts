import { expect, test } from "@playwright/test";

// Placeholder: proves Playwright can build the client, serve it, and open it in Chromium. U22 adds the real door-scan test.
test("the home page shows the gym's name", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jeyo's Hardhit Fitness Center");
});
