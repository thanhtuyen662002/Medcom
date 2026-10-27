"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  FileText,
  Building2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { UntitledBottomSheet } from "./bottom-sheet";
import { UntitledBadge } from "./badge";
import {
  erpClient,
  type NotificationRow,
  type NotificationTarget,
} from "@/lib/erp/erp-client";
import { type NavTabId } from "./bottom-nav";
import { isGuid, readableNotificationText } from "@/lib/erp/notification-text";

export interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
  onNavigateToModule?: (tab: NavTabId, branchId?: string, documentId?: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationsSheet({
  open,
  onClose,
  onNavigateToModule,
  onUnreadCountChange,
}: NotificationsSheetProps) {
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [targetError, setTargetError] = useState<{ id: number; message: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await erpClient.getNotifications({
        page: nextPage,
        pageSize: 30,
        unreadOnly: filterUnreadOnly,
      });
      setNotifications((prev) => [...prev, ...result.rows]);
      setPage(nextPage);
      setTotalRows(result.totalRows);
    } catch (err) {
      console.error("Failed to load more notifications:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchNotifications = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setTargetError(null);

      try {
        const result = await erpClient.getNotifications({
          page: 1,
          pageSize: 30,
          unreadOnly: filterUnreadOnly,
        });

        setNotifications(result.rows);
        setUnreadCount(result.unreadCount);
        setTotalRows(result.totalRows);
        setPage(1);
        if (onUnreadCountChange) {
          onUnreadCountChange(result.unreadCount);
        }
      } catch (err) {
        console.error("Failed to load ERP notifications:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filterUnreadOnly, onUnreadCountChange]
  );

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleToggleRead = async (e: React.MouseEvent, item: NotificationRow) => {
    e.stopPropagation();
    setActionLoadingId(item.id);
    try {
      const nextView = !item.isView;
      const updated = await erpClient.markNotificationRead(item.id, nextView);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isView: updated.isView, viewDate: updated.viewDate } : n))
      );
      const nextUnread = nextView ? Math.max(0, unreadCount - 1) : unreadCount + 1;
      setUnreadCount(nextUnread);
      if (onUnreadCountChange) onUnreadCountChange(nextUnread);
    } catch (err) {
      console.error("Failed to toggle notification read state:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenTarget = async (item: NotificationRow) => {
    setTargetError(null);
    setActionLoadingId(item.id);

    try {
      // 1. Mark as read if not yet read
      if (!item.isView) {
        try {
          await erpClient.markNotificationRead(item.id, true);
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, isView: true } : n))
          );
          const nextUnread = Math.max(0, unreadCount - 1);
          setUnreadCount(nextUnread);
          if (onUnreadCountChange) onUnreadCountChange(nextUnread);
        } catch {}
      }

      // 2. Resolve document target authority
      const target: NotificationTarget = await erpClient.getNotificationTarget(item.id);

      if (!target.canOpen) {
        const reasonMsg = getReasonMessage(target.reason);
        setTargetError({ id: item.id, message: reasonMsg });
        return;
      }

      // 3. Navigate to module
      if (target.moduleId && onNavigateToModule) {
        const tabId = mapModuleToTab(target.moduleId);
        if (tabId) {
          onClose();
          onNavigateToModule(tabId, target.branchId || undefined, target.documentId || undefined);
        } else {
          setTargetError({
            id: item.id,
            message: `Phân hệ "${target.moduleId}" chưa có màn hình hiển thị trực tiếp.`,
          });
        }
      }
    } catch (err) {
      console.error("Failed to open notification target:", err);
      setTargetError({
        id: item.id,
        message: "Không thể kiểm tra chứng từ liên kết. Vui lòng thử lại sau.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const mapModuleToTab = (moduleId: string): NavTabId | null => {
    switch (moduleId) {
      case "purchase-orders":
        return "purchase-orders";
      case "purchase-requests":
        return "purchase-requests";
      case "inbound-requests":
        return "inbound-requests";
      case "inbound-warehouse":
        return "inbound-warehouse";
      case "inbound-sa":
        return "inbound-sa";
      case "inbound-tech":
        return "inbound-tech";
      case "inbound-pm":
        return "inbound-pm";
      case "inbound-bld":
        return "inbound-bld";
      case "inbound-costs":
        return "inbound-costs";
      case "sales-orders":
        return "sales-orders";
      case "internal-transfer-requests":
        return "internal-transfer-requests";
      case "warehouse-qr":
        return "warehouse-qr";
      case "sales-qr":
        return "sales-qr";
      case "machine-movements":
        return "machine-movements";
      case "machine-repairs":
        return "machine-repairs";
      case "purchase-approvals":
        return "purchase-approvals";
      case "sales-order-pm":
        return "sales-order-pm";
      case "sales-order-sa":
        return "sales-order-sa";
      case "internal-transfer-pm":
        return "internal-transfer-pm";
      case "internal-transfer-batches":
        return "internal-transfer-batches";
      case "internal-transfer-tech":
        return "internal-transfer-tech";
      case "internal-transfer-sa":
        return "internal-transfer-sa";
      case "internal-transfer-accounting":
        return "internal-transfer-accounting";
      case "internal-transfer-warehouse-out":
        return "internal-transfer-warehouse-out";
      case "internal-transfer-warehouse-in":
        return "internal-transfer-warehouse-in";
      default:
        return null;
    }
  };

  const getReasonMessage = (reason: string | null): string => {
    switch (reason) {
      case "notification_document_missing":
        return "Chứng từ liên kết không còn tồn tại trên hệ thống.";
      case "notification_document_denied":
        return "Bạn không có quyền truy cập chứng từ hoặc chi nhánh này.";
      case "notification_form_unsupported":
        return "Biểu mẫu nguồn của chứng từ chưa được tích hợp trên Web.";
      case "notification_form_ambiguous":
        return "Biểu mẫu chứng từ không xác định rõ ràng.";
      case "notification_document_not_found":
        return "Không tìm thấy chứng từ trong phạm vi chi nhánh hiện tại.";
      case "notification_document_unavailable":
        return "Chứng từ tạm thời không khả dụng trên cơ sở dữ liệu.";
      default:
        return "Không thể mở chứng từ theo thông báo này.";
    }
  };

  const formatTimestamp = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return timeStr;
      return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return timeStr;
    }
  };

  const getTypeStyle = (type: string, colorHex?: string | null) => {
    if (colorHex) {
      return {
        bg: "bg-brand-50 dark:bg-brand-950/40",
        border: "border-brand-200 dark:border-brand-800",
        icon: <Info className="size-4" style={{ color: colorHex }} />,
      };
    }

    switch (type.toLowerCase()) {
      case "warning":
        return {
          bg: "bg-amber-50 dark:bg-amber-950/40",
          border: "border-amber-200 dark:border-amber-800",
          icon: <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />,
        };
      case "error":
        return {
          bg: "bg-rose-50 dark:bg-rose-950/40",
          border: "border-rose-200 dark:border-rose-800",
          icon: <XCircle className="size-4 text-rose-600 dark:text-rose-400" />,
        };
      case "success":
        return {
          bg: "bg-emerald-50 dark:bg-emerald-950/40",
          border: "border-emerald-200 dark:border-emerald-800",
          icon: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
        };
      default:
        return {
          bg: "bg-brand-50 dark:bg-brand-950/40",
          border: "border-brand-200 dark:border-brand-800",
          icon: <Info className="size-4 text-brand-600 dark:text-brand-400" />,
        };
    }
  };

  return (
    <UntitledBottomSheet
      open={open}
      onClose={onClose}
      title="Thông báo hệ thống ERP Medcom"
      subtitle="Thông báo phê duyệt, luân chuyển và chứng từ theo thời gian thực"
    >
      <div className="space-y-4 max-h-[75vh] flex flex-col p-1">
        {/* Filter Pills & Refresh */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterUnreadOnly(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !filterUnreadOnly
                  ? "bg-white dark:bg-neutral-900 text-brand-700 dark:text-brand-300 shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Tất cả ({totalRows})
            </button>
            <button
              type="button"
              onClick={() => setFilterUnreadOnly(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterUnreadOnly
                  ? "bg-white dark:bg-neutral-900 text-brand-700 dark:text-brand-300 shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Chưa đọc
              {unreadCount > 0 && (
                <span className="size-2 rounded-full bg-brand-600 inline-block" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300 transition-colors"
            title="Làm mới thông báo"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-brand-600" : ""}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>

        {/* Notification List Container */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[220px]">
          {loading ? (
            <div className="space-y-2.5 py-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/50 animate-pulse flex items-start gap-3"
                >
                  <div className="size-9 rounded-xl bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3" />
                    <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-neutral-50 dark:bg-neutral-900/40 rounded-2xl border border-neutral-200/60 dark:border-neutral-800">
              <div className="size-10 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 mx-auto flex items-center justify-center">
                <Bell className="size-5" />
              </div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {filterUnreadOnly ? "Không có thông báo chưa đọc" : "Không có thông báo mới"}
              </p>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                {filterUnreadOnly
                  ? "Bạn đã đọc hết tất cả các thông báo phê duyệt và chứng từ."
                  : "Các thông báo từ máy chủ ERP sẽ tự động cập nhật khi có chứng từ phát sinh."}
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const typeStyle = getTypeStyle(item.notifyType, item.colorHex);
              const isItemLoading = actionLoadingId === item.id;
              const hasError = targetError?.id === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => handleOpenTarget(item)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group ${
                    item.isView
                      ? "bg-white dark:bg-neutral-900/60 border-neutral-200/80 dark:border-neutral-800 hover:border-brand-300 dark:hover:border-brand-800"
                      : "bg-brand-50/40 dark:bg-brand-950/20 border-brand-200 dark:border-brand-900/60 shadow-2xs hover:border-brand-300 dark:hover:border-brand-700"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon Box */}
                    <div
                      className={`size-9 rounded-xl flex items-center justify-center shrink-0 border ${typeStyle.bg} ${typeStyle.border}`}
                    >
                      {typeStyle.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4
                            className={`text-xs font-bold leading-tight truncate ${
                              item.isView
                                ? "text-neutral-800 dark:text-neutral-200"
                                : "text-neutral-900 dark:text-white"
                            }`}
                          >
                            {item.title}
                          </h4>
                          {!item.isView && (
                            <span className="size-2 rounded-full bg-brand-600 shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTimestamp(item.msgTime)}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                        {readableNotificationText(item.message)}
                      </p>

                      {/* Footer Metadata & Badges */}
                      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.documentId && !isGuid(item.documentId) && (
                            <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-xs font-semibold">
                              {item.documentId}
                            </span>
                          )}
                        </div>

                        {/* Toggle Read Action Button */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleToggleRead(e, item)}
                            disabled={isItemLoading}
                            className="p-1 rounded-lg text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            title={item.isView ? "Đánh dấu là chưa đọc" : "Đánh dấu là đã đọc"}
                          >
                            {item.isView ? (
                              <CheckCheck className="size-3.5 text-neutral-400" />
                            ) : (
                              <Check className="size-3.5 text-brand-600 font-bold" />
                            )}
                          </button>
                          <ChevronRight className="size-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>

                      {/* Target Error Alert */}
                      {hasError && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5 animate-uui-fade-in">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          <span>{targetError.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {notifications.length < totalRows && (
            <div className="pt-2 pb-1 text-center shrink-0">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {loadingMore ? "Đang tải thêm..." : `Tải thêm thông báo (${notifications.length}/${totalRows})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </UntitledBottomSheet>
  );
}
