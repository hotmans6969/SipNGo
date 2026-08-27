import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Sends each role somewhere useful.
 *
 * The app's start_url is "/", so this is what opens when the icon is tapped.
 * Staff were landing on the customer ordering menu, which is no use to
 * someone standing behind the counter.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  if (user && (user.role === "admin" || user.role === "staff")) {
    redirect("/admin/sales");
  }

  redirect("/menu");
}
