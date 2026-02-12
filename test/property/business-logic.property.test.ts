import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { evaluateSubmission } from '../../lambda/business-logic/rules';
import { BusinessRule } from '../../lambda/business-logic/types';

// Arbitrary: non-empty submission ID
const submissionIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

// Arbitrary: random form fields (1-5 fields with string values)
const fieldsArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z]\w*$/.test(s)),
  fc.string({ minLength: 0, maxLength: 100 }),
  { minKeys: 1, maxKeys: 5 }
);

// Arbitrary: valid business rule operator
const operatorArb = fc.constantFrom('required', 'minLength', 'maxLength', 'pattern') as fc.Arbitrary<BusinessRule['operator']>;

// Arbitrary: a valid business rule
const ruleArb = fc.record({
  ruleId: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
  field: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z]\w*$/.test(s)),
  operator: operatorArb,
  value: fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.integer({ min: 1, max: 100 })),
});

// Arbitrary: array of 1-5 rules
const rulesArb = fc.array(ruleArb, { minLength: 1, maxLength: 5 });

const VALID_OUTCOMES = ['pass', 'fail', 'review'] as const;

// Feature: agentcore-bedrock-platform, Property 6: Business rules produce well-formed results
// **Validates: Requirements 5.1**
describe('Property 6: Business rules produce well-formed results', () => {
  test.prop([submissionIdArb, fieldsArb, rulesArb], { numRuns: 100 })(
    'evaluateSubmission returns well-formed BusinessRuleResult for any valid inputs',
    (submissionId, fields, rules) => {
      const results = evaluateSubmission(submissionId, fields, rules);

      // One result per rule
      expect(results).toHaveLength(rules.length);

      for (const result of results) {
        // submissionId matches input
        expect(result.submissionId).toBe(submissionId);

        // ruleId is a non-empty string
        expect(typeof result.ruleId).toBe('string');
        expect(result.ruleId.length).toBeGreaterThan(0);

        // outcome is one of the valid values
        expect(VALID_OUTCOMES).toContain(result.outcome);

        // details is a non-empty string
        expect(typeof result.details).toBe('string');
        expect(result.details.length).toBeGreaterThan(0);

        // processingDurationMs is non-negative
        expect(result.processingDurationMs).toBeGreaterThanOrEqual(0);
      }
    }
  );
});
