import { useCallback, useMemo, useState } from "react";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  field: string;
  message: string;
  severity?: ValidationSeverity;
}

export type FieldValidator<TValues> = (value: unknown, values: TValues) => string | ValidationIssue | undefined | Promise<string | ValidationIssue | undefined>;
export type CrossFieldValidator<TValues> = (values: TValues) => ValidationIssue[] | undefined | Promise<ValidationIssue[] | undefined>;

export interface ValidationRules<TValues> {
  fields?: Record<string, FieldValidator<TValues>[]>;
  crossField?: CrossFieldValidator<TValues>[];
}

export interface FormValidationState {
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  pending: boolean;
  isValid: boolean;
}

export interface UseFormValidationResult<TValues> extends FormValidationState {
  validateField: (field: string, values: TValues) => Promise<ValidationIssue[]>;
  validateForm: (values: TValues) => Promise<ValidationIssue[]>;
  validateSection: (fields: string[], values: TValues) => Promise<ValidationIssue[]>;
  clearField: (field: string) => void;
}

function normalizeIssue(field: string, issue: string | ValidationIssue | undefined): ValidationIssue | undefined {
  if (!issue) return undefined;
  if (typeof issue === "string") return { field, message: issue, severity: "error" };
  return { severity: "error", ...issue };
}

function getFieldValue<TValues>(values: TValues, field: string): unknown {
  return field.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, values);
}

function toState(issues: ValidationIssue[], pending = false): FormValidationState {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  for (const issue of issues) {
    const target = issue.severity === "warning" ? warnings : errors;
    target[issue.field] = [...(target[issue.field] ?? []), issue.message];
  }
  return { errors, warnings, pending, isValid: Object.keys(errors).length === 0 && !pending };
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity !== "warning");
}

export async function validateFields<TValues>(values: TValues, rules: ValidationRules<TValues>, fields?: string[]): Promise<ValidationIssue[]> {
  const fieldNames = fields ?? Object.keys(rules.fields ?? {});
  const issues: ValidationIssue[] = [];
  for (const field of fieldNames) {
    const validators = rules.fields?.[field] ?? [];
    for (const validator of validators) {
      const issue = normalizeIssue(field, await validator(getFieldValue(values, field), values));
      if (issue) issues.push(issue);
    }
  }
  for (const validator of rules.crossField ?? []) {
    const nextIssues = await validator(values);
    if (nextIssues?.length) {
      issues.push(...nextIssues.map((issue) => ({ severity: "error" as const, ...issue })));
    }
  }
  return issues;
}

export function moneyFieldValidator(options: { allowZero?: boolean; allowNegative?: boolean; label?: string } = {}): FieldValidator<Record<string, unknown>> {
  return (value) => {
    const label = options.label ?? "Amount";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return `${label} must be a valid number.`;
    if (!options.allowNegative && amount < 0) return `${label} cannot be negative.`;
    if (!options.allowZero && amount === 0) return `${label} must be greater than zero.`;
    return undefined;
  };
}

export function useFormValidation<TValues>(rules: ValidationRules<TValues>): UseFormValidationResult<TValues> {
  const [state, setState] = useState<FormValidationState>(() => toState([]));

  const validateField = useCallback(async (field: string, values: TValues) => {
    setState((current) => ({ ...current, pending: true, isValid: false }));
    const issues = await validateFields(values, rules, [field]);
    setState((current) => {
      const retained = [
        ...Object.entries(current.errors).filter(([key]) => key !== field).flatMap(([key, messages]) => messages.map((message) => ({ field: key, message, severity: "error" as const }))),
        ...Object.entries(current.warnings).filter(([key]) => key !== field).flatMap(([key, messages]) => messages.map((message) => ({ field: key, message, severity: "warning" as const }))),
        ...issues,
      ];
      return toState(retained);
    });
    return issues;
  }, [rules]);

  const validateForm = useCallback(async (values: TValues) => {
    setState((current) => ({ ...current, pending: true, isValid: false }));
    const issues = await validateFields(values, rules);
    setState(toState(issues));
    return issues;
  }, [rules]);

  const validateSection = useCallback(async (fields: string[], values: TValues) => {
    setState((current) => ({ ...current, pending: true, isValid: false }));
    const issues = await validateFields(values, rules, fields);
    setState(toState(issues));
    return issues;
  }, [rules]);

  const clearField = useCallback((field: string) => {
    setState((current) => {
      const errors = { ...current.errors };
      const warnings = { ...current.warnings };
      delete errors[field];
      delete warnings[field];
      return { errors, warnings, pending: false, isValid: Object.keys(errors).length === 0 };
    });
  }, []);

  return useMemo(() => ({ ...state, validateField, validateForm, validateSection, clearField }), [clearField, state, validateField, validateForm, validateSection]);
}
