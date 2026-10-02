import { z } from "zod";

export const sessionSchema = z.object({
  displayName: z.string().min(1).max(250), tenantId: z.string().min(1).max(250),
  companyId: z.string().min(1).max(250), companyName: z.string().min(1).max(250),
  authorityVersion: z.number().int().positive(), idleExpiresAt: z.string().datetime({ offset: true }),
  absoluteExpiresAt: z.string().datetime({ offset: true }), capabilities: z.array(z.string().max(100)).max(256),
}).strict();
export const workspaceSchema = z.object({ session: sessionSchema,
  navigation: z.array(z.object({ id: z.string(), label: z.string(), href: z.literal("/workspace/") }).strict()),
}).strict();
export const healthSchema = z.object({ status: z.literal("not_ready"), checks: z.array(
  z.object({ component: z.enum(["process", "database", "legacy_adapter"]),
    status: z.enum(["healthy", "not_configured", "unavailable"]) }).strict()),
}).strict();
export type Session = z.infer<typeof sessionSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Health = z.infer<typeof healthSchema>;
