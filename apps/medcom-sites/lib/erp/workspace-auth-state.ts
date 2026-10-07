import {isScreen, screens, type ScreenId} from "./catalog";

/** Root supplies current, fenced evidence. No HTTP status inference or clocks. */
export type WorkspaceAuthInputs = {
  lifecycleKey: string;
  session: "unresolved" | "live" | "anonymous" | "expired";
  /** Proof was admitted for THIS lifecycle, not merely a successful login POST. */
  hasAuthenticatedProof: boolean;
  authority: "verifying" | "verified" | "unavailable";
  /** Must equal lifecycleKey, and be cleared when root invalidates read evidence. */
  proofLifecycleKey: string | null;
  signOutPending: boolean;
};
export type WorkspaceAuthPhase = "verifying" | "authenticated" | "recovery" | "anonymous" | "expired";
export type WorkspaceAuthState = {
  lifecycleKey: string;
  phase: WorkspaceAuthPhase;
  presentationAllowed: boolean;
  /** Retains live React children, never a cached copy of children or their data. */
  mountProtected: boolean;
};
export function deriveWorkspaceAuthState(input: WorkspaceAuthInputs): WorkspaceAuthState {
  const phase: WorkspaceAuthPhase = input.signOutPending ? "verifying"
    : input.session === "anonymous" || input.session === "expired" ? input.session
    : input.session === "live" && input.hasAuthenticatedProof && input.authority === "verified"
      && input.proofLifecycleKey === input.lifecycleKey ? "authenticated"
    : input.authority === "unavailable" ? "recovery" : "verifying";
  return {lifecycleKey: input.lifecycleKey, phase, presentationAllowed: phase === "authenticated",
    mountProtected: input.hasAuthenticatedProof};
}
/** A value suitable for in-memory root state, never a URL or storage contract. */
export function parseWorkspaceReturnTarget(value: unknown): ScreenId | null {
  return typeof value === "string" && isScreen(value) ? value : null;
}
/** Call with CURRENT authorizedScreenIds only; no guessed permission fallback. */
export function resolveWorkspaceReturnTarget(requested: unknown, authorized: readonly ScreenId[], state: WorkspaceAuthState): ScreenId | null {
  if (!state.presentationAllowed) return null;
  const allowed = screens.filter(s => !("sourceDisabled" in s && s.sourceDisabled) && authorized.includes(s.id)).map(s => s.id);
  const target = parseWorkspaceReturnTarget(requested);
  return target && allowed.includes(target) ? target : allowed.includes("home") ? "home" : allowed[0] ?? null;
}
