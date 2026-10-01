// A Playwright `test` for browser tests. Every browser context sends its own
// `x-forwarded-for` client IP, so tests never share a rate-limit bucket.
import { test as base, type BrowserContext, type Page } from "@playwright/test";

import { uniqueIp } from "./identity";

export { expect } from "@playwright/test";

export const test = base.extend<{
  /** Opens a page for another visitor, with its own cookies and client IP. */
  newVisitor: () => Promise<Page>;
}>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": uniqueIp() });
  },

  newVisitor: async ({ browser, baseURL }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async () => {
      const context = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
      });

      contexts.push(context);
      return context.newPage();
    });

    await Promise.all(contexts.map((context) => context.close()));
  },
});
