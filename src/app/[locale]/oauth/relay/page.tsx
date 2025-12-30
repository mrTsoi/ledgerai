"use client"
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function RelayPage() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.opener) {
      window.opener.postMessage({
        type: searchParams.get("type"),
        ok: searchParams.get("ok") === "1",
        source_id: searchParams.get("source_id"),
        return_to: searchParams.get("return_to"),
        // add more params as needed
      }, window.location.origin);
      window.close();
    }
  }, [searchParams]);
  return <div>Completing authentication...</div>;
}
