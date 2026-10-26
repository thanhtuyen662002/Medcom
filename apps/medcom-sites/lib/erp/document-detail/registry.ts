import { createElement, type ComponentType } from "react";
import { SalesOrderForm } from "@/components/erp/sales-order-form";
import { ErpDocumentDetailBody } from "@/components/erp/erp-document-detail-body";
import type { SalesOrderModule } from "../sales-order-workflow";
import type { DocumentDetailConfig, ErpScreenModule } from "./types";
import { salesOrderDetailConfig } from "./modules/sales";
import { purchaseRequestDetailConfig, purchaseOrderDetailConfig } from "./modules/purchase";
import { inboundRequestDetailConfig, inboundWarehouseDetailConfig } from "./modules/inbound";
import { transferRequestDetailConfig, transferPmDetailConfig, transferBatchDetailConfig, transferTechnicalDetailConfig, transferAccountingDetailConfig, transferWarehouseOutDetailConfig, transferWarehouseInDetailConfig } from "./modules/transfer";
import { machineMovementDetailConfig, machineRepairDetailConfig } from "./modules/machine";
import { warehouseQrDetailConfig, salesQrDetailConfig } from "./modules/qr";

export interface DocumentDetailBodyProps {
  module: ErpScreenModule;
  branchId: string;
  documentId: string;
  onClose(): void;
  onChanged(): void;
  onCloseGuardChange?: (guard: (() => boolean) | null) => void;
  onOpenGuardChange?: (guard: (() => boolean) | null) => void;
  onEditPurchaseRequest?: (documentId: string) => void;
  onDeleted?: () => void;
  reloadVersion?: number;
}

interface DocumentDetailEntry {
  config: DocumentDetailConfig;
  Body: ComponentType<DocumentDetailBodyProps>;
}

// These entries are admitted only for the modules declared by the sales config.
const salesEntry: DocumentDetailEntry = {
  config: salesOrderDetailConfig,
  Body: props => createElement(SalesOrderForm, { ...props, module: props.module as SalesOrderModule }),
};

const genericEntries: DocumentDetailEntry[] = [
  purchaseRequestDetailConfig, purchaseOrderDetailConfig, inboundRequestDetailConfig, inboundWarehouseDetailConfig,
  transferRequestDetailConfig, transferPmDetailConfig, transferBatchDetailConfig,
  transferTechnicalDetailConfig, transferAccountingDetailConfig, transferWarehouseOutDetailConfig,
  transferWarehouseInDetailConfig, machineMovementDetailConfig, machineRepairDetailConfig,
  warehouseQrDetailConfig, salesQrDetailConfig,
].map(config => ({ config, Body: ErpDocumentDetailBody }));

export function getDocumentDetailEntry(module: ErpScreenModule): DocumentDetailEntry | null {
  return salesOrderDetailConfig.modules.includes(module) ? salesEntry
    : genericEntries.find(entry => entry.config.modules.includes(module)) ?? null;
}
