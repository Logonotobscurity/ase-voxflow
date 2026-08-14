import type { VoiceIntent } from './schemas';

export type ClassifiedVoiceIntent = {
  intent: VoiceIntent;
  confidence: number;
  entities: Record<string, unknown>;
};

type IntentRule = {
  intent: Exclude<VoiceIntent, 'unknown'>;
  patterns: RegExp[];
};

const rules: IntentRule[] = [
  { intent: 'pause_workflow', patterns: [/\bpause\b.*\b(workflow|flow|execution)\b/i, /\bstop\b.*\bworkflow\b/i] },
  { intent: 'run_workflow', patterns: [/\brun\b.*\b(workflow|flow)\b/i, /\bstart\b.*\bworkflow\b/i] },
  { intent: 'execute', patterns: [/\bexecute\b/i, /\btest\b.*\bflow\b/i] },
  { intent: 'delete_node', patterns: [/\b(delete|remove)\b.*\b(node|step)\b/i] },
  { intent: 'connect', patterns: [/\bconnect\b/i, /\blink\b.*\b(nodes|steps)\b/i] },
  { intent: 'select_node', patterns: [/\b(select|focus|open)\b.*\b(node|step)\b/i] },
  { intent: 'update_node', patterns: [/\b(update|rename|change|configure)\b.*\b(node|step)\b/i] },
  { intent: 'add_node', patterns: [/\b(add|create|insert)\b.*\b(node|step|condition|approval|agent|tool)\b/i] },
  { intent: 'handoff', patterns: [/\b(hand\s?off|delegate|transfer)\b/i] },
];

export function classifyVoiceIntent(transcript: string): ClassifiedVoiceIntent {
  const normalized = transcript.trim();
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        intent: rule.intent,
        confidence: 0.92,
        entities: extractEntities(normalized),
      };
    }
  }
  return { intent: 'unknown', confidence: 0.2, entities: {} };
}

function extractEntities(transcript: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};
  const nodeType = transcript.match(/\b(condition|approval|agent|tool|webhook|transaction|schedule|voice)\b/i)?.[1];
  if (nodeType) entities.nodeType = nodeType.toLowerCase();
  const after = transcript.match(/\bafter\s+([\w\s-]{2,80})/i)?.[1]?.trim();
  if (after) entities.after = after;
  return entities;
}
