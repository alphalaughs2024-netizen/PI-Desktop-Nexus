/** Enforced at the provider boundary, before native Codex can execute a call. */
export class CodexToolPolicy {
  private offered = new Set<string>();
  private admittedItems = new Set<string>();
  constructor(private allowed: ReadonlySet<string>) {}

  request(body: any): any {
    this.offered.clear();
    const tools = (body.tools ?? []).flatMap((tool: any) => {
      if (tool.type === "namespace") {
        const children = (tool.tools ?? []).filter((child: any) => child.type === "function" && this.allowed.has(tool.name + "__" + child.name));
        for (const child of children) this.offered.add(tool.name + "__" + child.name);
        return children.length ? [{ ...tool, tools: children }] : [];
      }
      if (tool.type === "function" && !tool.namespace && this.allowed.has(tool.name)) {
        this.offered.add(tool.name); return [tool];
      }
      return [];
    });
    if (body.tool_choice && typeof body.tool_choice === "object" &&
      (body.tool_choice.type !== "function" || !this.offered.has(body.tool_choice.name))) {
      throw new Error("CODEX_TOOL_POLICY_DENIED");
    }
    return { ...body, tools };
  }

  private item(item: any): void {
    if (!item || ["message", "reasoning", "compaction"].includes(item.type)) return;
    const name = item.namespace ? item.namespace + "__" + item.name : item.name;
    if (item.type !== "function_call" || !this.offered.has(name)) {
      throw new Error("CODEX_TOOL_POLICY_DENIED");
    }
    if (item.id) this.admittedItems.add(item.id);
  }

  response(body: any): any {
    for (const item of body.output ?? []) this.item(item);
    return body;
  }

  event(event: any): void {
    if (event.item) this.item(event.item);
    if (event.response) this.response(event.response);
    if (/tool_call|function_call_arguments/.test(event.type ?? "") &&
      (!event.item_id || !this.admittedItems.has(event.item_id))) {
      throw new Error("CODEX_TOOL_POLICY_DENIED");
    }
  }
}
