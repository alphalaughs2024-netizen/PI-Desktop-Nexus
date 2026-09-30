// Concurrent provider intervals cannot be added to exclusive turn phase totals.
export function timingSummary(turn, requests) {
  const end = turn.endedAt ?? turn.acceptedAt + turn.elapsedMs;
  const intervals = requests
    .filter((request) => Number.isFinite(request.endedAt))
    .map((request) => [
      Math.max(turn.acceptedAt, request.startedAt),
      Math.min(end, request.endedAt),
    ])
    .filter(([start, stop]) => stop > start)
    .sort((a, b) => a[0] - b[0]);
  let providerHttpMs = 0;
  let last;
  for (const interval of intervals) {
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else {
      if (last) providerHttpMs += last[1] - last[0];
      last = [...interval];
    }
  }
  if (last) providerHttpMs += last[1] - last[0];
  return {
    totalMs: turn.elapsedMs,
    exclusivePhaseMs: turn.phaseMs,
    providerHttpUnionWithinTurnMs: providerHttpMs,
    incompleteProviderRequests: requests.filter((request) => !Number.isFinite(request.endedAt))
      .length,
    approvals:
      'Human approval waits not exercised; fixture services preapproved and other requests denied.',
    note: 'HTTP union overlaps turn phases. It includes delivery and local stream forwarding, not pure model compute. Headers/first byte need not contain answer text.',
  };
}
