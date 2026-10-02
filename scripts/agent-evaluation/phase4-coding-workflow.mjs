import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as reservePort } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CodexController } from "../../packages/agent-runtime/dist/codex/controller.js";
import { runPreviewServer } from "../../apps/desktop/electron/main/preview-server.ts";
import { collectWorkspaceDiff } from "../../apps/desktop/electron/main/git-diff.ts";
import { NEXUS_LOCAL_TOOL_SCHEMAS } from "../../apps/desktop/electron/main/nexus-tool-schemas.ts";
import { JsonRpcProcess } from "./process.mjs";
import { waitUntil } from "./codex-stream-steering.mjs";

// Real Codex, host runner and Git; deterministic local Responses, no account/API calls.
const directory = resolve(process.argv[2]);
const binary = resolve(process.argv[3]);
const workspace = join(directory, "project");
await mkdir(workspace, {recursive:true});
await writeFile(join(workspace,"README.md"),"Phase 4 fixture\n");
const git = (cwd,...args) => execFileSync("git",args,{cwd,encoding:"utf8",windowsHide:true}).trim();
git(workspace,"init"); git(workspace,"config","user.name","Nexus fixture"); git(workspace,"config","user.email","nexus@example.invalid");
git(workspace,"config","core.autocrlf","false"); git(workspace,"add","."); git(workspace,"commit","-m","base");
const portReservation = reservePort(); await new Promise(r=>portReservation.listen(0,"127.0.0.1",r));
const previewPort = portReservation.address().port; await new Promise(r=>portReservation.close(r));
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const rpc = new JsonRpcProcess(binary,[],{env:{...process.env,PI_DESKTOP_DATA_DIR:join(directory,"host")}},()=>{});
const send = rpc.send.bind(rpc); rpc.send = value=>send({jsonrpc:"2.0",...value});
const rawHost = {call:(method,params,timeout)=>rpc.request(method,params,timeout)};
const events=[]; const requests=[]; let failure; let sequence=0; let stale=false; let shell;
const fixture = createServer(async (request,response)=>{
  try {
    const chunks=[]; for await(const chunk of request) chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks));
    assert(JSON.stringify(body.input).includes("You are Nexus, the assistant inside the Nexus desktop app"),"Nexus identity must reach the execution backend");
    const tools=(body.tools??[]).flatMap(tool=>tool.tools?.map(child=>({...child,namespace:tool.name}))??[tool]);
    requests.push({sequence,stale,tools:tools.map(t=>t.name),input:body.input});
    const call=(name,args)=>{const tool=tools.find(t=>t.name===name);assert(tool,`Missing ${name}`);return {id:`item-${requests.length}`,call_id:`call-${requests.length}`,type:tool.type==="custom"?"custom_tool_call":"function_call",name,
      ...(tool.namespace?{namespace:tool.namespace}:{}),...(tool.type==="custom"?{input:args}:{arguments:JSON.stringify(args)}),status:"completed"};};
    let item;
    if(stale && sequence++===0) item=call("apply_patch","*** Begin Patch\n*** Update File: calc.mjs\n@@\n-deliberately absent old text\n+wrong replacement\n*** End Patch");
    else if(!stale && sequence===0) { sequence++; item=call("apply_patch","*** Begin Patch\n*** Add File: calc.mjs\n+export const add = (a, b) => a + b;\n*** Add File: calc.test.mjs\n+import {test} from 'node:test';\n+import assert from 'node:assert/strict';\n+import {add} from './calc.mjs';\n+test('adds', () => assert.equal(add(2, 3), 5));\n*** Add File: server.mjs\n+import {createServer} from 'node:http';\n+import {add} from './calc.mjs';\n+createServer((req,res)=>res.end('<!doctype html><title>Phase 4</title><h1 id=\"result\">'+add(2,3)+'</h1>')).listen(Number(process.argv[2]),'127.0.0.1',()=>console.log('preview-ready'));\n*** End Patch"); }
    else if(!stale && sequence===1) { sequence++; item=call("exec_command",{cmd:"node --test calc.test.mjs",workdir:workspace,yield_time_ms:1000,max_output_tokens:1500}); }
    else if(!stale && sequence===2) { sequence++; item=call("PreviewServer",{operation:"start",command:`node server.mjs ${previewPort}`,url:previewUrl,waitMs:10000}); }
    else item={id:`answer-${requests.length}`,type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:stale?"Stale patch rejected":"Build, test and preview observed",annotations:[]}]};
    response.writeHead(200,{"Content-Type":"text/event-stream"});
    const emit=(type,payload)=>response.write("data: "+JSON.stringify({type,...payload})+"\n\n");
    const id=`response-${requests.length}`;
    emit("response.created",{response:{id,status:"in_progress",output:[]}});
    emit("response.output_item.added",{output_index:0,item:{...item,status:"in_progress"}});
    emit("response.output_item.done",{output_index:0,item});
    emit("response.completed",{response:{id,status:"completed",output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});response.end();
  } catch(error) {failure=error;response.writeHead(500).end();}
});
await new Promise(r=>fixture.listen(0,"127.0.0.1",r));
const host = {call:async(method,params,timeout)=>{
  if(method==="tools.list") {
    const catalog=await rawHost.call(method,params,timeout);
    return {tools:[...catalog.tools,{name:"PreviewServer",...NEXUS_LOCAL_TOOL_SCHEMAS.PreviewServer}]};
  }
  if(method==="tools.execute"&&params.toolName==="PreviewServer") return runPreviewServer(rawHost,params,shell);
  return rawHost.call(method,params,timeout);
}};
process.env.PI_DESKTOP_DATA_DIR=join(directory,"codex");
const controller=new CodexController(event=>events.push(event),host);controller.configure(process.env.PI_DESKTOP_DATA_DIR);
try {
  await rawHost.call("app.handshake",{protocolVersion:11});
  const {session}=await rawHost.call("session.create",{title:"Phase 4 coding",mode:"agent",projectPath:workspace});
  await rawHost.call("session.configure",{id:session.id,mode:"agent",permissionMode:"auto"});
  shell=(await rawHost.call("commandShells.list",{})).effective;
  const provider={id:"fixture",name:"Local fixture",modelId:"phase4",authKind:"none",apiStyle:"responses",baseUrl:`http://127.0.0.1:${fixture.address().port}/v1`,supportsReasoning:false,supportedThinkingLevels:[],modelConfig:{input:["text"],contextWindow:32768,maxTokens:2048}};
  const turn=async(id)=>{
    await controller.handle("agent.prompt",{sessionId:session.id,turnId:id,mode:"agent",permissionMode:"full-access",provider,projectPath:workspace,scratchDir:workspace,commandShell:shell,content:"Run the controlled coding fixture"});
    await waitUntil(()=>events.some(e=>e.turnId===id&&e.event.type==="agent_end"),45000);
    if(failure) throw failure;
    const {snapshot}=await controller.handle("agent.engineSnapshot",{sessionId:session.id});
    assert.equal(snapshot.turn.outcome,"completed",JSON.stringify(snapshot.turn));return snapshot;
  };
  const first=await turn("coding");
  assert.equal(await readFile(join(workspace,"calc.mjs"),"utf8"),"export const add = (a, b) => a + b;\n");
  const patch=first.items.find(i=>i.label==="apply_patch"&&i.result?.details?.nativeFileChanges);
  assert.equal(patch?.result.details.nativeFileChanges.length,3,"Native multi-file evidence must reach Nexus");
  assert(first.items.some(i=>i.label==="exec_command"&&i.status==="completed"&&/pass 1/.test(i.text)),"Observed test success required");
  const list=await rawHost.call("process.read",{sessionId:session.id});assert.equal(list.processes.length,1);
  const id=list.processes[0].id;
  const later=await runPreviewServer(rawHost,{sessionId:session.id,toolCallId:"later",mode:"plan",args:{operation:"status",id,waitMs:0}},shell);
  assert(later.content.ready);assert.match(await(await fetch(previewUrl)).text(),/<h1 id="result">5/);
  const desktopRequire=createRequire(new URL("../../apps/desktop/package.json",import.meta.url));
  const browser=await desktopRequire("playwright-core").chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try {
    const page=await browser.newPage();await page.goto(previewUrl);
    assert.equal(await page.locator("#result").innerText(),"5");
    await page.screenshot({path:join(directory,"preview.png")});
  } finally {await browser.close();}
  const diff=await collectWorkspaceDiff(workspace);assert(diff.files.some(f=>f.path==="calc.mjs"));
  stale=true;sequence=0;const second=await turn("stale");
  assert(second.items.some(i=>i.label==="apply_patch"&&i.status==="failed"));
  assert.equal(await readFile(join(workspace,"calc.mjs"),"utf8"),"export const add = (a, b) => a + b;\n");
  assert(!second.items.some(i=>i.result?.details?.nativeFileChanges));
  await rawHost.call("process.stop",{sessionId:session.id,id});
  await assert.rejects(fetch(previewUrl));
  git(workspace,"add",".");git(workspace,"commit","-m","validated coding output");
  const require=createRequire(new URL("../../packages/agent-runtime/package.json",import.meta.url));
  const load=require("jiti")(import.meta.url);
  const {runGitWorktreeOperation,managedWorktreePath}=load(fileURLToPath(new URL("../../apps/desktop/electron/main/git-worktrees.ts",import.meta.url)));
  const confirmations=[];const deps={dataDir:join(directory,"git"),resolveWorkspace:async()=>workspace,confirm:async(title,detail)=>{confirmations.push({title,detail});return true;}};
  const branch="nexus/phase4-fixture";
  await runGitWorktreeOperation(deps,session.id,{operation:"create",branch});
  const worktree=managedWorktreePath(workspace,branch);await writeFile(join(worktree,"feature.txt"),"validated\n");
  git(worktree,"add",".");git(worktree,"commit","-m","fixture feature");
  await runGitWorktreeOperation(deps,session.id,{operation:"merge",branch});
  await runGitWorktreeOperation(deps,session.id,{operation:"cleanup",branch});
  assert.equal(await readFile(join(workspace,"feature.txt"),"utf8"),"validated\n");assert.equal(confirmations.length,3);
  const report={passed:true,scope:"Real Codex native patch and foreground tests; real Rust preview lifecycle; real managed Git. Local scripted Responses, no external model or spend.",
    checks:["native multi-file edit/review","foreground Node tests","later-turn preview inspection","rendered browser result","stale patch refusal","user process stop","Git create/commit/merge/cleanup"],confirmations,events,requests};
  await writeFile(join(directory,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,directory,checks:report.checks}));
} catch(error) {await writeFile(join(directory,"failure.json"),JSON.stringify({error:String(error),events,requests},null,2));throw error;}
finally {await controller.shutdown();await rpc.close();fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
