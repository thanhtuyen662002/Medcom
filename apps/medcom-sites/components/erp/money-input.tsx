"use client";

import {useState, type ComponentProps} from "react";
import {formatMoney, moneyInputToRaw, moneyPasteToRaw} from "@/lib/erp/money";
import {cn} from "@/lib/utils";

export function MoneyInput({value, onValueChange, onFocus, onBlur, onPaste, className, ...props}: Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string; onValueChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const commit = (raw: string | null) => {
    if(!props.disabled&&!props.readOnly&&raw!==null&&(props.maxLength==null||raw.length<=props.maxLength))onValueChange(raw);
  };
  return <input {...props} type="text" inputMode={props.inputMode || "decimal"}
    className={cn("min-h-11 min-w-0 w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-base tabular-nums text-black dark:border-neutral-700 dark:bg-neutral-900 dark:text-white", className)}
    value={focused ? value : formatMoney(value, "")}
    onFocus={event => {if(!props.readOnly)setFocused(true);onFocus?.(event);}}
    onBlur={event => {setFocused(false);onBlur?.(event);}}
    onPaste={event => {
      onPaste?.(event);
      if(event.defaultPrevented||props.disabled||props.readOnly)return;
      const pasted=moneyPasteToRaw(event.clipboardData.getData("text"));
      event.preventDefault();
      if(pasted===null)return;
      const start=event.currentTarget.selectionStart??0,end=event.currentTarget.selectionEnd??value.length;
      const next=moneyInputToRaw(value.slice(0,start)+pasted+value.slice(end));
      commit(next);
    }}
    onChange={event => commit(moneyInputToRaw(event.target.value))} />;
}
