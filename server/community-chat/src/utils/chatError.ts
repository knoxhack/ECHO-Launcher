export class ChatError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (!value) throw new ChatError(message, 404)
  return value
}
