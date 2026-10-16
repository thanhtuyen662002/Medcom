import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";
import { defaultGuideId, findGuide } from "@/lib/help/guides";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng | Medcom",
  description: "Hướng dẫn Medcom từng bước với ảnh minh họa: đề nghị mua hàng, duyệt đề nghị và đặt mua hàng. Thuận tiện trên điện thoại.",
};

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  const { guide } = await searchParams;
  return <HelpCenter initialGuideId={guide && findGuide(guide) ? guide : defaultGuideId} />;
}
