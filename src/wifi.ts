export interface WifiNetwork {
  ssid: string;
  signalStrength?: number;
  security?: string;
}

export class WifiScanner {
  public static async scan(): Promise<WifiNetwork[]> {
    const platform = process.platform;

    if (platform === 'linux') {
      return await WifiScanner.scanLinux();
    } else if (platform === 'darwin') {
      return await WifiScanner.scanMac();
    } else {
      throw new Error(`Unsupported platform for Wi-Fi scanning: ${platform}`);
    }
  }

  public static parseNmcliOutput(output: string): WifiNetwork[] {
    const lines = output.split('\n');
    const networks: WifiNetwork[] = [];
    const ssidMap = new Set<string>();

    for (const line of lines) {
      if (!line.trim()) continue;
      // nmcli -t -f SSID,SIGNAL,SECURITY dev wifi
      // Escaped colons in SSID/fields might appear as \:
      // Simple splitting by unescaped colon or standard colon split if formatted properly
      const parts = line.split(':');
      if (parts.length >= 1) {
        const ssid = parts[0].trim();
        if (ssid && ssid.includes('WoobmAP') && !ssidMap.has(ssid)) {
          ssidMap.add(ssid);
          const signalStr = parts[1] ? parts[1].trim() : undefined;
          const signal = signalStr ? parseInt(signalStr, 10) : undefined;
          const security = parts[2] ? parts[2].trim() : undefined;
          networks.push({ ssid, signalStrength: isNaN(signal as number) ? undefined : signal, security });
        }
      }
    }

    return networks;
  }

  public static parseAirportOutput(output: string): WifiNetwork[] {
    const lines = output.split('\n');
    const networks: WifiNetwork[] = [];
    const ssidMap = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // airport format:
      //               SSID BSSID RSSI CHANNEL HT CC SECURITY (SSID is first, variable whitespace)
      // Extract SSID: usually first column before BSSID MAC address pattern (xx:xx:xx:xx:xx:xx)
      const bssidMatch = line.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/);
      if (bssidMatch && bssidMatch.index !== undefined) {
        const ssid = line.substring(0, bssidMatch.index).trim();
        if (ssid && ssid.includes('WoobmAP') && !ssidMap.has(ssid)) {
          ssidMap.add(ssid);
          const rest = line.substring(bssidMatch.index + bssidMatch[0].length).trim();
          const tokens = rest.split(/\s+/);
          const rssi = tokens[0] ? parseInt(tokens[0], 10) : undefined;
          networks.push({
            ssid,
            signalStrength: isNaN(rssi as number) ? undefined : rssi,
            security: tokens.slice(3).join(' ') || undefined,
          });
        }
      }
    }

    return networks;
  }

  private static async scanLinux(): Promise<WifiNetwork[]> {
    try {
      const proc = Bun.spawn(['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'rescan']);
      await proc.exited;

      const scanProc = Bun.spawn(['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi']);
      const output = await new Response(scanProc.stdout).text();
      return WifiScanner.parseNmcliOutput(output);
    } catch (err: unknown) {
      throw new Error(`Failed to execute nmcli: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private static async scanMac(): Promise<WifiNetwork[]> {
    try {
      const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
      const scanProc = Bun.spawn([airportPath, '-s']);
      const output = await new Response(scanProc.stdout).text();
      return WifiScanner.parseAirportOutput(output);
    } catch (err: unknown) {
      throw new Error(`Failed to execute airport command: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
