"use client";
import { useEffect } from "react";

export default function ResultsRedirect() {
  useEffect(() => { window.location.href = "/hackathons"; }, []);
  return (
    <div className="min-h-[85vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
