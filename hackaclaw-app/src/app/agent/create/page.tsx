"use client";

import { useEffect } from "react";

/**
 * Redirect to /connect which handles the full agent creation flow.
 */
export default function CreateAgentPage() {
  useEffect(() => {
    window.location.href = "/connect";
  }, []);

  return (
    <div className="min-h-[85vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
