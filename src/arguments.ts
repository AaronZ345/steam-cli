import { z } from "zod";
import { assert, CliError, number } from "./core.js";

export interface ArgumentSpec {
  name: string;
  description: string;
  type?: "string" | "integer" | "boolean" | "json";
  required?: boolean;
  choices?: string[];
  min?: number;
  max?: number;
}
export const arg = (
  name: string,
  description: string,
  type: ArgumentSpec["type"] = "string",
  extra: Partial<ArgumentSpec> = {},
): ArgumentSpec => ({ name, description, type, ...extra });
export function argumentSchema(specs: ArgumentSpec[]): z.ZodRawShape {
  return Object.fromEntries(
    specs.map((s) => {
      let schema: z.ZodType =
        s.type === "integer"
          ? z
              .number()
              .int()
              .min(s.min ?? 0)
              .max(s.max ?? Number.MAX_SAFE_INTEGER)
          : s.type === "boolean"
            ? z.boolean()
            : s.type === "json"
              ? z.unknown()
              : s.choices
                ? z.enum(s.choices as [string, ...string[]])
                : z.string();
      schema = schema.describe(s.description);
      return [s.name, s.required ? schema : schema.optional()];
    }),
  );
}
export function parseArguments(
  input: Record<string, any>,
  specs: ArgumentSpec[] = [],
): Record<string, any> {
  const p = { ...input };
  for (const s of specs) {
    if (p[s.name] === undefined) {
      assert(!s.required, "INVALID_ARGUMENT", `缺少参数 ${s.name}`);
      continue;
    }
    if (s.type === "integer")
      p[s.name] = number(
        p[s.name],
        s.name,
        s.min ?? 0,
        s.max ?? Number.MAX_SAFE_INTEGER,
      );
    if (s.type === "boolean") {
      if (typeof p[s.name] === "string") {
        assert(
          ["true", "false", "yes", "no"].includes(p[s.name]),
          "INVALID_ARGUMENT",
          `${s.name} 必须为布尔值`,
        );
        p[s.name] = ["true", "yes"].includes(p[s.name]);
      }
      assert(
        typeof p[s.name] === "boolean",
        "INVALID_ARGUMENT",
        `${s.name} 必须为布尔值`,
      );
    }
    if (s.type === "json" && typeof p[s.name] === "string") {
      try {
        p[s.name] = JSON.parse(p[s.name]);
      } catch {
        throw new CliError("INVALID_ARGUMENT", `${s.name} 必须为 JSON`);
      }
    }
    if (!s.type || s.type === "string")
      assert(
        typeof p[s.name] === "string",
        "INVALID_ARGUMENT",
        `${s.name} 必须为字符串`,
      );
    if (s.choices)
      assert(
        s.choices.includes(p[s.name]),
        "INVALID_ARGUMENT",
        `${s.name} 支持 ${s.choices.join("|")}`,
      );
  }
  return p;
}
