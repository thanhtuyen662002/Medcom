"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Lock,
  User,
  Building2,
  Eye,
  EyeOff,
  ArrowRight,
  Server,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { UntitledButton } from "./button";
import { UntitledBadge } from "./badge";
import { REAL_BRANCHES, erpClient, type LoginResult } from "@/lib/erp/erp-client";

export interface LoginScreenProps {
  onLoginSuccess: (user: NonNullable<LoginResult["user"]>) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Medcom@2026");
  const [selectedBranch, setSelectedBranch] = useState("CN01");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await erpClient.login(username, password, selectedBranch);
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || "Tên đăng nhập hoặc mật khẩu không chính xác.");
      }
    } catch {
      setErrorMessage("Không thể kết nối máy chủ xác thực ERP. Vui lòng kiểm tra lại mạng.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-neutral-50 via-purple-50/20 to-neutral-100 dark:from-neutral-950 dark:via-purple-950/20 dark:to-neutral-900 transition-colors">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-purple-500/10 dark:bg-purple-600/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-14 rounded-2xl bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-500 text-white items-center justify-center shadow-lg ring-4 ring-purple-100 dark:ring-purple-950/60 mb-2">
            <ShieldCheck className="size-8" />
          </div>

          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
              MEDCOM ERP
            </h1>
            <UntitledBadge variant="purple" size="sm" dot>
              v2026.10
            </UntitledBadge>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Hệ thống Quản lý Dược phẩm & Chuỗi Cung ứng Bệnh viện
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Đăng nhập tài khoản
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Nhập thông tin tài khoản được cấp quyền để truy cập không gian làm việc
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5 animate-uui-fade-in">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Đăng nhập ERP">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                <input
                  id="login-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin hoặc mã nhân viên..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/60 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/60 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Branch Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Chi nhánh làm việc
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/60 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer"
                >
                  {REAL_BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-neutral-600 dark:text-neutral-400 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded text-purple-600 focus:ring-purple-500 border-neutral-300 dark:border-neutral-700"
                />
                <span>Ghi nhớ phiên đăng nhập</span>
              </label>
              <a
                href="#help"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Vui lòng liên hệ Quản trị viên IT Medcom để cấp lại mật khẩu.");
                }}
                className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
              >
                Quên mật khẩu?
              </a>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <UntitledButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                iconTrailing={<ArrowRight className="size-4" />}
              >
                Đăng nhập
              </UntitledButton>
            </div>
          </form>

          {/* Compliance Footer */}
          <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-center">
            <p className="text-[11px] text-neutral-400 flex items-center justify-center gap-1.5">
              <Server className="size-3 text-purple-600" />
              <span>Xác thực an toàn AES-GCM · Chuẩn Dược GSP Bộ Y Tế</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
