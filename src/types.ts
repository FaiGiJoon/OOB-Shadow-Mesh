import { z } from 'zod';

export const WoobmConfigSchema = z.object({
  host: z.string().default('192.168.4.1'),
  port: z.number().int().min(1).max(65535).default(80),
  username: z.string().default('admin'),
  password: z.string(),
  timeoutMs: z.number().positive().default(5000),
  fetchFn: z.custom<typeof fetch>((val) => typeof val === 'function').optional(),
});

export type WoobmConfigInput = z.input<typeof WoobmConfigSchema>;
export type WoobmConfig = z.infer<typeof WoobmConfigSchema>;

export const UpdateSettingsSchema = z.object({
  newPassword: z.string().optional(),
  ssid: z.string().optional(),
  wpaKey: z.string().optional(),
});

export type UpdateSettingsParams = z.infer<typeof UpdateSettingsSchema>;
