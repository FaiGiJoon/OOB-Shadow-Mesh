export function sanitizeMessage(message: string, secrets: string[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      result = result.split(secret).join('[REDACTED]');
    }
  }
  return result;
}

export class WoobmError extends Error {
  constructor(message: string, secrets: string[] = []) {
    super(sanitizeMessage(message, secrets));
    this.name = this.constructor.name;
  }
}

export class WoobmAuthError extends WoobmError {
  constructor(message: string = 'Authentication failed', secrets: string[] = []) {
    super(message, secrets);
  }
}

export class WoobmTimeoutError extends WoobmError {
  constructor(message: string = 'Request timed out', secrets: string[] = []) {
    super(message, secrets);
  }
}

export class WoobmConnectionError extends WoobmError {
  constructor(message: string = 'Connection failed', secrets: string[] = []) {
    super(message, secrets);
  }
}
