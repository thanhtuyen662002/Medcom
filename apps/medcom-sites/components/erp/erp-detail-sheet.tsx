"use client";

import { UntitledBottomSheet, type UntitledBottomSheetProps } from "@/components/untitledui/bottom-sheet";
import { RecordDialog } from "./record-dialog";

export function ErpDetailSheet({ salesOrder, documentNumber, ...props }: UntitledBottomSheetProps & {
  salesOrder: boolean; documentNumber: string | null;
}) {
  if (!salesOrder) return <UntitledBottomSheet {...props} />;
  return <RecordDialog open={props.open} title="Đơn hàng" documentNumber={documentNumber}
    closeLabel="Đóng chi tiết đơn hàng" onRequestClose={props.onClose}>
    {props.children}
  </RecordDialog>;
}
