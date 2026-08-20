import { WoobmConfigSchema, type WoobmConfig, type WoobmConfigInput, UpdateSettingsSchema, type UpdateSettingsParams } from './types';
import { WoobmAuthError, WoobmTimeoutError, WoobmConnectionError, WoobmError } from './errors';

export function stripAnsi(text: string): string {
  // Strips ANSI escape codes, color codes, and terminal control characters (e.g. \r)
  const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])|\x1B\].*?\x07|\r/g;
  return text.replace(ansiRegex, '');
}

export class WoobmClient {
  public readonly config: WoobmConfig;
  private readonly fetcher: typeof fetch;

  constructor(config: WoobmConfigInput) {
    const parsed = WoobmConfigSchema.safeParse(config);
    if (!parsed.success) {
      const secrets = config.password ? [config.password] : [];
      throw new WoobmError(`Invalid configuration: ${parsed.error.message}`, secrets);
    }
    this.config = parsed.data;
    this.fetcher = this.config.fetchFn || Bun.fetch;
  }

  private getSecrets(extraSecrets: (string | undefined)[] = []): string[] {
    const list = [this.config.password, ...extraSecrets];
    return list.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }

  private getAuthHeader(): string {
    const credentials = `${this.config.username}:${this.config.password}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  }

  private get baseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  public async executeCommand(command: string): Promise<string> {
    const secrets = this.getSecrets();
    const url = `${this.baseUrl}/terminal`;

    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': this.getAuthHeader(),
        },
        body: new URLSearchParams({ cmd: command, command: command }).toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (response.status === 401 || response.status === 403) {
        throw new WoobmAuthError(`Authentication failed for user ${this.config.username}`, secrets);
      }

      if (!response.ok) {
        throw new WoobmConnectionError(`HTTP request failed with status ${response.status}`, secrets);
      }

      const textOutput = await response.text();
      return stripAnsi(textOutput);
    } catch (err: unknown) {
      if (err instanceof WoobmError) {
        throw err;
      }
      if (err instanceof Error) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout')) {
          throw new WoobmTimeoutError(`Command execution timed out after ${this.config.timeoutMs}ms`, secrets);
        }
        throw new WoobmConnectionError(`Connection error: ${err.message}`, secrets);
      }
      throw new WoobmConnectionError('An unknown error occurred during command execution', secrets);
    }
  }

  public async updateSettings(params: UpdateSettingsParams): Promise<boolean> {
    const parsed = UpdateSettingsSchema.safeParse(params);
    if (!parsed.success) {
      const secrets = this.getSecrets([params.newPassword, params.wpaKey]);
      throw new WoobmError(`Invalid settings parameters: ${parsed.error.message}`, secrets);
    }

    const validParams = parsed.data;
    const secrets = this.getSecrets([validParams.newPassword, validParams.wpaKey]);
    const url = `${this.baseUrl}/settings`;

    const bodyParams: Record<string, string> = {};
    if (validParams.newPassword) bodyParams.password = validParams.newPassword;
    if (validParams.ssid) bodyParams.ssid = validParams.ssid;
    if (validParams.wpaKey) bodyParams.wpaKey = validParams.wpaKey;

    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': this.getAuthHeader(),
        },
        body: new URLSearchParams(bodyParams).toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (response.status === 401 || response.status === 403) {
        throw new WoobmAuthError(`Authentication failed updating settings for user ${this.config.username}`, secrets);
      }

      if (!response.ok) {
        throw new WoobmConnectionError(`HTTP request failed with status ${response.status}`, secrets);
      }

      return true;
    } catch (err: unknown) {
      if (err instanceof WoobmError) {
        throw err;
      }
      if (err instanceof Error) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout')) {
          throw new WoobmTimeoutError(`Settings update timed out after ${this.config.timeoutMs}ms`, secrets);
        }
        throw new WoobmConnectionError(`Connection error: ${err.message}`, secrets);
      }
      throw new WoobmConnectionError('An unknown error occurred during settings update', secrets);
    }
  }
}
