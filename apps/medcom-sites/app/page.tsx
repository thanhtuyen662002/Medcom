import Workspace from "@/components/erp/workspace";
import { MedcomApp } from "@/components/untitledui/medcom-app";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ screen?: string; view?: string }>;
}) {
  const params = await searchParams;
  if (process.env.MEDCOM_LOCAL_HTTPS === "1" || params?.screen || params?.view === "classic") {
    return <Workspace />;
  }

  return <MedcomApp />;
}
