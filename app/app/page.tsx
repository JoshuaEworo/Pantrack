import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Client from "./client";

// This will be a server component
export default async function ProtectedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/");
  }

  return (
    <Client user={user} />
  );
}
