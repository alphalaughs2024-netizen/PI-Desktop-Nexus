import assert from "node:assert/strict";
import test from "node:test";
import { nativeReviewChanges } from "../../../packages/shared/src/native-review.ts";

test("native review retains operations and rename evidence without fake snapshots", () => {
  const changes = nativeReviewChanges([{ path: "a.ts", kind: {type:"update",move_path:"b.ts"}, diff:"-old\n+new" },
    {path:"deleted.ts",kind:{type:"delete"}}, {path:"bad.ts",kind:{type:"unknown"}}, null]);
  assert.equal(changes.length,2);
  assert.deepEqual(changes[0],{path:"b.ts",oldPath:"a.ts",operation:"update",diff:"-old\n+new",truncated:false});
  assert.equal(changes[0].snapshotId,undefined);
});
test("native review bounds UTF-8 diff bytes and file count", () => {
  const changes = nativeReviewChanges(Array.from({length:130},(_,i)=>({path:`${i}.txt`,operation:"add",diff:"🔥".repeat(100000)})));
  assert.equal(changes.length,100);
  assert(changes[0].truncated);
  assert(changes[1].truncated);
  assert(changes.reduce((size,change)=>size+Buffer.byteLength(change.diff),0)<=200*1024);
  assert(!changes[0].diff.includes("�"));
});
