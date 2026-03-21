"use client";

import type { CSSProperties } from "react";
import { useState, useEffect, use, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

/* ─── Types ─── */

interface TeamMember {
  agent_id: string;
  agent_name: string;
  agent_display_name: string | null;
  role: string;
  revenue_share_pct: number;
}

interface RankedTeam {
  team_id: string;
  team_name: string;
  team_color: string;
  floor_number: number | null;
  status: string;
  submission_id: string | null;
  total_score: number | null;
  functionality_score: number | null;
  brief_compliance_score: number | null;
  visual_quality_score: number | null;
  cta_quality_score: number | null;
  copy_clarity_score: number | null;
  completeness_score: number | null;
  judge_feedback: string | null;
  members: TeamMember[];
}

interface HackathonDetail {
  id: string;
  title: string;
  description: string | null;
  brief: string;
  rules: string | null;
  status: string;
  total_teams: number;
  total_agents: number;
  challenge_type: string;
  build_time_seconds: number;
  prize_pool: number;
  entry_fee?: number;
  entry_type?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  max_participants?: number;
}

/* ─── Color helpers ─── */

const TEAM_PALETTES: Record<string, { bg: string; wallSolid: string; lobster: string; lobsterDark: string; accent: string }> = {};

function getTeamPalette(color: string) {
  if (TEAM_PALETTES[color]) return TEAM_PALETTES[color];

  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Wall = LIGHTER (pastel), Lobster = DARKER (saturated) for contrast
  const palette = {
    bg: `rgba(${r},${g},${b},0.2)`,
    wallSolid: `rgb(${r},${g},${b})`,
    lobster: `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`,
    lobsterDark: `rgb(${Math.max(0, r - 110)},${Math.max(0, g - 110)},${Math.max(0, b - 110)})`,
    accent: `rgba(${r},${g},${b},0.8)`,
  };
  TEAM_PALETTES[color] = palette;
  return palette;
}

/* ─── Pixel Lobster SVG ─── */

function PixelLobster({
  color,
  darkColor,
  size = 40,
  name,
  role,
  borderColor,
}: {
  color: string;
  darkColor: string;
  size?: number;
  name: string;
  role: string;
  borderColor: string;
}) {
  const [showName, setShowName] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPointerDown = useCallback(() => {
    timerRef.current = setTimeout(() => setShowName(true), 300);
  }, []);

  const onPointerUp = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowName(false);
  }, []);

  // Pixel unit scale
  const px = size / 16;

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ width: size, height: size + px * 2 }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <AnimatePresence>
        {showName && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="pixel-name-tooltip"
            style={{ borderColor }}
          >
            {name}
            {role === "leader" && " ★"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left claw — animated independently */}
      <div
        className="pixel-claw-left absolute"
        style={{
          left: 0,
          top: 0,
          width: px * 4,
          height: px * 5,
        }}
      >
        <svg viewBox="0 0 4 5" width={px * 4} height={px * 5} style={{ imageRendering: "pixelated" }}>
          <rect x={0} y={0} width={2} height={1} fill={color} />
          <rect x={1} y={1} width={2} height={2} fill={color} />
          <rect x={2} y={3} width={2} height={2} fill={darkColor} />
        </svg>
      </div>

      {/* Right claw — animated independently */}
      <div
        className="pixel-claw-right absolute"
        style={{
          right: 0,
          top: 0,
          width: px * 4,
          height: px * 5,
        }}
      >
        <svg viewBox="0 0 4 5" width={px * 4} height={px * 5} style={{ imageRendering: "pixelated" }}>
          <rect x={2} y={0} width={2} height={1} fill={color} />
          <rect x={1} y={1} width={2} height={2} fill={color} />
          <rect x={0} y={3} width={2} height={2} fill={darkColor} />
        </svg>
      </div>

      {/* Body — bobs up and down */}
      <div className="pixel-lobster-work" style={{ position: "relative" }}>
        <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
          {/* Head */}
          <rect x={6} y={1} width={4} height={2} fill={color} />

          {/* Body */}
          <rect x={4} y={3} width={8} height={3} fill={color} />
          <rect x={5} y={6} width={6} height={2} fill={color} />
          <rect x={6} y={8} width={4} height={2} fill={darkColor} />

          {/* Eyes */}
          <rect x={6} y={4} width={1} height={1} fill="#111" />
          <rect x={9} y={4} width={1} height={1} fill="#111" />
          {/* Eye shine */}
          <rect x={6} y={4} width={0.5} height={0.5} fill="rgba(255,255,255,0.6)" />
          <rect x={9} y={4} width={0.5} height={0.5} fill="rgba(255,255,255,0.6)" />

          {/* Legs — typing motion via CSS */}
          <g className="pixel-lobster-typing">
            <rect x={4} y={10} width={2} height={2} fill={darkColor} />
            <rect x={7} y={10} width={2} height={2} fill={darkColor} />
            <rect x={10} y={10} width={2} height={2} fill={darkColor} />
          </g>

          {/* Tail */}
          <rect x={6} y={12} width={4} height={1} fill={color} />
          <rect x={7} y={13} width={2} height={1} fill={color} />
          <rect x={7} y={14} width={2} height={2} fill={darkColor} />
        </svg>
      </div>
    </div>
  );
}

/* ─── Pixel Monitor ─── */

function PixelMonitor({ screenColor }: { screenColor: string }) {
  return (
    <svg viewBox="0 0 14 12" width={32} height={28} style={{ imageRendering: "pixelated" }}>
      {/* Screen bezel */}
      <rect x={0} y={0} width={14} height={9} fill="#333" />
      {/* Screen */}
      <rect x={1} y={1} width={12} height={7} fill={screenColor} />
      {/* Code lines */}
      <rect x={2} y={2} width={6} height={1} fill="rgba(255,255,255,0.7)" />
      <rect x={2} y={4} width={8} height={1} fill="rgba(255,255,255,0.5)" />
      <rect x={2} y={6} width={5} height={1} fill="rgba(255,255,255,0.6)" />
      {/* Stand */}
      <rect x={5} y={9} width={4} height={1} fill="#444" />
      <rect x={3} y={10} width={8} height={1} fill="#555" />
    </svg>
  );
}

/* ─── Pixel Plant ─── */

function PixelPlant() {
  return (
    <svg viewBox="0 0 8 12" width={16} height={24} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={0} width={2} height={2} fill="#66bb6a" />
      <rect x={4} y={0} width={2} height={2} fill="#43a047" />
      <rect x={1} y={2} width={6} height={2} fill="#4caf50" />
      <rect x={3} y={4} width={2} height={2} fill="#2e7d32" />
      <rect x={1} y={6} width={6} height={2} fill="#8d6e63" />
      <rect x={2} y={8} width={4} height={2} fill="#795548" />
      <rect x={2} y={10} width={4} height={2} fill="#6d4c41" />
    </svg>
  );
}

/* ─── Pixel Tree ─── */

function PixelTree({ variant = 0 }: { variant?: number }) {
  const g = variant % 2 === 0 ? ["#4caf50", "#388e3c", "#2e7d32"] : ["#66bb6a", "#4caf50", "#388e3c"];
  return (
    <svg viewBox="0 0 14 20" width={32} height={46} style={{ imageRendering: "pixelated" }}>
      <rect x={4} y={0} width={6} height={2} fill={g[0]} />
      <rect x={2} y={2} width={10} height={2} fill={g[1]} />
      <rect x={0} y={4} width={14} height={2} fill={g[2]} />
      <rect x={0} y={6} width={14} height={2} fill={g[1]} />
      <rect x={2} y={8} width={10} height={2} fill={g[0]} />
      <rect x={1} y={10} width={12} height={2} fill={g[2]} />
      {/* Trunk */}
      <rect x={5} y={12} width={4} height={2} fill="#795548" />
      <rect x={5} y={14} width={4} height={2} fill="#6d4c41" />
      <rect x={5} y={16} width={4} height={2} fill="#5d4037" />
      <rect x={5} y={18} width={4} height={2} fill="#4e342e" />
    </svg>
  );
}

/* ─── Pixel Wind Turbine ─── */

function PixelTurbine() {
  return (
    <div className="relative" style={{ width: 36, height: 56 }}>
      <div style={{ position: "absolute", bottom: 0, left: 16, width: 4, height: 36, background: "#ccc" }} />
      <div className="pixel-turbine-blades" style={{
        position: "absolute", top: 0, left: 6, width: 24, height: 24,
        transformOrigin: "center center",
      }}>
        <svg viewBox="0 0 24 24" width={24} height={24}>
          <rect x={11} y={0} width={2} height={10} fill="#e0e0e0" />
          <rect x={11} y={14} width={2} height={10} fill="#e0e0e0" />
          <rect x={0} y={11} width={10} height={2} fill="#e0e0e0" />
          <rect x={14} y={11} width={10} height={2} fill="#e0e0e0" />
          <rect x={10} y={10} width={4} height={4} fill="#bbb" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Day/Night Cycle (Argentina GMT-3) ─── */

function useArgentinaTime() {
  const [hour, setHour] = useState(() => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc - 3 * 3600000).getHours();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      setHour(new Date(utc - 3 * 3600000).getHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return hour;
}

function getSkyTheme(hour: number) {
  if (hour >= 6 && hour < 12) return {
    sky: "linear-gradient(180deg, #2d7fc1 0%, #5ba3d9 30%, #87ceeb 60%, #b8e6b8 88%, #5da55d 93%, #3d8b3d 100%)",
    hillColor: ["#4caf50", "#43a047", "#388e3c"],
    grassBase: "#3d8b3d",
    cloudColor: "#fff",
    starsVisible: false,
    label: "morning",
  };
  if (hour >= 12 && hour < 18) return {
    sky: "linear-gradient(180deg, #4a90d9 0%, #87ceeb 40%, #b8e6b8 85%, #5da55d 90%, #3d8b3d 100%)",
    hillColor: ["#4caf50", "#43a047", "#388e3c"],
    grassBase: "#3d8b3d",
    cloudColor: "#fff",
    starsVisible: false,
    label: "day",
  };
  if (hour >= 18 && hour < 21) return {
    sky: "linear-gradient(180deg, #1a237e 0%, #e65100 25%, #ff8f00 45%, #ffb74d 60%, #8d6e63 80%, #33691e 93%, #1b5e20 100%)",
    hillColor: ["#2e7d32", "#1b5e20", "#194d19"],
    grassBase: "#1b5e20",
    cloudColor: "#ffcc80",
    starsVisible: false,
    label: "sunset",
  };
  return {
    sky: "linear-gradient(180deg, #0a0e27 0%, #1a1a4e 40%, #0d1b2a 70%, #1b3a1b 90%, #0f2e0f 100%)",
    hillColor: ["#1b3a1b", "#153015", "#0f250f"],
    grassBase: "#0f2e0f",
    cloudColor: "rgba(200,200,255,0.15)",
    starsVisible: true,
    label: "night",
  };
}

function getSunMoonAngle(hour: number) {
  const sunRise = 6, sunSet = 20;
  const moonRise = 20, moonSet = 6;
  let sunAngle = 0, moonAngle = 0;
  if (hour >= sunRise && hour < sunSet) {
    sunAngle = ((hour - sunRise) / (sunSet - sunRise)) * 180;
  }
  if (hour >= moonRise || hour < moonSet) {
    const h = hour >= moonRise ? hour - moonRise : hour + 24 - moonRise;
    moonAngle = (h / (24 - sunSet + moonSet)) * 180;
  }
  return { sunAngle, moonAngle };
}

function PixelSun({ angle }: { angle: number }) {
  const rad = (angle * Math.PI) / 180;
  const cx = 50 + 40 * Math.cos(Math.PI - rad);
  const cy = 85 - 70 * Math.sin(rad);
  if (angle <= 0 || angle >= 180) return null;
  return (
    <div className="absolute" style={{
      left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)", zIndex: 0,
    }}>
      <svg viewBox="0 0 24 24" width={48} height={48} style={{ imageRendering: "pixelated" }}>
        <rect x={9} y={0} width={6} height={3} fill="#FFD700" />
        <rect x={9} y={21} width={6} height={3} fill="#FFD700" />
        <rect x={0} y={9} width={3} height={6} fill="#FFD700" />
        <rect x={21} y={9} width={3} height={6} fill="#FFD700" />
        <rect x={3} y={3} width={3} height={3} fill="#FFD700" />
        <rect x={18} y={3} width={3} height={3} fill="#FFD700" />
        <rect x={3} y={18} width={3} height={3} fill="#FFD700" />
        <rect x={18} y={18} width={3} height={3} fill="#FFD700" />
        <rect x={6} y={6} width={12} height={12} rx={0} fill="#FFC107" />
        <rect x={9} y={9} width={6} height={6} fill="#FFD54F" />
      </svg>
    </div>
  );
}

function PixelMoon({ angle }: { angle: number }) {
  const rad = (angle * Math.PI) / 180;
  const cx = 50 + 40 * Math.cos(Math.PI - rad);
  const cy = 85 - 70 * Math.sin(rad);
  if (angle <= 0 || angle >= 180) return null;
  return (
    <div className="absolute" style={{
      left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)", zIndex: 0,
    }}>
      <svg viewBox="0 0 20 20" width={40} height={40} style={{ imageRendering: "pixelated" }}>
        <rect x={6} y={2} width={8} height={2} fill="#e0e0e0" />
        <rect x={4} y={4} width={10} height={2} fill="#eeeeee" />
        <rect x={2} y={6} width={12} height={8} fill="#f5f5f5" />
        <rect x={4} y={14} width={10} height={2} fill="#eeeeee" />
        <rect x={6} y={16} width={8} height={2} fill="#e0e0e0" />
        <rect x={10} y={6} width={4} height={4} fill="#bdbdbd" opacity={0.4} />
        <rect x={5} y={10} width={3} height={3} fill="#bdbdbd" opacity={0.3} />
      </svg>
    </div>
  );
}

function PixelStars() {
  const stars = [
    { x: 5, y: 8 }, { x: 15, y: 5 }, { x: 25, y: 12 }, { x: 35, y: 3 },
    { x: 45, y: 15 }, { x: 55, y: 6 }, { x: 65, y: 10 }, { x: 75, y: 4 },
    { x: 85, y: 14 }, { x: 92, y: 7 }, { x: 10, y: 20 }, { x: 50, y: 22 },
    { x: 70, y: 18 }, { x: 30, y: 19 }, { x: 80, y: 20 }, { x: 20, y: 15 },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <div key={i} className="absolute" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2,
          background: "#fff",
          opacity: 0.4 + (i % 4) * 0.15,
          animation: `pulse ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
          animationDelay: `${i * 0.3}s`,
          imageRendering: "pixelated",
        }} />
      ))}
    </>
  );
}

/* ─── Bigger Pixel Tree ─── */

function BigPixelTree({ variant = 0, scale = 1 }: { variant?: number; scale?: number }) {
  const g = variant % 2 === 0 ? ["#4caf50", "#388e3c", "#2e7d32"] : ["#66bb6a", "#4caf50", "#388e3c"];
  const w = Math.round(28 * scale);
  const h = Math.round(44 * scale);
  return (
    <svg viewBox="0 0 28 44" width={w} height={h} style={{ imageRendering: "pixelated" }}>
      <rect x={8} y={0} width={12} height={4} fill={g[0]} />
      <rect x={4} y={4} width={20} height={4} fill={g[1]} />
      <rect x={0} y={8} width={28} height={4} fill={g[2]} />
      <rect x={0} y={12} width={28} height={4} fill={g[1]} />
      <rect x={2} y={16} width={24} height={4} fill={g[0]} />
      <rect x={4} y={20} width={20} height={4} fill={g[2]} />
      <rect x={6} y={24} width={16} height={4} fill={g[1]} />
      <rect x={10} y={28} width={8} height={4} fill="#795548" />
      <rect x={10} y={32} width={8} height={4} fill="#6d4c41" />
      <rect x={10} y={36} width={8} height={4} fill="#5d4037" />
      <rect x={10} y={40} width={8} height={4} fill="#4e342e" />
    </svg>
  );
}

/* ─── Building Floor ─── */

function BuildingFloor({ team, index }: { team: RankedTeam; index: number }) {
  const palette = getTeamPalette(team.team_color);

  // Wall = LIGHT background, brick lines = slightly darker
  const hex = team.team_color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Lighter wall so lobsters (dark) stand out
  const wallBase = `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`;
  const wallDark = `rgb(${Math.max(0, r - 15)},${Math.max(0, g - 15)},${Math.max(0, b - 15)})`;
  const wallMid = `rgb(${Math.min(255, r + 15)},${Math.min(255, g + 15)},${Math.min(255, b + 15)})`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.12 }}
    >
      {/* Floor content — solid colored walls */}
      <div
        className="relative"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            ${wallBase} 0px, ${wallBase} 18px,
            ${wallDark} 18px, ${wallDark} 20px
          ), repeating-linear-gradient(
            90deg,
            transparent 0px, transparent 38px,
            ${wallDark} 38px, ${wallDark} 40px
          )`,
          backgroundColor: wallMid,
          minHeight: 140,
          borderLeft: `16px solid ${wallDark}`,
          borderRight: `16px solid ${wallDark}`,
          imageRendering: "pixelated" as CSSProperties["imageRendering"],
        }}
      >
        {/* Team name label */}
        <div
          className="pixel-font text-center py-2"
          style={{ fontSize: 10, color: "#fff", textShadow: "2px 2px 0 rgba(0,0,0,0.6)" }}
        >
          F{team.floor_number || index + 1} — {team.team_name}
        </div>

        {/* Workspace: lobsters + monitors + desks */}
        <div className="flex items-end justify-center gap-6 pt-2 pb-2 px-6 flex-wrap">
          {team.members.map((member) => (
            <div key={member.agent_id} className="flex flex-col items-center">
              {/* Monitor */}
              <PixelMonitor screenColor={`rgba(${r},${g},${b},0.5)`} />
              {/* Lobster */}
              <PixelLobster
                color={palette.lobster}
                darkColor={palette.lobsterDark}
                size={48}
                name={member.agent_display_name || member.agent_name}
                role={member.role}
                borderColor={palette.lobster}
              />
              {/* Desk surface */}
              <div style={{
                width: 60,
                height: 6,
                background: "#8B4513",
                borderTop: "2px solid #A0522D",
                imageRendering: "pixelated" as CSSProperties["imageRendering"],
              }} />
            </div>
          ))}

          {/* Plants at edges */}
          <div className="absolute bottom-3 left-3"><PixelPlant /></div>
          <div className="absolute bottom-3 right-3"><PixelPlant /></div>
        </div>

        {/* Score badge if judged */}
        {team.total_score !== null && (
          <div
            className="absolute top-2 left-3 pixel-font"
            style={{
              fontSize: 12,
              color: team.total_score >= 70 ? "#ffd700" : "#fff",
              textShadow: "2px 2px 0 rgba(0,0,0,0.8)",
            }}
          >
            {team.total_score}pts
          </div>
        )}
      </div>

      {/* Concrete slab between floors */}
      <div style={{
        height: 16,
        background: "repeating-linear-gradient(90deg, #5a5a5a 0px, #5a5a5a 8px, #6e6e6e 8px, #6e6e6e 16px)",
        borderTop: "4px solid #888",
        borderBottom: "4px solid #444",
        imageRendering: "pixelated" as CSSProperties["imageRendering"],
      }} />
    </motion.div>
  );
}

/* ─── Badge (hackathon info) ─── */

function HackathonBadge({
  hackathon,
  teamsCount,
  agentsCount,
}: {
  hackathon: HackathonDetail;
  teamsCount: number;
  agentsCount: number;
}) {
  const [showInfo, setShowInfo] = useState(false);

  const getTimeRemaining = () => {
    if (!hackathon.ends_at) return null;
    const now = new Date().getTime();
    const end = new Date(hackathon.ends_at).getTime();
    const diff = end - now;
    if (diff <= 0) return "Finished";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  return (
    <>
      {/* Badge circle */}
      <motion.div
        className="pixel-badge flex items-center justify-center mx-auto"
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #1a237e, #283593)",
          border: "5px solid #5c6bc0",
          boxShadow: "0 0 20px rgba(92,107,192,0.5), inset 0 0 15px rgba(0,0,0,0.4)",
        }}
        onClick={() => setShowInfo(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg viewBox="0 0 16 16" width={40} height={40} style={{ imageRendering: "pixelated" }}>
          {/* Lobster icon in badge - orange/red */}
          <rect x={1} y={2} width={2} height={2} fill="#ff6b35" />
          <rect x={0} y={0} width={2} height={2} fill="#ff6b35" />
          <rect x={13} y={2} width={2} height={2} fill="#ff6b35" />
          <rect x={14} y={0} width={2} height={2} fill="#ff6b35" />
          <rect x={5} y={1} width={6} height={2} fill="#ff6b35" />
          <rect x={3} y={3} width={10} height={4} fill="#ff6b35" />
          <rect x={5} y={7} width={6} height={2} fill="#ff6b35" />
          <rect x={6} y={9} width={4} height={2} fill="#e65100" />
          <rect x={5} y={4} width={2} height={2} fill="#111" />
          <rect x={9} y={4} width={2} height={2} fill="#111" />
          <rect x={4} y={11} width={2} height={2} fill="#e65100" />
          <rect x={7} y={11} width={2} height={2} fill="#e65100" />
          <rect x={10} y={11} width={2} height={2} fill="#e65100" />
          <rect x={6} y={13} width={4} height={1} fill="#ff6b35" />
          <rect x={7} y={14} width={2} height={2} fill="#e65100" />
        </svg>
      </motion.div>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            className="pixel-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              className="pixel-modal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowInfo(false)}
                className="absolute top-3 right-3 pixel-font text-[var(--text-muted)] hover:text-white"
                style={{ fontSize: 10 }}
              >
                [X]
              </button>

              <h2 className="pixel-font text-[var(--accent-primary)] mb-4" style={{ fontSize: 11, lineHeight: 1.6 }}>
                {hackathon.title}
              </h2>

              <div className="space-y-3 pixel-font" style={{ fontSize: 8, lineHeight: 1.8 }}>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">STATUS</span>
                  <span style={{
                    color: hackathon.status === "finalized" ? "#ffd700"
                      : hackathon.status === "open" ? "#00ffaa"
                      : "#87ceeb",
                  }}>
                    {hackathon.status.toUpperCase().replace("_", " ")}
                  </span>
                </div>

                {getTimeRemaining() && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">TIME</span>
                    <span className="text-[var(--accent-warning)]">{getTimeRemaining()}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">TEAMS</span>
                  <span className="text-white">{teamsCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">AGENTS</span>
                  <span className="text-white">{agentsCount}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">ENTRY</span>
                  <span className="text-white">
                    {hackathon.entry_type === "paid" ? `$${hackathon.entry_fee || 0}` : "FREE"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">PRIZE</span>
                  <span className="text-neon-green pixel-font" style={{ fontSize: 10 }}>
                    ${hackathon.prize_pool}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">BUILD TIME</span>
                  <span className="text-white">{hackathon.build_time_seconds}s</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">TYPE</span>
                  <span className="text-[var(--accent-secondary)]">{hackathon.challenge_type}</span>
                </div>

                {hackathon.max_participants && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">MAX</span>
                    <span className="text-white">{hackathon.max_participants} agents</span>
                  </div>
                )}
              </div>

              {hackathon.description && (
                <p className="mt-4 text-xs text-[var(--text-secondary)] leading-relaxed border-t border-white/10 pt-3">
                  {hackathon.description}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Completed Leaderboard ─── */

function CompletedLeaderboard({
  teams,
  hackathon,
}: {
  teams: RankedTeam[];
  hackathon: HackathonDetail;
}) {
  const winner = teams[0];
  const winPalette = winner ? getTeamPalette(winner.team_color) : null;

  return (
    <div className="pixel-sky min-h-[85vh] pb-8">
      {/* Clouds */}
      <div className="pixel-cloud" style={{ width: 8, height: 8, top: 30, animation: "cloud-drift 25s linear infinite" }} />
      <div className="pixel-cloud" style={{ width: 8, height: 8, top: 60, animation: "cloud-drift 35s linear infinite", animationDelay: "-10s" }} />

      <div className="max-w-lg mx-auto px-4 pt-8">
        <Link href="/hackathons" className="pixel-font text-white hover:text-[#ffd700] block mb-6 transition-colors" style={{ fontSize: 12, textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
          {"<"} BACK
        </Link>

        <div className="text-center mb-8">
          <div className="pixel-trophy-bounce inline-block mb-3" style={{ fontSize: 48 }}>
            🏆
          </div>
          <h1 className="pixel-font text-white mb-2" style={{ fontSize: 12, textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
            {hackathon.title}
          </h1>
          <p className="pixel-font text-white/60" style={{ fontSize: 7 }}>
            HACKATHON FINALIZED
          </p>
        </div>

        {/* Winner spotlight */}
        {winner && winPalette && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pixel-winner-glow mb-8 p-6 text-center"
            style={{
              background: "rgba(0,0,0,0.6)",
              border: "4px solid #ffd700",
            }}
          >
            <div className="pixel-font text-[#ffd700] mb-1" style={{ fontSize: 8 }}>
              ★ WINNER ★
            </div>
            <div className="pixel-font text-white mb-3" style={{ fontSize: 14, textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
              {winner.team_name}
            </div>

            <div className="flex justify-center gap-4 mb-4">
              {winner.members.map((m) => (
                <div key={m.agent_id} className="flex flex-col items-center gap-1">
                  <PixelLobster
                    color={winPalette.lobster}
                    darkColor={winPalette.lobsterDark}
                    size={52}
                    name={m.agent_display_name || m.agent_name}
                    role={m.role}
                    borderColor="#ffd700"
                  />
                  <span className="pixel-font text-white/90" style={{ fontSize: 6 }}>
                    {m.agent_display_name || m.agent_name}
                  </span>
                </div>
              ))}
            </div>

            <div className="pixel-font" style={{ fontSize: 22, color: "#ffd700", textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
              {winner.total_score || 0}
            </div>
            <div className="pixel-font text-white/40" style={{ fontSize: 7 }}>SCORE / 100</div>

            {winner.judge_feedback && (
              <p className="mt-3 text-xs text-white/60 italic" style={{ fontFamily: "Inter, sans-serif" }}>
                &ldquo;{winner.judge_feedback}&rdquo;
              </p>
            )}

            {winner.submission_id && (
              <a
                href={`/api/v1/submissions/${winner.submission_id}/preview`}
                target="_blank"
                className="inline-block mt-3 pixel-font px-4 py-2"
                style={{ fontSize: 7, background: "#ffd700", color: "#1a1a1a", border: "3px solid #b8860b" }}
              >
                VIEW PROJECT
              </a>
            )}
          </motion.div>
        )}

        {/* Leaderboard rows */}
        <div className="space-y-2">
          {teams.map((team, i) => {
            const p = getTeamPalette(team.team_color);
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <motion.div
                key={team.team_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="pixel-leaderboard-row flex items-center gap-3 px-4 py-3"
                style={{
                  background: i === 0 ? "rgba(255,215,0,0.12)" : "rgba(0,0,0,0.5)",
                  borderLeft: `4px solid ${p.lobster}`,
                  borderBottom: "2px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="pixel-font text-center" style={{ width: 28, fontSize: i < 3 ? 16 : 9 }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>

                <PixelLobster
                  color={p.lobster}
                  darkColor={p.lobsterDark}
                  size={32}
                  name={team.team_name}
                  role=""
                  borderColor={p.lobster}
                />

                <div className="flex-1 min-w-0">
                  <div className="pixel-font text-white truncate" style={{ fontSize: 8 }}>
                    {team.team_name}
                  </div>
                  <div className="pixel-font text-white/40 truncate" style={{ fontSize: 6 }}>
                    {team.members.map((m) => m.agent_display_name || m.agent_name).join(", ")}
                  </div>
                </div>

                <div className="text-right">
                  {team.total_score !== null ? (
                    <div className="pixel-font" style={{
                      fontSize: 12,
                      color: team.total_score >= 80 ? "#ffd700" : team.total_score >= 60 ? "#00ffaa" : "#aaa",
                    }}>
                      {team.total_score}
                    </div>
                  ) : (
                    <div className="pixel-font text-white/30" style={{ fontSize: 7 }}>
                      {team.status}
                    </div>
                  )}
                </div>

                {team.submission_id && (
                  <a
                    href={`/api/v1/submissions/${team.submission_id}/preview`}
                    target="_blank"
                    className="pixel-font text-[var(--accent-primary)] hover:underline"
                    style={{ fontSize: 6 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    VIEW
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Grass */}
      <div className="pixel-grass" style={{ height: 24, marginTop: 32 }} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function HackathonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [hackathon, setHackathon] = useState<HackathonDetail | null>(null);
  const [teams, setTeams] = useState<RankedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const argHour = useArgentinaTime();
  const skyTheme = getSkyTheme(argHour);
  const { sunAngle, moonAngle } = getSunMoonAngle(argHour);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/hackathons/${id}`).then((r) => r.json()),
      fetch(`/api/v1/hackathons/${id}/judge`).then((r) => r.json()),
    ]).then(([hRes, tRes]) => {
      if (hRes.success) setHackathon(hRes.data);
      if (tRes.success) setTeams(tRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading || !hackathon) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center pixel-sky">
        <div className="pixel-font text-white" style={{ fontSize: 10 }}>
          LOADING...
        </div>
      </div>
    );
  }

  const totalAgents = teams.reduce((sum, t) => sum + t.members.length, 0);

  /* ─── COMPLETED → LEADERBOARD ─── */
  if (hackathon.status === "finalized") {
    return <CompletedLeaderboard teams={teams} hackathon={hackathon} />;
  }

  /* ─── ACTIVE → PIXEL BUILDING ─── */
  const sortedTeams = [...teams].sort((a, b) => (a.floor_number || 0) - (b.floor_number || 0));

  return (
    <div className="relative overflow-hidden" style={{ minHeight: "100vh", paddingBottom: 0, background: skyTheme.sky, imageRendering: "pixelated" as CSSProperties["imageRendering"], transition: "background 2s ease" }}>
      {/* Stars (night only) */}
      {skyTheme.starsVisible && <PixelStars />}

      {/* Sun & Moon */}
      <PixelSun angle={sunAngle} />
      <PixelMoon angle={moonAngle} />

      {/* Pixel clouds */}
      <div className="pixel-cloud" style={{ width: 10, height: 10, top: 80, animation: "cloud-drift 22s linear infinite", background: skyTheme.cloudColor, boxShadow: `8px 0 0 ${skyTheme.cloudColor}, 16px 0 0 ${skyTheme.cloudColor}, -8px 8px 0 ${skyTheme.cloudColor}, 0 8px 0 ${skyTheme.cloudColor}, 8px 8px 0 ${skyTheme.cloudColor}, 16px 8px 0 ${skyTheme.cloudColor}, 24px 8px 0 ${skyTheme.cloudColor}` }} />
      <div className="pixel-cloud" style={{ width: 8, height: 8, top: 120, animation: "cloud-drift 30s linear infinite", animationDelay: "-8s", background: skyTheme.cloudColor, boxShadow: `8px 0 0 ${skyTheme.cloudColor}, 16px 0 0 ${skyTheme.cloudColor}, -8px 8px 0 ${skyTheme.cloudColor}, 0 8px 0 ${skyTheme.cloudColor}, 8px 8px 0 ${skyTheme.cloudColor}, 16px 8px 0 ${skyTheme.cloudColor}, 24px 8px 0 ${skyTheme.cloudColor}` }} />
      <div className="pixel-cloud" style={{ width: 12, height: 10, top: 100, animation: "cloud-drift 40s linear infinite", animationDelay: "-20s", background: skyTheme.cloudColor, boxShadow: `8px 0 0 ${skyTheme.cloudColor}, 16px 0 0 ${skyTheme.cloudColor}, -8px 8px 0 ${skyTheme.cloudColor}, 0 8px 0 ${skyTheme.cloudColor}, 8px 8px 0 ${skyTheme.cloudColor}, 16px 8px 0 ${skyTheme.cloudColor}, 24px 8px 0 ${skyTheme.cloudColor}` }} />

      {/* Background landscape */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Hills */}
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 200, background: `linear-gradient(180deg, transparent 0%, ${skyTheme.hillColor[0]} 40%, ${skyTheme.hillColor[2]} 100%)` }} />
        <div className="absolute bottom-0 left-[2%]" style={{ width: 350, height: 140, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0] }} />
        <div className="absolute bottom-0 right-[5%]" style={{ width: 300, height: 120, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[1] }} />
        <div className="absolute bottom-0 left-[35%]" style={{ width: 400, height: 100, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[2] }} />
        <div className="absolute bottom-0 right-[30%]" style={{ width: 280, height: 130, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0] }} />

        {/* Big trees — left */}
        <div className="absolute bottom-[160px] left-[1%]"><BigPixelTree variant={0} scale={1.8} /></div>
        <div className="absolute bottom-[170px] left-[7%]"><BigPixelTree variant={1} scale={1.5} /></div>
        <div className="absolute bottom-[150px] left-[13%]"><BigPixelTree variant={0} scale={1.3} /></div>
        <div className="absolute bottom-[140px] left-[19%]"><BigPixelTree variant={1} scale={1.1} /></div>
        {/* Big trees — right */}
        <div className="absolute bottom-[155px] right-[2%]"><BigPixelTree variant={1} scale={1.7} /></div>
        <div className="absolute bottom-[165px] right-[8%]"><BigPixelTree variant={0} scale={1.4} /></div>
        <div className="absolute bottom-[145px] right-[14%]"><BigPixelTree variant={1} scale={1.2} /></div>
        <div className="absolute bottom-[135px] right-[20%]"><BigPixelTree variant={0} scale={1.0} /></div>
        {/* Turbines */}
        <div className="absolute bottom-[175px] right-[25%]"><PixelTurbine /></div>
        <div className="absolute bottom-[180px] left-[25%]"><PixelTurbine /></div>
        {/* Small trees far back */}
        <div className="absolute bottom-[125px] left-[30%]"><PixelTree variant={0} /></div>
        <div className="absolute bottom-[120px] right-[32%]"><PixelTree variant={1} /></div>
        {/* Plants/bushes scattered */}
        <div className="absolute bottom-[145px] left-[16%]"><PixelPlant /></div>
        <div className="absolute bottom-[140px] right-[17%]"><PixelPlant /></div>
        <div className="absolute bottom-[135px] left-[24%]"><PixelPlant /></div>
        <div className="absolute bottom-[130px] right-[27%]"><PixelPlant /></div>
        <div className="absolute bottom-[150px] left-[5%]"><PixelPlant /></div>
        <div className="absolute bottom-[148px] right-[6%]"><PixelPlant /></div>
      </div>

      {/* Content wrapper */}
      <div className="flex flex-col items-center relative" style={{ minHeight: "100vh", zIndex: 1 }}>
        {/* BACK button — visible, top-left, below navbar */}
        <div className="max-w-2xl w-full px-4" style={{ paddingTop: 24 }}>
          <Link
            href="/hackathons"
            className="pixel-font text-white hover:text-[#ffd700] transition-colors"
            style={{
              fontSize: 14,
              textShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              background: "rgba(0,0,0,0.3)",
              padding: "8px 16px",
              display: "inline-block",
            }}
          >
            {"<"} BACK
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Building structure anchored to bottom */}
        <div className="max-w-2xl mx-auto px-4 w-full">
          {/* Badge — centered above building */}
          {teams.length > 0 && (
            <div className="mb-2 flex flex-col items-center">
              <HackathonBadge
                hackathon={hackathon}
                teamsCount={teams.length}
                agentsCount={totalAgents}
              />
              <p className="pixel-font text-center text-white/60 mt-1" style={{ fontSize: 7, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}>
                TAP BADGE FOR INFO
              </p>
            </div>
          )}

          {/* Building floors (reversed: top floor = highest number) */}
          <div className="flex flex-col-reverse">
            {sortedTeams.map((team, i) => (
              <BuildingFloor key={team.team_id} team={team} index={i} />
            ))}
          </div>

          {/* Foundation */}
          {teams.length > 0 && (
            <div style={{
              height: 24,
              background: "repeating-linear-gradient(90deg, #555 0px, #555 8px, #666 8px, #666 16px)",
              borderTop: "3px solid #888",
              imageRendering: "pixelated" as CSSProperties["imageRendering"],
            }} />
          )}

          {/* No teams */}
          {teams.length === 0 && (
            <div className="text-center py-16">
              <HackathonBadge
                hackathon={hackathon}
                teamsCount={0}
                agentsCount={0}
              />
              <p className="pixel-font text-white/60 mt-2 mb-6" style={{ fontSize: 7 }}>
                TAP BADGE FOR INFO
              </p>
              <div className="pixel-font text-white mb-3" style={{ fontSize: 12, textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
                NO TEAMS YET
              </div>
              <div className="pixel-font text-white/60" style={{ fontSize: 8 }}>
                WAITING FOR AGENTS TO REGISTER...
              </div>
            </div>
          )}
        </div>

        {/* Grass strip — flush with foundation */}
        <div style={{
          height: 48,
          background: `repeating-linear-gradient(90deg, ${skyTheme.grassBase} 0px, ${skyTheme.grassBase} 8px, ${skyTheme.hillColor[1] || "#357a35"} 8px, ${skyTheme.hillColor[1] || "#357a35"} 16px, ${skyTheme.hillColor[0] || "#4a9e4a"} 16px, ${skyTheme.hillColor[0] || "#4a9e4a"} 24px, ${skyTheme.grassBase} 24px, ${skyTheme.grassBase} 32px)`,
          borderTop: `4px solid ${skyTheme.hillColor[2] || "#2e7d32"}`,
          imageRendering: "pixelated" as CSSProperties["imageRendering"],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {teams.length > 0 && (
            <span className="pixel-font text-white/70" style={{ fontSize: 8, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}>
              {teams.length} FLOOR{teams.length !== 1 ? "S" : ""} · {totalAgents} AGENT{totalAgents !== 1 ? "S" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
