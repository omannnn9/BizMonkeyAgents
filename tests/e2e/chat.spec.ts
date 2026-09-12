import { test, expect } from "@playwright/test";

test.describe("Chat (demo mode)", () => {
  test("sending a message returns a labeled demo response with a citation", async ({ page }) => {
    await page.goto("/chat");
    const input = page.getByPlaceholder("Message the CEO Agent…");
    await input.fill("What's the status on ODAX pricing?");
    await page.getByRole("button", { name: "Send" }).click();

    // The user's own message renders in its bubble (self-end). The demo
    // reply also echoes this text in quotes as part of its own copy, so a
    // plain text match would be ambiguous — scope to the user bubble.
    await expect(
      page.locator(".self-end", { hasText: "What's the status on ODAX pricing?" }),
    ).toBeVisible();

    // The assistant reply is clearly labeled as demo, never presented as
    // real. exact:true disambiguates from the persistent top banner, whose
    // text is longer ("Demo mode — no Supabase project connected...").
    await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();

    // Markdown rendered as real elements, not literal asterisks/backticks.
    await expect(page.locator("li", { hasText: "Open tasks would be pulled live" })).toBeVisible();
    await expect(page.locator("code", { hasText: "tasks" })).toBeVisible();

    // Citation block from the demo search_documents tool call.
    await expect(page.getByText("Sources")).toBeVisible();
    await expect(page.getByText("ODAX pricing notes.txt")).toBeVisible();
  });

  test("input clears after sending and the send button disables while empty", async ({ page }) => {
    await page.goto("/chat");
    const input = page.getByPlaceholder("Message the CEO Agent…");
    const sendButton = page.getByRole("button", { name: "Send" });

    await expect(sendButton).toBeDisabled();
    await input.fill("test message");
    await expect(sendButton).toBeEnabled();
    await sendButton.click();
    await expect(input).toHaveValue("");
  });
});
