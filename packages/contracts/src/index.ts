import { createHash } from "node:crypto";

/**
 * Contract rendering: a deliberately small, dependency-free template engine with
 * {{variable}} substitution and {{#if variable}}…{{/if}} blocks. Rendered documents are
 * immutable; their SHA-256 checksum is stored alongside the signature evidence.
 */
export type ContractVariables = Record<string, string | number | boolean | null | undefined>;

export interface RenderedContract {
  markdown: string;
  checksumSha256: string;
  variablesUsed: string[];
  missingVariables: string[];
}

const IF_BLOCK = /\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
const VARIABLE = /\{\{\s*(\w+)\s*\}\}/g;

export function extractVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(VARIABLE)) names.add(match[1]!);
  for (const match of template.matchAll(IF_BLOCK)) names.add(match[1]!);
  return [...names].sort();
}

export function renderContract(template: string, variables: ContractVariables): RenderedContract {
  const missing = new Set<string>();
  const used = new Set<string>();
  const withBlocks = template.replace(IF_BLOCK, (_, name: string, body: string) => {
    used.add(name);
    const value = variables[name];
    return value ? body : "";
  });
  const markdown = withBlocks.replace(VARIABLE, (_, name: string) => {
    used.add(name);
    const value = variables[name];
    if (value === undefined || value === null) {
      missing.add(name);
      return "";
    }
    return String(value);
  });
  return {
    markdown,
    checksumSha256: checksum(markdown),
    variablesUsed: [...used].sort(),
    missingVariables: [...missing].sort(),
  };
}

export function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function verifyChecksum(content: string, expected: string): boolean {
  return checksum(content) === expected;
}
