import { Database } from 'bun:sqlite';
import { encryptText, decryptText } from './crypto';

export interface AuditLogRecord {
  id: string;
  timestamp: number;
  target_ip: string;
  command: string;
  encrypted_output: string;
  status: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  targetIp: string;
  command: string;
  output: string;
  status: string;
}

export class AuditStore {
  private db: Database;

  constructor(dbPath: string = 'oob_audit.db') {
    this.db = new Database(dbPath);
    this.initTable();
  }

  private initTable(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        target_ip TEXT,
        command TEXT,
        encrypted_output TEXT,
        status TEXT
      )
    `);
  }

  public async saveLog(entry: {
    id?: string;
    timestamp?: number;
    targetIp: string;
    command: string;
    output: string;
    status: 'success' | 'failed' | 'halted' | string;
  }): Promise<AuditLogRecord> {
    const id = entry.id || crypto.randomUUID();
    const timestamp = entry.timestamp || Date.now();
    const encryptedOutput = await encryptText(entry.output);

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, target_ip, command, encrypted_output, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, timestamp, entry.targetIp, entry.command, encryptedOutput, entry.status);

    return {
      id,
      timestamp,
      target_ip: entry.targetIp,
      command: entry.command,
      encrypted_output: encryptedOutput,
      status: entry.status,
    };
  }

  public async getLogById(id: string): Promise<AuditLogEntry | null> {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, target_ip, command, encrypted_output, status
      FROM audit_logs
      WHERE id = ?
    `);

    const record = stmt.get(id) as AuditLogRecord | null;
    if (!record) return null;

    const decryptedOutput = await decryptText(record.encrypted_output);

    return {
      id: record.id,
      timestamp: record.timestamp,
      targetIp: record.target_ip,
      command: record.command,
      output: decryptedOutput,
      status: record.status,
    };
  }

  public async getAllLogs(): Promise<AuditLogEntry[]> {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, target_ip, command, encrypted_output, status
      FROM audit_logs
      ORDER BY timestamp DESC
    `);

    const records = stmt.all() as AuditLogRecord[];
    const result: AuditLogEntry[] = [];

    for (const record of records) {
      const decryptedOutput = await decryptText(record.encrypted_output);
      result.push({
        id: record.id,
        timestamp: record.timestamp,
        targetIp: record.target_ip,
        command: record.command,
        output: decryptedOutput,
        status: record.status,
      });
    }

    return result;
  }

  public close(): void {
    this.db.close();
  }
}
