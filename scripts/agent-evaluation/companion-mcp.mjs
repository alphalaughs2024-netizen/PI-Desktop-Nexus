import { createInterface } from 'node:readline';
import { companion } from './companion.mjs';
const service = await companion(process.env.NEXUS_EVALUATION_WORKSPACE, {
  mutationProbe: process.env.NEXUS_EVALUATION_MUTATION === 'true',
});
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
for await (const line of createInterface({ input: process.stdin })) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    continue;
  }
  if (request.id === undefined) continue;
  try {
    let result;
    if (request.method === 'initialize')
      result = {
        protocolVersion: request.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'nexus-evaluation-companion', version: '1.0.0' },
      };
    else if (request.method === 'tools/list')
      result = {
        tools: service.tools.map(({ parameters, ...tool }) => ({
          ...tool,
          inputSchema: parameters,
        })),
      };
    else if (request.method === 'tools/call')
      result = await service.execute(request.params.name, request.params.arguments ?? {});
    else if (request.method === 'ping') result = {};
    else {
      send({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' },
      });
      continue;
    }
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        isError: true,
        content: [{ type: 'text', text: String(error.message).slice(0, 300) }],
      },
    });
  }
}
await service.close();
