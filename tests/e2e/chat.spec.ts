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

  test("OD Holdings shows the group agent switcher by default (CEO, Group CFO, Group Strategy)", async ({
    page,
  }) => {
    await page.goto("/chat");
    const agentSwitcher = page.getByLabel("Active agent");
    await expect(agentSwitcher).toBeVisible();
    const options = await agentSwitcher.locator("option").allTextContents();
    expect(options.some((o) => o.includes("Group CFO"))).toBe(true);
    expect(options.some((o) => o.includes("Group Strategy"))).toBe(true);
  });

  test("asking the Group CFO for synergies calls detect_synergies in its demo reply", async ({ page }) => {
    await page.goto("/chat");
    await page.getByLabel("Active agent").selectOption({ label: "Group CFO — Chief Financial Officer" });
    const input = page.getByPlaceholder(/Message the Group CFO/);
    await input.fill("Any cross-company synergies worth flagging?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Group CFO.", { exact: false }).last()).toBeVisible();
    await expect(page.getByText("both independently noted the same F&B")).toBeVisible();
  });

  test("switching to ODAX reveals the Sales/Marketing agent switcher, and switching agent changes the demo reply", async ({
    page,
  }) => {
    await page.goto("/chat");
    await page.locator("select:visible").first().selectOption({ label: "ODAX" });
    const agentSwitcher = page.getByLabel("Active agent");
    await expect(agentSwitcher).toBeVisible();
    const options = await agentSwitcher.locator("option").allTextContents();
    expect(options.some((o) => o.includes("Sales Agent"))).toBe(true);
    expect(options.some((o) => o.includes("Marketing Agent"))).toBe(true);

    await agentSwitcher.selectOption({ label: "Sales Agent — Sales" });
    const input = page.getByPlaceholder(/Message the Sales Agent/);
    await input.fill("acme.com");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Sales Agent.", { exact: false }).last()).toBeVisible();
    await expect(page.getByText("Apollo.io and the OSL lead-scoring model")).toBeVisible();
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
