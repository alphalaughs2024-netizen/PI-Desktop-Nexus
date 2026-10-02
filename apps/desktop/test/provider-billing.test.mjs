import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await readFile(new URL("../electron/main/provider-account-adapters.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { billingProvider, fetchProviderAccount, parseProviderPrices, ProviderBillingService }=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const input=(baseUrl)=>({providerId:"saved-provider",baseUrl,apiKey:"fixture-secret"});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});

test("provider selection cannot be spoofed with substring domains",()=>{
  assert.equal(billingProvider("https://api.xkiro.com/v1"),"xkiro");
  for(const url of ["https://api.xkiro.com.evil.test/v1","https://evil.test/v1?host=api.xkiro.com","http://openrouter.ai/api/v1"]) assert.equal(billingProvider(url),"unsupported");
});
test("ordinary OpenRouter keys expose spend and unlimited key limits without wallet assumptions",async()=>{
  const result=await fetchProviderAccount(input("https://openrouter.ai/api/v1"),"month",async(url,options)=>{
    assert.equal(url,"https://openrouter.ai/api/v1/key"); assert.equal(options.redirect,"error");
    return reply({data:{usage:1.2,usage_daily:.2,limit:null,limit_remaining:null}});
  });
  assert.equal(result.snapshot.scope,"key"); assert.equal(result.snapshot.spend.amount,"1.2");
  assert.equal(result.snapshot.windows[0].limit,null); assert.equal(result.snapshot.balance,undefined);
});
test("wikivibe prefers actual charge and preserves non-dollar balance units",async()=>{
  const result=await fetchProviderAccount(input("https://api.wikivibe.ru/v1"),"month",async()=>reply({
    usage:{total:{cost:100,actual_cost:4,requests:7,total_tokens:500},today:{actual_cost:0}},billing:{unit:"credits",balance:10},
    daily_usage:[{date:"2026-10-01",actual_cost:3,total_tokens:200}],
  }));
  assert.equal(result.snapshot.spend.amount,"4"); assert.equal(result.snapshot.spend.unit,"credits");
  assert.equal(result.snapshot.balance.amount,"10"); assert.equal(result.history.points[0].tokens,200);
});
test("Xkiro account totals are separated from key scope and a history failure preserves the wallet",async()=>{
  const result=await fetchProviderAccount(input("https://api.xkiro.com/v1"),"week",async(url)=>url.endsWith("/usage")?reply({wallet:{balance_usd:"5.100000"},windows:[{kind:"day",remaining_usd:"2"}]}):reply({},503));
  assert.equal(result.snapshot.scope,"account"); assert.equal(result.snapshot.balance.amount,"5.100000"); assert.equal(result.snapshot.state,"ready");
  assert.equal(result.snapshot.spend,undefined);
});
test("custom endpoints can expose compatible usage schemas; unknown schemas stay unsupported",async()=>{
  const result=await fetchProviderAccount(input("https://private-endpoint.test/v1"),"month",async()=>reply({usage:{total:{actual_cost:2}},quota:{unit:"USD",limit:10}}));
  assert.equal(result.snapshot.spend.amount,"2"); assert.equal(result.snapshot.spend.unit,"USD");
  const missing=await fetchProviderAccount(input("https://other.test/v1"),"month",async()=>reply({welcome:true}));
  assert.equal(missing.snapshot.state,"unsupported"); assert.equal(missing.snapshot.spend,undefined);
});
test("billing requests use saved endpoint and headers, coalesce and cache; a key change invalidates them",async()=>{
  let calls=0; let key="first";
  const host={async call(method){return method==="providers.get"?{provider:{id:"p",enabled:true,baseUrl:"https://openrouter.ai/api/v1",headers:{"X-Client":"Nexus"}}}:{value:key};}};
  const service=new ProviderBillingService(host,async(url,options)=>{
    calls++; assert.equal(url,"https://openrouter.ai/api/v1/key"); assert.equal(options.headers["X-Client"],"Nexus");
    assert.equal(options.headers.Authorization,`Bearer ${key}`); assert.equal(options.redirect,"error"); return reply({data:{usage:0}});
  });
  await Promise.all([service.account("p"),service.account("p")]); await service.account("p"); assert.equal(calls,1);
  key="second"; await service.account("p"); assert.equal(calls,2);
});
test("authentication failures never become zero spend and provider prices require explicit units",async()=>{
  const result=await fetchProviderAccount(input("https://api.wikivibe.ru/v1"),"month",async()=>reply({},401));
  assert.equal(result.snapshot.error,"authentication_failed"); assert.equal(result.snapshot.spend,undefined);
  assert.deepEqual(parseProviderPrices({data:[{id:"m",pricing:{currency:"USD",unit:"per_1m_tokens",input:.3,output:1.2,cache_read:.06}}]},"xkiro").m,{input:.3,output:1.2,cacheRead:.06,cacheWrite:undefined,reasoning:undefined});
  assert.deepEqual(parseProviderPrices({data:[{id:"m",pricing:{prompt:".000001",completion:".000002"}}]},"openrouter"),{});
  assert.equal(parseProviderPrices({data:[{id:"m",pricing:{prompt:"0.000001",completion:"0.000002"}}]},"openrouter").m.input,1);
});
