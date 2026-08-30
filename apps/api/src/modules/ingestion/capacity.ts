export async function queueHasCapacity(
  queue: { getWaitingCount: () => Promise<number> },
  maxWaiting: number,
): Promise<boolean> {
  if (maxWaiting === 0) return true;
  return (await queue.getWaitingCount()) < maxWaiting;
}
