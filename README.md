# oob-shadow-mesh

`oob-shadow-mesh` is a headless orchestration daemon and TypeScript library for managing MikroTik Woobm-USB (Out-of-Band Management) serial bridges. It allows automated provisioning, out-of-band RouterOS terminal command execution, encrypted audit logging, and Wi-Fi scanning while seamlessly co-existing with MikroTik Winbox.

---

## Features

- **Out-of-Band Terminal Commands (`WoobmClient`)**: Send CLI commands directly to RouterOS devices via the Woobm-USB HTTP interface with automatic ANSI strip-cleaning, timeout handling, and credential redaction.
- **Automated Playbook Execution (`PlaybookRunner`)**: Run structured multi-step playbooks with expected regex response matching and configurable error halting (`haltOnError`).
- **Encrypted Audit Logging (`AuditStore`)**: Securely record all executed commands and outputs into a local SQLite database, encrypted using AES-256-GCM (`crypto.subtle`).
- **Wi-Fi Scanner (`WifiScanner`)**: Automatically discover nearby `WoobmAP` access points across Linux (`nmcli`) and macOS (`airport`).
- **Winbox Co-existence & Support**: Designed to operate smoothly alongside MikroTik Winbox management sessions without conflicting with router configurations or connection state.

---

## Installation

Ensure you have [Bun](https://bun.sh) installed.

```bash
bun add oob-shadow-mesh
```

---

## Winbox Integration & Co-existence

MikroTik Winbox is the official desktop management tool for RouterOS devices. `oob-shadow-mesh` is designed to work harmoniously alongside Winbox sessions.

### How Winbox & Woobm-USB Work Together

1. **Out-of-Band Access via Woobm-USB**:
   - The Woobm-USB device plugs into the USB host port of a MikroTik router and provides an out-of-band Wi-Fi access point (default SSID: `WoobmAP-...`, default IP: `192.168.4.1`).
   - `oob-shadow-mesh` connects to the Woobm web interface (`http://192.168.4.1:80`) to issue commands directly to the router's serial console.

2. **Connecting Winbox over Woobm**:
   - **IP Connection**: Connect your management PC to the `WoobmAP` Wi-Fi network or bridged management network. In Winbox, enter the router's IP address (or `192.168.4.1` if Woobm bridging/forwarding is configured) along with your RouterOS credentials. Winbox connects over port `8291` (Winbox protocol) while `oob-shadow-mesh` operates over port `80` (Woobm HTTP/serial bridge).
   - **Concurrent Sessions**: Winbox and `oob-shadow-mesh` operate independently. Commands executed via `oob-shadow-mesh` over the Woobm serial console do not disrupt active Winbox GUI sessions.

3. **Best Practices for Winbox Co-existence**:
   - **Terminal Commands**: `WoobmClient.executeCommand()` sends commands directly to the serial terminal. Use standard RouterOS CLI commands (e.g. `/ip address print`, `/system resource print`). Avoid commands that require interactive prompts unless using explicit flags (e.g., `value-name`).
   - **Credential Security**: Keep Woobm device settings (`UpdateSettingsParams`) updated with strong WPA keys and passwords. `oob-shadow-mesh` automatically redacts sensitive secrets in error logs.
   - **Audit Logs**: All commands run via `oob-shadow-mesh` playbooks are stored in the encrypted `AuditStore`, providing an immutable audit trail complementary to Winbox's RouterOS log viewer.

---

## Usage

### 1. Executing CLI Commands

```typescript
import { WoobmClient } from 'oob-shadow-mesh';

const client = new WoobmClient({
  host: '192.168.4.1',
  username: 'admin',
  password: 'your-woobm-password',
  timeoutMs: 5000,
});

// Run a RouterOS command
const output = await client.executeCommand('/system resource print');
console.log(output);

// Update Woobm Wi-Fi / Password Settings
await client.updateSettings({
  newPassword: 'new-secure-password',
  ssid: 'WoobmSecured',
  wpaKey: 'wpa2-secret-key',
});
```

### 2. Running Automated Playbooks

```typescript
import { WoobmClient, PlaybookRunner, AuditStore } from 'oob-shadow-mesh';

process.env.OOB_ENCRYPTION_KEY = 'your-32-byte-master-encryption-key!';

const client = new WoobmClient({ password: 'your-woobm-password' });
const auditStore = new AuditStore('oob_audit.db');
const runner = new PlaybookRunner(client, auditStore);

const playbook = {
  name: 'Security Audit & Setup',
  steps: [
    {
      command: '/user print',
      expectedPattern: 'admin',
      haltOnError: true,
    },
    {
      command: '/ip service print',
      expectedPattern: 'winbox', // Verify winbox service is enabled
      haltOnError: false,
    },
  ],
};

const result = await runner.run(playbook);
console.log('Playbook Success:', result.success);
```

### 3. Querying Encrypted Audit Logs

```typescript
import { AuditStore } from 'oob-shadow-mesh';

process.env.OOB_ENCRYPTION_KEY = 'your-32-byte-master-encryption-key!';

const auditStore = new AuditStore('oob_audit.db');
const logs = await auditStore.getAllLogs();

for (const log of logs) {
  console.log(`[${new Date(log.timestamp).toISOString()}] Target: ${log.targetIp} | Cmd: ${log.command} | Status: ${log.status}`);
  console.log(`Output: ${log.output}`);
}
```

### 4. Discovering Woobm Access Points

```typescript
import { WifiScanner } from 'oob-shadow-mesh';

const networks = await WifiScanner.scan();
console.log('Discovered Woobm APs:', networks);
```

---

## Environment Variables

- `OOB_ENCRYPTION_KEY`: Master secret key used by `AuditStore` and `crypto` helpers to encrypt/decrypt audit logs with AES-256-GCM. Required when using `AuditStore`.

---

## Testing

Run tests with Bun:

```bash
bun test
```

---

## License

MIT
