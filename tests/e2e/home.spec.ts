import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/.+/);
  await expect(page.getByRole("link", { name: "Get Started" })).toHaveAttribute(
    "href",
    "/sign-up",
  );
});