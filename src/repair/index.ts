import type { CliDiagnostic } from '../diagnostics.ts';
import type { ParsedInvocation } from '../parse/index.ts';
import type { CliProgram } from '../command/index.ts';

export interface RepairSuggestion {
  readonly code: 'REPAIR_UNKNOWN_COMMAND' | 'REPAIR_UNKNOWN_OPTION' | 'REPAIR_MISSING_INPUT' | 'REPAIR_DEPRECATED_ALIAS' | 'REPAIR_PASS_THROUGH';
  readonly title: string;
  readonly detail: string;
  readonly replacement: readonly string[];
  readonly rank: number;
  readonly evidence: readonly RepairSuggestionEvidence[];
  readonly diagnostic: CliDiagnostic;
}

export interface RepairSuggestionEvidence {
  readonly kind: 'edit_distance' | 'diagnostic' | 'pass_through';
  readonly value: string;
  readonly candidate: string | undefined;
  readonly distance: number | undefined;
}

export interface RepairSuggestionResult {
  readonly schemaVersion: 'cli-core.repair-suggestions.v1';
  readonly hasSuggestions: boolean;
  readonly suggestions: readonly RepairSuggestion[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export function createRepairSuggestionResult(invocation: ParsedInvocation, program?: CliProgram): RepairSuggestionResult {
  const suggestions = Object.freeze(invocation.diagnostics
    .flatMap((diagnostic) => toRepairSuggestion(diagnostic, invocation, program))
    .sort(compareRepairSuggestions)
    .map((suggestion, index) => repair(
      suggestion.code,
      suggestion.title,
      suggestion.detail,
      suggestion.replacement,
      index,
      suggestion.evidence,
      suggestion.diagnostic
    )));

  return Object.freeze({
    schemaVersion: 'cli-core.repair-suggestions.v1' as const,
    hasSuggestions: suggestions.length > 0,
    suggestions,
    diagnostics: Object.freeze([...invocation.diagnostics])
  });
}

function toRepairSuggestion(
  diagnostic: CliDiagnostic,
  invocation: ParsedInvocation,
  program: CliProgram | undefined
): readonly RepairSuggestion[] {
  if (diagnostic.code === 'CLI_UNKNOWN_COMMAND') {
    const nearest = nearestCommandPath(diagnostic, program);
    return [
      repair(
        'REPAIR_UNKNOWN_COMMAND',
        'Unknown command',
        'Use a declared command path or ask for completion candidates.',
        nearest.replacement,
        0,
        nearest.evidence,
        diagnostic
      )
    ];
  }
  if (diagnostic.code === 'CLI_UNKNOWN_OPTION') {
    const nearest = nearestOptionFlag(diagnostic, invocation);
    return [
      repair(
        'REPAIR_UNKNOWN_OPTION',
        'Unknown option',
        'Remove the option or use a declared flag for the matched command.',
        nearest.replacement,
        0,
        nearest.evidence,
        diagnostic
      )
    ];
  }
  if (diagnostic.code === 'CLI_MISSING_POSITIONAL') {
    return [repair('REPAIR_MISSING_INPUT', 'Missing input', 'Provide the required positional input.', [], 0, diagnosticEvidence(diagnostic), diagnostic)];
  }
  if (diagnostic.code === 'CLI_DEPRECATED_ALIAS') {
    const commandPath = diagnostic.fields.commandPath;
    const replacement = Array.isArray(commandPath) ? commandPath.filter((item): item is string => typeof item === 'string') : [];
    return [repair('REPAIR_DEPRECATED_ALIAS', 'Deprecated alias', 'Use the canonical command path.', replacement, 0, diagnosticEvidence(diagnostic), diagnostic)];
  }
  if (diagnostic.code === 'CLI_PASS_THROUGH_UNDECLARED') {
    return [
      repair(
        'REPAIR_PASS_THROUGH',
        'Pass-through preserved',
        'Tokens after -- were preserved and can be forwarded explicitly.',
        ['--'],
        0,
        [evidence('pass_through', '--', '--', 0)],
        diagnostic
      )
    ];
  }
  return [];
}

function nearestCommandPath(
  diagnostic: CliDiagnostic,
  program: CliProgram | undefined
): { readonly replacement: readonly string[]; readonly evidence: readonly RepairSuggestionEvidence[] } {
  if (program === undefined) return { replacement: Object.freeze([]), evidence: diagnosticEvidence(diagnostic) };
  const unknownPath = diagnostic.fields.commandPath;
  if (!Array.isArray(unknownPath)) return { replacement: Object.freeze([]), evidence: diagnosticEvidence(diagnostic) };
  const unknown = unknownPath.filter((item): item is string => typeof item === 'string').join(' ');
  const candidates = program.commands
    .filter((command) => command.path.length > 0)
    .map((command) => command.path);
  const nearest = nearestPath(unknown, candidates);
  return {
    replacement: nearest.replacement,
    evidence: nearest.evidence.length === 0 ? diagnosticEvidence(diagnostic) : nearest.evidence
  };
}

function nearestOptionFlag(
  diagnostic: CliDiagnostic,
  invocation: ParsedInvocation
): { readonly replacement: readonly string[]; readonly evidence: readonly RepairSuggestionEvidence[] } {
  const option = diagnostic.fields.option;
  if (typeof option !== 'string' || invocation.command === undefined) {
    return { replacement: Object.freeze([]), evidence: diagnosticEvidence(diagnostic) };
  }
  const flags = [...invocation.command.inheritedOptions, ...invocation.command.options]
    .filter((candidate) => !candidate.hidden)
    .flatMap((candidate) => candidate.flags);
  const nearest = nearestValue(option, flags);
  return nearest === undefined
    ? { replacement: Object.freeze([]), evidence: diagnosticEvidence(diagnostic) }
    : {
        replacement: Object.freeze([nearest.value]),
        evidence: Object.freeze([evidence('edit_distance', option, nearest.value, nearest.distance)])
      };
}

function nearestPath(
  value: string,
  candidates: readonly (readonly string[])[]
): { readonly replacement: readonly string[]; readonly evidence: readonly RepairSuggestionEvidence[] } {
  const nearest = nearestValue(value, candidates.map((candidate) => candidate.join(' ')));
  return nearest === undefined
    ? { replacement: Object.freeze([]), evidence: Object.freeze([]) }
    : {
        replacement: Object.freeze(nearest.value.split(' ')),
        evidence: Object.freeze([evidence('edit_distance', value, nearest.value, nearest.distance)])
      };
}

function nearestValue(value: string, candidates: readonly string[]): { readonly value: string; readonly distance: number } | undefined {
  let best: { readonly value: string; readonly distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(value, candidate);
    if (best === undefined || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }
  if (best === undefined) return undefined;
  return best.distance <= Math.max(2, Math.ceil(value.length / 2)) ? best : undefined;
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const next = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left.at(leftIndex) === right.at(rightIndex) ? 0 : 1;
      const insertion = (next.at(rightIndex) ?? 0) + 1;
      const deletion = (previous.at(rightIndex + 1) ?? 0) + 1;
      const substitution = (previous.at(rightIndex) ?? 0) + cost;
      next.push(Math.min(
        insertion,
        deletion,
        substitution
      ));
    }
    previous = next;
  }
  return previous[right.length] ?? 0;
}

function repair(
  code: RepairSuggestion['code'],
  title: string,
  detail: string,
  replacement: readonly string[],
  rank: number,
  repairEvidence: readonly RepairSuggestionEvidence[],
  diagnostic: CliDiagnostic
): RepairSuggestion {
  return Object.freeze({
    code,
    title,
    detail,
    replacement: Object.freeze([...replacement]),
    rank,
    evidence: Object.freeze([...repairEvidence]),
    diagnostic
  });
}

function evidence(
  kind: RepairSuggestionEvidence['kind'],
  value: string,
  candidate: string | undefined,
  distance: number | undefined
): RepairSuggestionEvidence {
  return Object.freeze({ kind, value, candidate, distance });
}

function diagnosticEvidence(diagnostic: CliDiagnostic): readonly RepairSuggestionEvidence[] {
  return Object.freeze([evidence('diagnostic', diagnostic.code, undefined, undefined)]);
}

function compareRepairSuggestions(left: RepairSuggestion, right: RepairSuggestion): number {
  const leftDistance = firstDistance(left);
  const rightDistance = firstDistance(right);
  return leftDistance - rightDistance || left.code.localeCompare(right.code) || left.replacement.join(' ').localeCompare(right.replacement.join(' '));
}

function firstDistance(suggestion: RepairSuggestion): number {
  return suggestion.evidence.find((item) => item.distance !== undefined)?.distance ?? Number.MAX_SAFE_INTEGER;
}
