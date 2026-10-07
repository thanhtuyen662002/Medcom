"use client";

import {useLayoutEffect, useMemo, useRef} from "react";

type SelectionFocusOptions = {
  /** A committed authority identity. Null never permits focus. */
  owner: unknown | null;
  selected: string | null;
  /** Filter/branch/page identity, excluding selection and refresh counters. */
  listKey: string;
  openReady: boolean;
  openFailed: boolean;
  listReady: boolean;
  listFailed: boolean;
};
type Origin = {owner: unknown; listKey: string; documentId: string; scroll?: {element: Element; top: number; left: number}[]};
type Ticket = Origin & {
  kind: "open" | "close";
  selectionAtArm: string | null;
  selectionCommitted: boolean;
  restoreRow: boolean;
  dialog: HTMLElement | null;
  dialogDeadline: number;
};

/** Presentation only. Hosts supply committed read proof and call open/close
 * exclusively from accepted user actions. This hook never grants authority,
 * selects a document, fetches data, or changes an editor's lifetime. */
export function useRequestSelectionFocus(options: SelectionFocusOptions) {
  const live = useRef(options), mounted = useRef(false);
  const pending = useRef<Ticket | null>(null), origin = useRef<Origin | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const detailTarget = useRef<HTMLElement | null>(null), listTarget = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  const actions = useMemo(() => {
    function cancel() {
      pending.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    function valid(ticket: Ticket) {
      const current = live.current;
      const expected = ticket.kind === "open" ? ticket.documentId : null;
      const matching = current.selected === expected;
      if (matching) ticket.selectionCommitted = true;
      return mounted.current && !document.hidden && current.owner !== null
        && Object.is(current.owner, ticket.owner) && current.listKey === ticket.listKey
        && (matching || !ticket.selectionCommitted && current.selected === ticket.selectionAtArm)
        && (!matching || !(ticket.kind === "open" ? current.openFailed : current.listFailed));
    }
    function visible(element: HTMLElement | null): element is HTMLElement {
      return !!element?.isConnected && !element.closest('[hidden],[inert],[aria-hidden="true"]')
        && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    }
    function schedule() {
      if (!mounted.current || !pending.current || frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const ticket = pending.current;
        if (!ticket) return;
        if (!valid(ticket)) { cancel(); return; }
        const current = live.current;
        // open/close may be called immediately before the host state update.
        // Wait for that selection's commit rather than treating old props as a denial.
        if (!ticket.selectionCommitted) return;
        if (!(ticket.kind === "open" ? current.openReady : current.listReady)) return;
        // The guard may restore focus while its closing animation unmounts.
        // Observe only that captured dialog; DOM is never read-authority proof.
        if (ticket.dialog) {
          if (ticket.dialog.isConnected) {
            if (performance.now() >= ticket.dialogDeadline) { cancel(); return; }
            schedule(); return;
          }
          ticket.dialog = null;
          schedule(); return; // Let the guard's final focus restoration finish.
        }
        const row = rows.current.get(ticket.documentId) ?? null;
        const target = ticket.kind === "open" ? detailTarget.current
          : ticket.restoreRow && visible(row) ? row : listTarget.current;
        if (!visible(target) || target.matches('input,textarea,select,[contenteditable="true"]')) {
          cancel(); return;
        }
        // Consume before dispatching focus events. Later commits cannot repeat it.
        pending.current = null;
        target.focus({preventScroll: true});
        if (ticket.kind === "close") for (const position of ticket.scroll ?? []) {
          if (position.element.isConnected) { position.element.scrollTop = position.top; position.element.scrollLeft = position.left; }
        }
      });
    }
    function arm(kind: Ticket["kind"], source: Origin, restoreRow = true) {
      cancel();
      if (!mounted.current || document.hidden || live.current.owner === null) return;
      pending.current = {...source, kind, restoreRow,
        selectionAtArm: live.current.selected,
        selectionCommitted: live.current.selected === (kind === "open" ? source.documentId : null),
        dialog: document.querySelector<HTMLElement>('[role="alertdialog"]'),
        dialogDeadline: performance.now() + 2000};
      schedule();
    }
    return {
      open(documentId: string) {
        const current = live.current;
        if (current.owner === null) { cancel(); return; }
        const scroll: NonNullable<Origin["scroll"]> = [];
        let element: Element | null = rows.current.get(documentId) ?? listTarget.current;
        while (element) { scroll.push({element, top: element.scrollTop, left: element.scrollLeft}); element = element.parentElement; }
        const source = {owner: current.owner, listKey: current.listKey, documentId, scroll};
        origin.current = source;
        arm("open", source);
      },
      close() {
        const source = origin.current, current = live.current;
        if (current.owner === null) { cancel(); return; }
        if (source && Object.is(source.owner, current.owner) && source.listKey === current.listKey) {
          arm("close", source); return;
        }
        // A restored/directly selected detail may have no row origin. Use only
        // today's authorized list heading, never an earlier owner/list's row.
        origin.current = null;
        if (current.selected === null && !current.listReady) { cancel(); return; }
        arm("close", {owner: current.owner, listKey: current.listKey, documentId: current.selected ?? ""}, false);
      },
      cancel,
      row(documentId: string, element: HTMLElement | null) {
        if (element) rows.current.set(documentId, element); else rows.current.delete(documentId);
        schedule();
      },
      detail(element: HTMLElement | null) { detailTarget.current = element; schedule(); },
      list(element: HTMLElement | null) { listTarget.current = element; schedule(); },
      commit() {
        const source = origin.current, current = live.current;
        if (source && (current.owner === null || !Object.is(source.owner, current.owner)
          || source.listKey !== current.listKey)) origin.current = null;
        const ticket = pending.current;
        if (ticket && !valid(ticket)) cancel(); else schedule();
      },
    };
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    const interrupt = (event: Event) => { if (event.isTrusted) actions.cancel(); };
    const focus = (event: FocusEvent) => {
      const ticket = pending.current, target = event.target;
      if (!event.isTrusted || !ticket || !(target instanceof Node) || target === document.body) return;
      const row = ticket.restoreRow ? rows.current.get(ticket.documentId) : null;
      if (row?.contains(target) || ticket.dialog?.contains(target)) return;
      actions.cancel();
    };
    const visibility = () => { if (document.hidden) actions.cancel(); };
    const blur = (event: FocusEvent) => { if (event.target === window) actions.cancel(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) document.addEventListener(name, interrupt, {capture: true, passive: true});
    document.addEventListener("focusin", focus, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    return () => {
      mounted.current = false; actions.cancel(); origin.current = null;
      for (const name of events) document.removeEventListener(name, interrupt, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
    };
  }, [actions]);
  useLayoutEffect(() => { live.current = options; actions.commit(); });

  return useMemo(() => ({open: actions.open, close: actions.close, cancel: actions.cancel,
    row: actions.row, detail: actions.detail, list: actions.list}), [actions]);
}
