import { BusinessRule, BusinessRuleResult } from './types';

const DEFAULT_RULES: BusinessRule[] = [
  { ruleId: 'R001', field: 'submissionType', operator: 'required', value: '' },
  { ruleId: 'R002', field: 'description', operator: 'required', value: '' },
  { ruleId: 'R003', field: 'description', operator: 'minLength', value: 10 },
];

function applyRule(
  rule: BusinessRule,
  fields: Record<string, string>
): { outcome: 'pass' | 'fail'; details: string } {
  const fieldValue = fields[rule.field] ?? '';

  switch (rule.operator) {
    case 'required':
      return fieldValue.length > 0
        ? { outcome: 'pass', details: `Field '${rule.field}' is present` }
        : { outcome: 'fail', details: `Field '${rule.field}' is required` };

    case 'minLength':
      return fieldValue.length >= Number(rule.value)
        ? { outcome: 'pass', details: `Field '${rule.field}' meets minimum length ${rule.value}` }
        : { outcome: 'fail', details: `Field '${rule.field}' must be at least ${rule.value} characters` };

    case 'maxLength':
      return fieldValue.length <= Number(rule.value)
        ? { outcome: 'pass', details: `Field '${rule.field}' within maximum length ${rule.value}` }
        : { outcome: 'fail', details: `Field '${rule.field}' exceeds maximum length ${rule.value}` };

    case 'pattern': {
      try {
        const regex = new RegExp(String(rule.value));
        return regex.test(fieldValue)
          ? { outcome: 'pass', details: `Field '${rule.field}' matches pattern` }
          : { outcome: 'fail', details: `Field '${rule.field}' does not match required pattern` };
      } catch {
        return { outcome: 'fail', details: `Field '${rule.field}' has invalid pattern: ${rule.value}` };
      }
    }

    default:
      return { outcome: 'fail', details: `Unknown operator '${rule.operator}'` };
  }
}

export function evaluateSubmission(
  submissionId: string,
  fields: Record<string, string>,
  rules?: BusinessRule[]
): BusinessRuleResult[] {
  const activeRules = rules ?? DEFAULT_RULES;
  const startTime = Date.now();

  return activeRules.map((rule) => {
    const ruleStart = Date.now();
    const { outcome, details } = applyRule(rule, fields);
    const processingDurationMs = Date.now() - ruleStart;

    return {
      submissionId,
      ruleId: rule.ruleId,
      outcome,
      details,
      processingDurationMs,
    };
  });
}
