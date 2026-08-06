export function invitationResponse<T extends { expiresAt: Date }>(row: T) {
  return { ...row, expiresAt: row.expiresAt.toISOString() };
}
