import { z } from 'zod';

export const PlaybookStepSchema = z.object({
  command: z.string(),
  expectedPattern: z.string().optional(),
  haltOnError: z.boolean().default(true),
});

export type PlaybookStep = z.infer<typeof PlaybookStepSchema>;

export const PlaybookSchema = z.object({
  name: z.string(),
  steps: z.array(PlaybookStepSchema),
});

export type Playbook = z.infer<typeof PlaybookSchema>;
