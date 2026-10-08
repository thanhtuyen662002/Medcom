// Standalone boundary for root's workspace contract/UI integration.
// BranchIds are grants. They never prove whether native selection was all or assigned.
export type BranchSelection = Readonly<
  | {mode: "all"; assignedBranchId: null; filterLocked: false}
  | {mode: "assigned"; assignedBranchId: string; filterLocked: true}
>;
export type BranchSelectionState = Readonly<
  | {status: "available"; selection: BranchSelection}
  | {status: "unavailable"}
>;

const unavailable: BranchSelectionState = Object.freeze({status: "unavailable"});
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 50
  && value === value.trim() && !/[\p{Cc}]/u.test(value) && value.isWellFormed();

export function readBranchSelection(workspace: unknown): BranchSelectionState {
  if (!object(workspace) || !Array.isArray(workspace.branchIds)
      || workspace.branchIds.length === 0 || workspace.branchIds.length > 200
      || !Array.from(workspace.branchIds).every(identifier) || !object(workspace.branchSelection)) return unavailable;
  const metadata = workspace.branchSelection;
  if (metadata.mode === "all" && metadata.assignedBranchId === null && metadata.filterLocked === false)
    return Object.freeze({status: "available", selection: Object.freeze({
      mode: "all", assignedBranchId: null, filterLocked: false,
    })});
  if (metadata.mode === "assigned" && identifier(metadata.assignedBranchId) && metadata.filterLocked === true
      && workspace.branchIds.includes(metadata.assignedBranchId))
    return Object.freeze({status: "available", selection: Object.freeze({
      mode: "assigned", assignedBranchId: metadata.assignedBranchId, filterLocked: true,
    })});
  return unavailable;
}

// Semantic input for read-evidence invalidation, alongside root's existing session/read scope.
// Stable through object churn and grant ordering; it is not an authorization token.
export function branchSelectionKey(workspace: unknown): string {
  const state = readBranchSelection(workspace);
  return state.status === "unavailable" ? JSON.stringify(["unavailable"])
    : JSON.stringify([state.selection.mode, state.selection.assignedBranchId, state.selection.filterLocked]);
}
