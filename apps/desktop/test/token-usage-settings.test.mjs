import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=async(path)=>readFile(new URL(path,import.meta.url),"utf8");
test("usage stays a native settings destination and retains the legacy history API",async()=>{
  const page=await read("../src/pages/SettingsPage.tsx"); const api=await read("../src/lib/api.ts");
  assert.match(page,/UsagePage/); assert.match(api,/getTokenUsageHistory/); assert.match(api,/getUsageLedger/);
});
test("popover scopes and dashboard breakdown use ledger totals with provider accounts separate",async()=>{
  const popover=await read("../src/components/usage/CostPopover.tsx"); const dashboard=await read("../src/components/settings/UsagePage.tsx");
  assert.match(popover,/This chat/); assert.match(popover,/All Nexus usage/); assert.match(popover,/spendTotal\(totals\)/);
  assert.match(dashboard,/Recent requests/); assert.match(dashboard,/Provider balances/); assert.match(dashboard,/legacyTurns/);
  assert.doesNotMatch(dashboard,/row.cost === 0|usage-hero|Object.values\(providerModels\).flat/);
});
test("provider IPC never accepts a renderer-supplied endpoint for credential routing",async()=>{
  const api=await read("../src/lib/api.ts"); const main=await read("../electron/main/index.ts");
  assert.match(api,/getProviderAccount: \(input: \{ providerId: string; period\?/);
  assert.match(main,/providerBilling.account\(input.providerId, input.period\)/);
  assert.doesNotMatch(main,/adapter.getSnapshot\(\{ providerId: input.providerId, baseUrl: input.baseUrl/);
});
