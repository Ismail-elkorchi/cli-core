import type { CliDiagnostic } from '../diagnostics.js';
import type { ParsedInvocation } from '../parse/index.js';
import type { CliProgram } from '../command/index.js';

export interface RepairSuggestion {
  readonly code: 'REPAIR_UNKNOWN_COMMAND' | 'REPAIR_UNKNOWN_OPTION' | 'REPAIR_MISSING_INPUT' | 'REPAIR_DEPRECATED_ALIAS' | 'REPAIR_PASS_THROUGH';
  readonly title: string;
  readonly detail: string;
  readonly replacement: readonly string[];
  readonly diagnostic: CliDiagnostic;
}

export function suggestRepairs(invocation: ParsedInvocation, program?: CliProgram): readonly RepairSuggestion[] {
  return Object.freeze(invocation.diagnostics.flatMap((diagnostic) => toRepairSuggestion(diagnostic, invocation, program)));
}

function toRepairSuggestion(
  diagnostic: CliDiagnostic,
  invocation: ParsedInvocation,
  program: CliProgram | undefined
): readonly RepairSuggestion[] {
  if (diagnostic.code === 'CLI_UNKNOWN_COMMAND') {
    return [
      repair(
        'REPAIR_UNKNOWN_COMMAND',
        'Unknown command',
        'Use a declared command path or ask for completion candidates.',
        nearestCommandPath(diagnostic, program),
        diagnostic
      )
    ];
  }
  if (diagnostic.code === 'CLI_UNKNOWN_OPTION') {
    return [
      repair(
        'REPAIR_UNKNOWN_OPTION',
        'Unknown option',
        'Remove the option or use a declared flag for the matched command.',
        nearestOptionFlag(diagnostic, invocation),
        diagnostic
      )
    ];
  }
  if (diagnostic.code === 'CLI_MISSING_POSITIONAL') {
    return [repair('REPAIR_MISSING_INPUT', 'Missing input', 'Provide the required positional input.', [], diagnostic)];
  }
  if (diagnostic.code === 'CLI_DEPRECATED_ALIAS') {
    const commandPath = diagnostic.fields.commandPath;
    const replacement = Array.isArray(commandPath) ? commandPath.filter((item): item is string => typeof item === 'string') : [];
    return [repair('REPAIR_DEPRECATED_ALIAS', 'Deprecated alias', 'Use the canonical command path.', replacement, diagnostic)];
  }
  if (diagnostic.code === 'CLI_PASS_THROUGH_UNDECLARED') {
    return [repair('REPAIR_PASS_THROUGH', 'Pass-through preserved', 'Tokens after -- were preserved and can be forwarded explicitly.', ['--'], diagnostic)];
  }
  return [];
}

function nearestCommandPath(diagnostic: CliDiagnostic, program: CliProgram | undefined): readonly string[] {
  if (program === undefined) return [];
  const unknownPath = diagnostic.fields.commandPath;
  if (!Array.isArray(unknownPath)) return [];
  const unknown = unknownPath.filter((item): item is string => typeof item === 'string').join(' ');
  const candidates = program.commands
    .filter((command) => command.path.length > 0)
    .map((command) => command.path);
  return nearestPath(unknown, candidates);
}

function nearestOptionFlag(diagnostic: CliDiagnostic, invocation: ParsedInvocation): readonly string[] {
  const option = diagnostic.fields.option;
  if (typeof option !== 'string' || invocation.command === undefined) return [];
  const flags = [...invocation.command.inheritedOptions, ...invocation.command.options]
    .filter((candidate) => !candidate.hidden)
    .flatMap((candidate) => candidate.flags);
  const nearest = nearestValue(option, flags);
  return nearest === undefined ? [] : [nearest];
}

function nearestPath(value: string, candidates: readonly (readonly string[])[]): readonly string[] {
  const nearest = nearestValue(value, candidates.map((candidate) => candidate.join(' ')));
  return nearest === undefined ? [] : Object.freeze(nearest.split(' '));
}

function nearestValue(value: string, candidates: readonly string[]): string | undefined {
  let best: { readonly value: string; readonly distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(value, candidate);
    if (best === undefined || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }
  if (best === undefined) return undefined;
  return best.distance <= Math.max(2, Math.ceil(value.length / 2)) ? best.value : undefined;
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
  diagnostic: CliDiagnostic
): RepairSuggestion {
  return Object.freeze({
    code,
    title,
    detail,
    replacement: Object.freeze([...replacement]),
    diagnostic
  });
}
