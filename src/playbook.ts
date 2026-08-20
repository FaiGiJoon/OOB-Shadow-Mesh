import { WoobmClient } from './client';
import { AuditStore } from './storage';
import { PlaybookSchema, type Playbook } from './playbook-types';

export interface StepExecutionResult {
  command: string;
  output: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface PlaybookExecutionResult {
  playbookName: string;
  success: boolean;
  stepResults: StepExecutionResult[];
}

export class PlaybookRunner {
  private client: WoobmClient;
  private auditStore?: AuditStore;

  constructor(client: WoobmClient, auditStore?: AuditStore) {
    this.client = client;
    this.auditStore = auditStore;
  }

  public async run(playbookInput: unknown): Promise<PlaybookExecutionResult> {
    const playbook: Playbook = PlaybookSchema.parse(playbookInput);
    const stepResults: StepExecutionResult[] = [];
    let playbookSuccess = true;

    for (const step of playbook.steps) {
      let output = '';
      let stepSuccess = true;
      let errorMessage: string | undefined;

      try {
        output = await this.client.executeCommand(step.command);

        if (step.expectedPattern) {
          const regex = new RegExp(step.expectedPattern);
          if (!regex.test(output)) {
            stepSuccess = false;
            errorMessage = `Output did not match expected pattern: ${step.expectedPattern}`;
          }
        }
      } catch (err: unknown) {
        stepSuccess = false;
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      const status = stepSuccess ? 'success' : 'failed';
      stepResults.push({
        command: step.command,
        output,
        status,
        error: errorMessage,
      });

      if (this.auditStore) {
        await this.auditStore.saveLog({
          targetIp: this.client.config.host,
          command: step.command,
          output: errorMessage ? `${output}\nError: ${errorMessage}` : output,
          status,
        });
      }

      if (!stepSuccess) {
        playbookSuccess = false;
        if (step.haltOnError) {
          break;
        }
      }
    }

    return {
      playbookName: playbook.name,
      success: playbookSuccess,
      stepResults,
    };
  }
}
