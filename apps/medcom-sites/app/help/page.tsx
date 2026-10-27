import { redirect } from "next/navigation";

// Help lives inside each screen ("Hướng dẫn" on its header), shown only to users the screen is shown to.
export default function HelpPage() {
  redirect("/");
}
