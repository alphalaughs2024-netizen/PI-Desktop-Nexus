import { expect, it } from "vitest";
import { catalogs } from "../src/index.ts";

it.each(Object.entries(catalogs))("provides permission descriptions and confirmation copy in %s", (_, catalog) => {
  expect(catalog.chat.permissionApprovalQuestion.trim()).not.toBe("");
  for (const mode of ["ask", "accept-edits", "auto", "full-access"]) expect(catalog.chat.permissionDescription[mode].trim()).not.toBe("");
  expect(catalog.chat.permissionFullAccessConfirm.trim()).not.toBe("");
});

it("uses the requested English labels without claiming an automatic risk classifier", () => {
  expect(catalogs.en.chat.permissionAsk).toBe("Ask for approval");
  expect(catalogs.en.chat.permissionAuto).toBe("Approve for me");
  expect(catalogs.en.chat.permissionDescription.auto).toContain("restrictions still apply");
  expect(catalogs.en.chat.permissionDescription.auto).not.toMatch(/detected|unsafe/);
});
