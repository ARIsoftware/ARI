export function getPgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}
