import { redirect } from "next/navigation";

export default function InternalHomePage() {
  redirect("/internal/onboarding");
}
