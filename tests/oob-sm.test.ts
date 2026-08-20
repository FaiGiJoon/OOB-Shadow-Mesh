import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { WoobmClient } from '../src/client';
import { WoobmAuthError, WoobmTimeoutError, WoobmConnectionError, WoobmError } from '../src/errors';
import { encryptText, decryptText } from '../src/crypto';
import { AuditStore } from '../src/storage';
import { PlaybookRunner } from '../src/playbook';
import { WifiScanner } from '../src/wifi';
import { unlinkSync, existsSync } from 'fs';

describe('WoobmClient', () => {
  test('initializes with valid defaults and custom config', () => {
    const client = new WoobmClient({ password: 'secretpassword' });
    expect(client.config.host).toBe('192.168.4.1');
    expect(client.config.port).toBe(80);
    expect(client.config.username).toBe('admin');
    expect(client.config.password).toBe('secretpassword');
    expect(client.config.timeoutMs).toBe(5000);
  });

  test('throws WoobmError on invalid config', () => {
    expect(() => new WoobmClient({ password: '', port: -1 } as any)).toThrow(WoobmError);
  });

  test('executeCommand returns sanitized output on successful fetch', async () => {
    const mockFetch = (async (url: string, init: any) => {
      expect(url).toBe('http://192.168.4.1:80/terminal');
      expect(init.headers['Authorization']).toBeDefined();
      return new Response('\x1B[31mRouterOS v7.1\x1B[0m\r\n[admin@MikroTik] > ', { status: 200 });
    }) as unknown as typeof fetch;

    const client = new WoobmClient({ password: 'test', fetchFn: mockFetch });
    const output = await client.executeCommand('/ip firewall print');
    expect(output).toBe('RouterOS v7.1\n[admin@MikroTik] > ');
  });

  test('executeCommand throws WoobmAuthError on 401', async () => {
    const mockFetch = (async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;

    const client = new WoobmClient({ password: 'secretpassword', fetchFn: mockFetch });
    await expect(client.executeCommand('test')).rejects.toThrow(WoobmAuthError);
  });

  test('executeCommand throws WoobmTimeoutError on timeout', async () => {
    const mockFetch = (async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;

    const client = new WoobmClient({ password: 'test', timeoutMs: 100, fetchFn: mockFetch });
    await expect(client.executeCommand('test')).rejects.toThrow(WoobmTimeoutError);
  });

  test('sanitizes password from error messages', async () => {
    const secret = 'super-secret-password-123';
    const mockFetch = (async () => {
      throw new Error(`Failed to connect with password ${secret}`);
    }) as unknown as typeof fetch;

    const client = new WoobmClient({ password: secret, fetchFn: mockFetch });
    try {
      await client.executeCommand('test');
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.message).not.toContain(secret);
      expect(err.message).toContain('[REDACTED]');
    }
  });

  test('updateSettings sends parameters correctly', async () => {
    let requestBody = '';
    const mockFetch = (async (url: string, init: any) => {
      expect(url).toBe('http://192.168.4.1:80/settings');
      requestBody = init.body;
      return new Response('OK', { status: 200 });
    }) as unknown as typeof fetch;

    const client = new WoobmClient({ password: 'admin', fetchFn: mockFetch });
    const success = await client.updateSettings({
      newPassword: 'newpass123',
      ssid: 'WoobmSecured',
      wpaKey: 'wpapassphrase123',
    });
    expect(success).toBe(true);
    expect(requestBody).toContain('password=newpass123');
    expect(requestBody).toContain('ssid=WoobmSecured');
    expect(requestBody).toContain('wpaKey=wpapassphrase123');
  });
});

describe('Crypto Helper', () => {
  const originalEnv = process.env.OOB_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.OOB_ENCRYPTION_KEY = 'test-master-encryption-key-32chars!!';
  });

  afterEach(() => {
    process.env.OOB_ENCRYPTION_KEY = originalEnv;
  });

  test('encrypts and decrypts text accurately', async () => {
    const plaintext = 'RouterOS terminal output log with confidential credentials';
    const encrypted = await encryptText(plaintext);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptText(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test('throws error if OOB_ENCRYPTION_KEY is missing', async () => {
    delete process.env.OOB_ENCRYPTION_KEY;
    await expect(encryptText('test')).rejects.toThrow('OOB_ENCRYPTION_KEY environment variable is required');
  });
});

describe('AuditStore', () => {
  const dbFile = 'test_audit.db';
  const originalEnv = process.env.OOB_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.OOB_ENCRYPTION_KEY = 'test-master-encryption-key-32chars!!';
    if (existsSync(dbFile)) {
      unlinkSync(dbFile);
    }
  });

  afterEach(() => {
    process.env.OOB_ENCRYPTION_KEY = originalEnv;
    if (existsSync(dbFile)) {
      unlinkSync(dbFile);
    }
  });

  test('saves and retrieves encrypted audit logs', async () => {
    const store = new AuditStore(dbFile);

    const savedRecord = await store.saveLog({
      targetIp: '192.168.4.1',
      command: '/system identity print',
      output: 'name: MikroTik-Core',
      status: 'success',
    });

    expect(savedRecord.id).toBeDefined();
    expect(savedRecord.encrypted_output).not.toBe('name: MikroTik-Core');

    const retrieved = await store.getLogById(savedRecord.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.targetIp).toBe('192.168.4.1');
    expect(retrieved?.command).toBe('/system identity print');
    expect(retrieved?.output).toBe('name: MikroTik-Core');
    expect(retrieved?.status).toBe('success');

    const allLogs = await store.getAllLogs();
    expect(allLogs.length).toBe(1);
    expect(allLogs[0].output).toBe('name: MikroTik-Core');

    store.close();
  });
});

describe('PlaybookRunner', () => {
  const dbFile = 'test_playbook_audit.db';
  const originalEnv = process.env.OOB_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.OOB_ENCRYPTION_KEY = 'test-master-encryption-key-32chars!!';
    if (existsSync(dbFile)) {
      unlinkSync(dbFile);
    }
  });

  afterEach(() => {
    process.env.OOB_ENCRYPTION_KEY = originalEnv;
    if (existsSync(dbFile)) {
      unlinkSync(dbFile);
    }
  });

  test('executes playbook steps sequentially and respects expectedPattern and haltOnError', async () => {
    const executedCommands: string[] = [];

    const mockFetch = (async (_url: string, init: any) => {
      const body = init.body;
      if (body.includes('cmd=%2Fip+firewall+flush')) {
        executedCommands.push('/ip firewall flush');
        return new Response('Flushed firewall rules', { status: 200 });
      } else if (body.includes('cmd=%2Fsystem+reboot')) {
        executedCommands.push('/system reboot');
        return new Response('Rebooting...', { status: 200 });
      } else if (body.includes('cmd=fail-cmd')) {
        executedCommands.push('fail-cmd');
        return new Response('Unexpected error', { status: 200 });
      }
      return new Response('OK', { status: 200 });
    }) as unknown as typeof fetch;

    const client = new WoobmClient({ password: 'test', fetchFn: mockFetch });
    const store = new AuditStore(dbFile);
    const runner = new PlaybookRunner(client, store);

    const playbook = {
      name: 'Emergency Flush',
      steps: [
        { command: '/ip firewall flush', expectedPattern: 'Flushed' },
        { command: 'fail-cmd', expectedPattern: 'ExpectedMatch', haltOnError: true },
        { command: '/system reboot' },
      ],
    };

    const result = await runner.run(playbook);

    expect(result.success).toBe(false);
    expect(result.stepResults.length).toBe(2); // Step 3 should not run because haltOnError was true for step 2
    expect(executedCommands).toEqual(['/ip firewall flush', 'fail-cmd']);

    const logs = await store.getAllLogs();
    expect(logs.length).toBe(2);

    store.close();
  });
});

describe('WifiScanner', () => {
  test('parses nmcli output correctly', () => {
    const rawNmcli = `
WoobmAP-1234:85:WPA2
OtherSSID:40:WPA1
WoobmAP-5678:92:NONE
`;
    const networks = WifiScanner.parseNmcliOutput(rawNmcli);
    expect(networks.length).toBe(2);
    expect(networks[0]).toEqual({ ssid: 'WoobmAP-1234', signalStrength: 85, security: 'WPA2' });
    expect(networks[1]).toEqual({ ssid: 'WoobmAP-5678', signalStrength: 92, security: 'NONE' });
  });

  test('parses airport output correctly', () => {
    const rawAirport = `
                            SSID BSSID             RSSI CHANNEL HT CC SECURITY (SSID_STR)
                     WoobmAP-ABCD 00:11:22:33:44:55 -55  6       Y  US WPA2(PSK/AES/AES)
                      OtherNetwork aa:bb:cc:dd:ee:ff -70  11      Y  US WPA2(PSK/AES/AES)
                     WoobmAP-9999 11:22:33:44:55:66 -40  1       Y  US NONE
`;
    const networks = WifiScanner.parseAirportOutput(rawAirport);
    expect(networks.length).toBe(2);
    expect(networks[0].ssid).toBe('WoobmAP-ABCD');
    expect(networks[0].signalStrength).toBe(-55);
    expect(networks[1].ssid).toBe('WoobmAP-9999');
    expect(networks[1].signalStrength).toBe(-40);
  });
});
