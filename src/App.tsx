import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = "http://localhost:4000";

type View = "dashboard" | "videos" | "accounts" | "queue" | "caption-studio" | "settings";

type ContentPlatform = "YouTube Shorts" | "TikTok" | "Instagram Reels" | "Facebook Reels";

const contentPlatforms: ContentPlatform[] = [
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
];

type ConnectedAccount = {
  accountId: string;
  connectedAt: string;
  channelId: string;
  channelTitle: string;
  connected: boolean;
};

type PostStatus = "Pending" | "Uploading" | "Posted" | "Failed";

type ScheduledPost = {
  id: string;
  accountId: string;
  channelTitle?: string;
  originalFilename: string;
  title: string;
  description: string;
  tags: string;
  privacyStatus: "private" | "unlisted" | "public";
  scheduledAt: string;
  status: PostStatus;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type PlannedVideo = {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
  contentPlatform: ContentPlatform;
  topic: string;
  title: string;
  description: string;
  tags: string;
  captionText: string;
  processedVideoUrl: string;
  processedFilename: string;
  scheduledAt: string;
  privacyStatus: "private" | "unlisted" | "public";
  status: "Draft" | "Scheduled";
};

const usaPostingTimes = [{ hour: 12 }, { hour: 15 }, { hour: 18 }, { hour: 21 }];

function createId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size = size / 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function cleanFilename(filename: string) {
  const cleaned =
    filename
      .replace(/\.[^/.]+$/, "")
      .replace(/^(VID|VIDEO|IMG|IMAGE|MOV|PXL|WA|WhatsApp)[_\-\s]*/i, "")
      .replace(/20\d{10,14}/g, "")
      .replace(/\b20\d{2}[_\-\s.]?\d{2}[_\-\s.]?\d{2}[_\-\s.]?\d{0,6}\b/g, "")
      .replace(/\b\d{6,}\b/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[,.;:-]\s*$/g, "")
      .trim();
  return cleaned || "Short video";
}

function titleCase(text: string) {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generatePack(topicInput: string, platform: ContentPlatform = "YouTube Shorts") {
  const cleanedTopic = cleanFilename(topicInput);
  const topic = titleCase(cleanedTopic);
  const lowerTopic = topic.toLowerCase();

  let hook = "Watch this till the end.";
  let title = topic;
  let baseHashtags = ["#Shorts", "#ViralShorts", "#ShortFormContent"];

  if (
    lowerTopic.includes("friend") ||
    lowerTopic.includes("photo") ||
    lowerTopic.includes("left out") ||
    lowerTopic.includes("one left")
  ) {
    title = "One Friend Was Left Out";
    hook = "Everyone smiled, but one person felt it.";
    baseHashtags = ["#Friendship", "#Relatable", "#POV", "#Shorts"];
  }

  if (
    lowerTopic.includes("message") ||
    lowerTopic.includes("phone") ||
    lowerTopic.includes("alone") ||
    lowerTopic.includes("sad") ||
    lowerTopic.includes("silent")
  ) {
    title = lowerTopic.includes("message")
      ? "He Typed The Message But Never Sent It"
      : topic;
    hook = "Some feelings are quiet, but heavy.";
    baseHashtags = ["#DeepQuotes", "#RealFeelings", "#LonelyVibes", "#Shorts"];
  }

  if (
    lowerTopic.includes("rat") ||
    lowerTopic.includes("chef") ||
    lowerTopic.includes("kitchen") ||
    lowerTopic.includes("cat")
  ) {
    title = topic;
    hook = "The tiny chef has one serious problem.";
    baseHashtags = ["#TinyChefRat", "#AnimatedStory", "#FunnyAnimation", "#RatChef", "#Shorts"];
  }

  if (
    lowerTopic.includes("football") ||
    lowerTopic.includes("soccer") ||
    lowerTopic.includes("goal") ||
    lowerTopic.includes("stadium") ||
    lowerTopic.includes("world cup")
  ) {
    title = topic;
    hook = "Football fans will understand this feeling.";
    baseHashtags = ["#Football", "#Soccer", "#WorldCup", "#FootballFans", "#Shorts"];
  }

  if (
    lowerTopic.includes("rust") ||
    lowerTopic.includes("clean") ||
    lowerTopic.includes("satisfying") ||
    lowerTopic.includes("asmr")
  ) {
    title = topic;
    hook = "This cleaning moment is too satisfying.";
    baseHashtags = ["#Satisfying", "#OddlySatisfying", "#ASMR", "#CleanTok", "#Shorts"];
  }

  const platformHashtags: Record<ContentPlatform, string[]> = {
    "YouTube Shorts": ["#YouTubeShorts", "#Shorts"],
    TikTok: ["#TikTok", "#FYP", "#ForYou"],
    "Instagram Reels": ["#Reels", "#InstagramReels", "#ExplorePage"],
    "Facebook Reels": ["#FacebookReels", "#ReelsVideo", "#WatchThis"],
  };

  const finalHashtags = Array.from(
    new Set([...baseHashtags, ...platformHashtags[platform]])
  ).slice(0, 9);

  const descriptionByPlatform: Record<ContentPlatform, string> = {
    "YouTube Shorts": `${hook}\n\n${topic}\n\n${finalHashtags.join(" ")}`,
    TikTok: `POV: ${topic.toLowerCase()}\n\n${hook}\n\n${finalHashtags.join(" ")}`,
    "Instagram Reels": `${hook}\n\n${topic}\n\nSave this if you felt it.\n\n${finalHashtags.join(" ")}`,
    "Facebook Reels": `${hook}\n\n${topic}\n\nWhat would you do?\n\n${finalHashtags.join(" ")}`,
  };

  return {
    title: title.slice(0, 90),
    description: descriptionByPlatform[platform],
    tags: finalHashtags.join(" "),
    captionText: hook,
  };
}

function getNextWeekSchedule(index: number) {
  const now = new Date();
  const dayOffset = index;
  const time = usaPostingTimes[index % usaPostingTimes.length];
  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  date.setHours(time.hour, 0, 0, 0);
  if (date.getTime() <= now.getTime()) {
    date.setDate(date.getDate() + 1);
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  if (!value) return "No time";
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayLabel(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getDayName(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long" });
}

async function processedUrlToFile(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load processed captioned video.");
  }
  const blob = await response.blob();
  return new File([blob], filename || "captioned-video.mp4", {
    type: blob.type || "video/mp4",
  });
}

function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

// ==================== ICONS ====================
function Icon({ name, size = 20, color = "currentColor" }: { name: string; size?: number; color?: string }) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
    viewBox: "0 0 24 24",
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...s}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "video":
      return (
        <svg {...s}>
          <rect x="2" y="2" width="20" height="20" rx="2.18" />
          <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
        </svg>
      );
    case "users":
      return (
        <svg {...s}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "list":
      return (
        <svg {...s}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    case "type":
      return (
        <svg {...s}>
          <path d="M4 7V4h16v3" />
          <path d="M9 20h6" />
          <path d="M12 4v16" />
        </svg>
      );
    case "settings":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "upload":
      return (
        <svg {...s}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...s}>
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      );
    case "copy":
      return (
        <svg {...s}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "check":
      return (
        <svg {...s}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "x":
      return (
        <svg {...s}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case "plus":
      return (
        <svg {...s}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...s}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "clock":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "play":
      return (
        <svg {...s}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...s}>
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          <path d="M5 3v4" />
          <path d="M19 17v4" />
          <path d="M3 5h4" />
          <path d="M17 19h4" />
        </svg>
      );
    case "alert":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "menu":
      return (
        <svg {...s}>
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...s}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case "image":
      return (
        <svg {...s}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "log-out":
      return (
        <svg {...s}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.89 2.89 2.89 0 0 1 2.88-2.89c.3 0 .59.05.88.13V9.4a6.37 6.37 0 0 0-.88-.06A6.34 6.34 0 0 0 2.89 15.68a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.83a8.16 8.16 0 0 0 4.92 1.66V7.36a4.85 4.85 0 0 1-1-.07z" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    case "film":
      return (
        <svg {...s}>
          <rect x="2" y="2" width="20" height="20" rx="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      );
    case "info":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "external-link":
      return (
        <svg {...s}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      );
    case "send":
      return (
        <svg {...s}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

// ==================== STYLES ====================
const S: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", minHeight: "100vh", background: "#0a0a0f", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", color: "#f1f1f4" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 40, display: "none" },
  sidebar: { width: 260, background: "#0f0f1a", borderRight: "1px solid #1e1e2d", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 50, left: 0, top: 0 },
  sidebarHeader: { padding: "24px 20px", borderBottom: "1px solid #1e1e2d" },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  nav: { flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" },
  navItem: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", color: "#6b6b7b", fontSize: 14, fontWeight: 500, transition: "all 0.2s", border: "none", background: "transparent", width: "100%", textAlign: "left" },
  navItemActive: { background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))", color: "#f1f1f4", border: "1px solid rgba(139,92,246,0.2)" },
  sidebarFooter: { padding: "16px 12px", borderTop: "1px solid #1e1e2d" },
  main: { flex: 1, padding: "32px", overflowY: "auto", minHeight: "100vh", marginLeft: 260 },
  topBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 },
  pageTitle: { fontSize: 28, fontWeight: 700, color: "#f1f1f4", letterSpacing: "-0.5px", marginBottom: 6, lineHeight: 1.2 },
  pageSubtitle: { fontSize: 14, color: "#6b6b7b", lineHeight: 1.5 },
  platformTabs: { display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" },
  platformTab: { padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "#6b6b7b", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap" },
  platformTabActive: { background: "rgba(255,255,255,0.06)", color: "#f1f1f4" },
  card: { background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 16, padding: 24 },
  cardHover: { transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)" },
  statCard: { display: "flex", flexDirection: "column", gap: 12 },
  statIcon: { width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 14, color: "#6b6b7b", fontWeight: 500 },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: "#f1f1f4" },
  uploadZone: { border: "2px dashed rgba(139,92,246,0.3)", borderRadius: 16, padding: "48px 24px", textAlign: "center", background: "rgba(139,92,246,0.03)", cursor: "pointer", transition: "all 0.2s", marginBottom: 32 },
  uploadZoneHover: { borderColor: "rgba(139,92,246,0.6)", background: "rgba(139,92,246,0.06)" },
  videoCard: { background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" },
  videoThumb: { height: 220, background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  videoInfo: { padding: 20, display: "flex", flexDirection: "column", gap: 16, flex: 1 },
  badge: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  accountCard: { display: "flex", alignItems: "center", gap: 16, padding: 20, background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 16 },
  accountAvatar: { width: 48, height: 48, borderRadius: "50%", background: "#1e1e2d", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#f1f1f4", flexShrink: 0, overflow: "hidden" },
  queueItem: { display: "flex", alignItems: "center", gap: 16, padding: 20, background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 16, borderLeft: "3px solid transparent", flexWrap: "wrap" },
  timelineDay: { background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 16, padding: 16, minHeight: 180 },
  timelineCard: { padding: 12, background: "#0a0a0f", borderRadius: 10, border: "1px solid #1e1e2d", marginBottom: 8, cursor: "pointer" },
  textarea: { width: "100%", minHeight: 120, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, color: "#f1f1f4", fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none" },
  messageBanner: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 12, marginBottom: 24, border: "1px solid", fontSize: 14, fontWeight: 500 },
  input: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#f1f1f4", borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontSize: 14, outline: "none", transition: "all 0.2s", width: "100%" },
  label: { fontSize: 12, color: "#6b6b7b", fontWeight: 500, display: "block", marginBottom: 6 },
  btnPrimary: { background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  btnSecondary: { background: "rgba(255,255,255,0.05)", color: "#e2e2ea", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  btnDanger: { background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  btnSuccess: { background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  btnGhost: { background: "transparent", color: "#6b6b7b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  emptyState: { textAlign: "center", padding: 60, color: "#6b6b7b" },
  grid7: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 },
  grid1: { display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  flexRow: { display: "flex", alignItems: "center", gap: 8 },
  flexWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  flexBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  flexCol: { display: "flex", flexDirection: "column", gap: 8 },
  textMuted: { color: "#6b6b7b", fontSize: 13 },
  textSmall: { fontSize: 12, color: "#6b6b7b" },
  divider: { height: 1, background: "#1e1e2d", margin: "16px 0" },
  scrollX: { overflowX: "auto" },
  relative: { position: "relative" },
  absolute: { position: "absolute" },
};

const GLOBAL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #f1f1f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #0a0a0f; }
  ::-webkit-scrollbar-thumb { background: #2a2a3d; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a4d; }
  .sidebar { transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); }
  @media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main { margin-left: 0 !important; padding: 20px !important; }
    .overlay { display: block !important; }
    .grid7 { grid-template-columns: repeat(2, 1fr) !important; }
    .grid4 { grid-template-columns: repeat(2, 1fr) !important; }
    .grid3 { grid-template-columns: 1fr !important; }
    .grid2 { grid-template-columns: 1fr !important; }
    .topBar { flex-direction: column; align-items: flex-start !important; }
  }
  @media (max-width: 480px) {
    .grid7 { grid-template-columns: 1fr !important; }
    .grid4 { grid-template-columns: 1fr !important; }
    .platformTabs { width: 100%; overflow-x: auto; }
  }
  @media (min-width: 769px) { .overlay { display: none !important; } }
  .card-hover { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
  .card-hover:hover { transform: translateY(-2px); border-color: rgba(139,92,246,0.25); box-shadow: 0 12px 40px rgba(139,92,246,0.08); }
  .btn { transition: all 0.2s ease; cursor: pointer; border: none; outline: none; font-family: inherit; }
  .btn:active { transform: scale(0.96); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .input:focus { border-color: rgba(139,92,246,0.5); box-shadow: 0 0 0 3px rgba(139,92,246,0.1); }
  .input::placeholder { color: #4a4a5a; }
  select.input { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b7b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; }
  .fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .status-dot.connected { background: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.5); }
  .status-dot.error { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
  .status-dot.pending { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
  .status-dot.disconnected { background: #6b6b7b; }
  .platform-tab { transition: all 0.2s ease; cursor: pointer; position: relative; }
`;

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "videos", label: "Videos", icon: "video" },
  { id: "accounts", label: "Accounts", icon: "users" },
  { id: "queue", label: "Queue", icon: "list" },
  { id: "caption-studio", label: "Caption Studio", icon: "type" },
  { id: "settings", label: "Settings", icon: "settings" },
];

const PLATFORM_META: Record<ContentPlatform, { color: string; icon: string }> = {
  "YouTube Shorts": { color: "#ff0000", icon: "youtube" },
  TikTok: { color: "#00f2ea", icon: "tiktok" },
  "Instagram Reels": { color: "#e1306c", icon: "instagram" },
  "Facebook Reels": { color: "#1877f2", icon: "facebook" },
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ==================== APP ====================
export default function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform>("YouTube Shorts");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Original state
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [plannedVideos, setPlannedVideos] = useState<PlannedVideo[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [processingVideoId, setProcessingVideoId] = useState("");
  const [message, setMessage] = useState("");

  // Caption studio state
  const [captionStudioVideoId, setCaptionStudioVideoId] = useState("");
  const [captionStudioText, setCaptionStudioText] = useState("");
  const [captionStudioPreview, setCaptionStudioPreview] = useState("");

  // Settings state (local only — backend has no settings endpoint)
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [notifyOnUpload, setNotifyOnUpload] = useState(true);
  const [captionStyle, setCaptionStyle] = useState("modern");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 769);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    loadAccounts();
    loadPosts();
    const interval = window.setInterval(() => loadPosts(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    return {
      totalVideos: plannedVideos.length + scheduledPosts.length,
      scheduled: scheduledPosts.filter((p) => p.status === "Pending").length,
      posted: scheduledPosts.filter((p) => p.status === "Posted").length,
      failed: scheduledPosts.filter((p) => p.status === "Failed").length,
    };
  }, [plannedVideos.length, scheduledPosts]);

  const calendarGroups = useMemo(() => {
    return [
      ...plannedVideos.map((video) => ({
        id: video.id,
        title: video.title,
        scheduledAt: video.scheduledAt,
        status: video.status,
        source: "Draft" as const,
      })),
      ...scheduledPosts.map((post) => ({
        id: post.id,
        title: post.title,
        scheduledAt: post.scheduledAt,
        status: post.status,
        source: "Backend" as const,
      })),
    ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [plannedVideos, scheduledPosts]);

  const selectedAccount = connectedAccounts.find((a) => a.accountId === selectedAccountId);

  // ==================== API ====================
  async function loadAccounts() {
    try {
      setIsLoadingAccounts(true);
      const response = await fetch(`${API_BASE_URL}/api/youtube/status`);
      const data = await response.json();
      const accounts = Array.isArray(data.connectedAccounts) ? data.connectedAccounts : [];
      setConnectedAccounts(accounts);
      if (accounts.length && !selectedAccountId) {
        setSelectedAccountId(accounts[0].accountId);
      }
    } catch {
      setMessage("Backend is not reachable. Make sure npm run server is running.");
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function loadPosts() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts`);
      const data = await response.json();
      setScheduledPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      setMessage("Could not load scheduled posts.");
    }
  }

  function connectYouTube() {
    const accountId = newAccountId.trim();
    if (!accountId) {
      alert("Enter an account ID first. Example: main-youtube");
      return;
    }
    window.open(`${API_BASE_URL}/api/youtube/connect/${encodeURIComponent(accountId)}`, "_blank");
  }

  function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("video/"));
    if (!files.length) return;

    const defaultPlatform = selectedPlatform;

    const newVideos = files.map((file, index) => {
      const topic = cleanFilename(file.name);
      const pack = generatePack(topic, defaultPlatform);
      return {
        id: createId(),
        file,
        previewUrl: URL.createObjectURL(file),
        filename: file.name,
        contentPlatform: defaultPlatform,
        topic,
        title: pack.title,
        description: pack.description,
        tags: pack.tags,
        captionText: pack.captionText,
        processedVideoUrl: "",
        processedFilename: "",
        scheduledAt: getNextWeekSchedule(plannedVideos.length + index),
        privacyStatus: "public" as const,
        status: "Draft" as const,
      };
    });

    setPlannedVideos((current) => [...current, ...newVideos]);
    event.currentTarget.value = "";
  }

  function regenerateAll() {
    setPlannedVideos((current) =>
      current.map((video, index) => {
        const pack = generatePack(video.topic, video.contentPlatform);
        return {
          ...video,
          ...pack,
          processedVideoUrl: "",
          processedFilename: "",
          scheduledAt: video.scheduledAt || getNextWeekSchedule(index),
        };
      })
    );
  }

  function updateVideo(id: string, updates: Partial<PlannedVideo>) {
    setPlannedVideos((current) => current.map((video) => (video.id === id ? { ...video, ...updates } : video)));
  }

  function removeDraft(id: string) {
    const video = plannedVideos.find((item) => item.id === id);
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
    setPlannedVideos((current) => current.filter((item) => item.id !== id));
  }

  async function processCaptionedVideo(video: PlannedVideo) {
    if (!video.captionText.trim()) {
      alert("Add caption text first.");
      return;
    }
    try {
      setProcessingVideoId(video.id);
      setMessage("Processing captioned video with FFmpeg...");

      const formData = new FormData();
      formData.append("captionText", video.captionText.trim());
      formData.append("video", video.file);

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Video processing failed.");
      }

      updateVideo(video.id, {
        processedVideoUrl: data.processed.fullUrl,
        processedFilename: data.processed.filename,
      });
      setMessage("Captioned video is ready. YouTube will use the captioned version.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Processing failed.");
    } finally {
      setProcessingVideoId("");
    }
  }

  async function getUploadFile(video: PlannedVideo) {
    if (video.processedVideoUrl) {
      return processedUrlToFile(video.processedVideoUrl, video.processedFilename);
    }
    return video.file;
  }

  async function scheduleOne(video: PlannedVideo) {
    if (video.contentPlatform !== "YouTube Shorts") {
      throw new Error(
        "Auto-posting currently supports YouTube Shorts only. Use TikTok/Instagram/Facebook packs for manual posting for now."
      );
    }
    if (!selectedAccountId) {
      throw new Error("Connect/select a YouTube account first.");
    }

    const uploadFile = await getUploadFile(video);

    const formData = new FormData();
    formData.append("accountId", selectedAccountId);
    formData.append("title", video.title);
    formData.append("description", video.description);
    formData.append("tags", video.tags);
    formData.append("privacyStatus", video.privacyStatus);
    formData.append("scheduledAt", new Date(video.scheduledAt).toISOString());
    formData.append("video", uploadFile);

    const response = await fetch(`${API_BASE_URL}/api/posts`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Schedule failed");
    }
    return data;
  }

  async function scheduleAll() {
    if (!plannedVideos.length) {
      alert("Upload videos first.");
      return;
    }
    if (!selectedAccountId) {
      alert("Connect/select a YouTube account first.");
      return;
    }
    const unsupportedVideos = plannedVideos.filter((video) => video.contentPlatform !== "YouTube Shorts");
    if (unsupportedVideos.length) {
      alert(
        "Schedule All only supports YouTube Shorts for now. Change TikTok/Instagram/Facebook drafts back to YouTube Shorts or post them manually."
      );
      return;
    }
    try {
      setIsScheduling(true);
      setMessage("Scheduling videos to backend...");
      for (const video of plannedVideos) {
        await scheduleOne(video);
      }
      plannedVideos.forEach((video) => URL.revokeObjectURL(video.previewUrl));
      setPlannedVideos([]);
      await loadPosts();
      setMessage("All videos scheduled. Backend will auto-post when time reaches.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scheduling failed.");
    } finally {
      setIsScheduling(false);
    }
  }

  async function uploadNow(postId: string) {
    try {
      setMessage("Uploading now...");
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/upload-now`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Upload now failed");
      }
      await loadPosts();
      setMessage("Upload finished.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload now failed.");
    }
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this pending scheduled post?");
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }
      await loadPosts();
      setMessage("Post deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  // ==================== RENDER HELPERS ====================
  const PlatformSelector = () => (
    <div className="platformTabs" style={S.platformTabs}>
      {contentPlatforms.map((p) => (
        <button
          key={p}
          className="platform-tab"
          style={{ ...S.platformTab, ...(selectedPlatform === p ? S.platformTabActive : {}) }}
          onClick={() => setSelectedPlatform(p)}
          type="button"
        >
          <Icon name={PLATFORM_META[p].icon} size={14} color={selectedPlatform === p ? "#f1f1f4" : "#6b6b7b"} />
          <span>{p}</span>
        </button>
      ))}
    </div>
  );

  const StatCard = ({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) => (
    <div className="card-hover" style={{ ...S.card, ...S.statCard }}>
      <div style={{ ...S.flexBetween, alignItems: "flex-start" }}>
        <div style={{ ...S.statIcon, background: `${color}15`, color }}>
          <Icon name={icon} size={22} color={color} />
        </div>
        <span style={{ fontSize: 28, fontWeight: 700, color: "#f1f1f4" }}>{value.toLocaleString()}</span>
      </div>
      <div style={S.statLabel}>{title}</div>
    </div>
  );

  const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
    <div style={S.sectionHeader}>
      <div>
        <h2 style={S.sectionTitle}>{title}</h2>
        {subtitle && <p style={{ ...S.textMuted, marginTop: 4 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const renderMessage = () => {
    if (!message) return null;
    const isError = message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") || message.toLowerCase().includes("not reachable") || message.toLowerCase().includes("could not");
    return (
      <div style={{ ...S.messageBanner, background: isError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", borderColor: isError ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)", color: isError ? "#ef4444" : "#10b981" }}>
        <Icon name={isError ? "alert" : "check"} size={16} />
        <span style={{ flex: 1 }}>{message}</span>
        <button className="btn" style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }} onClick={() => setMessage("")} type="button">
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  };

  // ==================== VIEWS ====================
  const renderDashboard = () => (
    <div className="fade-in">
      <div className="grid4" style={{ ...S.grid4, marginBottom: 32 }}>
        <StatCard title="Total Videos" value={stats.totalVideos} icon="film" color="#8b5cf6" />
        <StatCard title="Scheduled" value={stats.scheduled} icon="calendar" color="#3b82f6" />
        <StatCard title="Posted" value={stats.posted} icon="check" color="#10b981" />
        <StatCard title="Failed" value={stats.failed} icon="alert" color="#ef4444" />
      </div>

      <SectionHeader title="Weekly Timeline" subtitle="Your content schedule at a glance" />
      <div className="grid7" style={S.grid7}>
        {DAYS.map((dayName) => {
          const dayItems = calendarGroups.filter((item) => getDayName(item.scheduledAt) === dayName);
          return (
            <div key={dayName} className="card-hover" style={S.timelineDay}>
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #1e1e2d" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{dayName}</div>
                <div style={{ fontSize: 12, color: "#6b6b7b", marginTop: 2 }}>
                  {dayItems.length > 0 ? `${dayItems.length} upload${dayItems.length > 1 ? "s" : ""}` : "No uploads"}
                </div>
              </div>
              <div>
                {dayItems.slice(0, 4).map((item) => (
                  <div key={`${item.source}-${item.id}`} className="card-hover" style={S.timelineCard}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#6b6b7b" }}>
                      <span style={{ color: item.source === "Draft" ? "#8b5cf6" : "#10b981" }}>●</span>
                      {formatDateTime(item.scheduledAt)}
                    </div>
                  </div>
                ))}
                {dayItems.length > 4 && (
                  <div style={{ fontSize: 11, color: "#6b6b7b", textAlign: "center", padding: 4 }}>+{dayItems.length - 4} more</div>
                )}
                {dayItems.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#4a4a5a", fontSize: 12 }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {plannedVideos.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionHeader title="Quick Actions" />
          <div style={{ ...S.flexWrap, gap: 12 }}>
            <button className="btn btn-primary" style={S.btnPrimary} onClick={regenerateAll} type="button">
              <Icon name="sparkles" size={16} />
              Regenerate All Packs
            </button>
            <button className="btn btn-success" style={S.btnSuccess} onClick={scheduleAll} disabled={isScheduling} type="button">
              <Icon name="send" size={16} />
              {isScheduling ? "Scheduling..." : "Schedule All"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderVideos = () => (
    <div className="fade-in">
      <div
        className="card-hover"
        style={{ ...S.uploadZone, ...(isDragging ? S.uploadZoneHover : {}) }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length) {
            const syntheticEvent = { currentTarget: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>;
            handleVideoUpload(syntheticEvent);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: "none" }} onChange={handleVideoUpload} />
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Icon name="upload" size={28} color="#8b5cf6" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Upload Week Videos</h3>
        <p style={{ fontSize: 14, color: "#6b6b7b", maxWidth: 400, margin: "0 auto" }}>
          Drag and drop video files here, or click to browse. Supports MP4, MOV, WEBM.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
          <span style={{ ...S.badge, background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>{selectedPlatform}</span>
        </div>
      </div>

      <SectionHeader
        title={`Draft Videos (${plannedVideos.length})`}
        subtitle="Edit, caption, process, then schedule."
        action={
          plannedVideos.length > 0 && (
            <div style={{ ...S.flexWrap, gap: 8 }}>
              <button className="btn btn-secondary" style={S.btnSecondary} onClick={regenerateAll} type="button">
                <Icon name="sparkles" size={14} />
                Regenerate All
              </button>
              <button className="btn btn-success" style={S.btnSuccess} onClick={scheduleAll} disabled={isScheduling} type="button">
                <Icon name="send" size={14} />
                {isScheduling ? "Scheduling..." : "Schedule All"}
              </button>
            </div>
          )
        }
      />

      {plannedVideos.length === 0 ? (
        <div className="card-hover" style={{ ...S.card, ...S.emptyState }}>
          <Icon name="film" size={48} color="#2a2a3d" />
          <p style={{ marginTop: 16 }}>No draft videos yet</p>
          <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>Upload your week videos. The app will generate packs automatically.</p>
        </div>
      ) : (
        <div className="grid2" style={S.grid2}>
          {plannedVideos.map((video, index) => (
            <div key={video.id} className="card-hover" style={S.videoCard}>
              <div style={S.videoThumb}>
                <video
                  src={video.processedVideoUrl || video.previewUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  controls
                />
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <span style={{ ...S.badge, background: video.processedVideoUrl ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: video.processedVideoUrl ? "#10b981" : "#f59e0b" }}>
                    {video.processedVideoUrl ? "Captioned" : "Draft"}
                  </span>
                </div>
                <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 8 }}>
                  <span style={{ ...S.badge, background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)" }}>
                    {formatFileSize(video.file.size)}
                  </span>
                </div>
              </div>

              <div style={S.videoInfo}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, wordBreak: "break-all" }}>{video.filename}</div>
                  <div style={{ fontSize: 12, color: "#6b6b7b" }}>Draft #{index + 1}</div>
                </div>

                <div style={{ ...S.flexCol, gap: 12 }}>
                  <label style={S.label}>
                    Content Platform
                    <select
                      className="input"
                      style={S.input}
                      value={video.contentPlatform}
                      onChange={(e) => {
                        const contentPlatform = e.target.value as ContentPlatform;
                        const pack = generatePack(video.topic, contentPlatform);
                        updateVideo(video.id, {
                          contentPlatform,
                          ...pack,
                          processedVideoUrl: "",
                          processedFilename: "",
                        });
                      }}
                    >
                      {contentPlatforms.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={S.label}>
                    Topic
                    <input
                      className="input"
                      style={S.input}
                      value={video.topic}
                      onChange={(e) => {
                        const topic = e.target.value;
                        const pack = generatePack(topic, video.contentPlatform);
                        updateVideo(video.id, { topic, ...pack, processedVideoUrl: "", processedFilename: "" });
                      }}
                    />
                  </label>

                  <label style={S.label}>
                    Schedule Time
                    <input
                      className="input"
                      style={S.input}
                      type="datetime-local"
                      value={video.scheduledAt}
                      onChange={(e) => updateVideo(video.id, { scheduledAt: e.target.value })}
                    />
                  </label>

                  <label style={S.label}>
                    Privacy
                    <select
                      className="input"
                      style={S.input}
                      value={video.privacyStatus}
                      onChange={(e) => updateVideo(video.id, { privacyStatus: e.target.value as "private" | "unlisted" | "public" })}
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </label>

                  <div style={S.divider} />

                  <div style={{ ...S.flexBetween, alignItems: "center" }}>
                    <label style={S.label} htmlFor={`title-${video.id}`}>Title</label>
                    <button className="btn btn-secondary" style={{ ...S.btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => copyToClipboard(video.title)} type="button">
                      <Icon name="copy" size={12} /> Copy
                    </button>
                  </div>
                  <input id={`title-${video.id}`} className="input" style={S.input} value={video.title} onChange={(e) => updateVideo(video.id, { title: e.target.value })} />

                  <div style={{ ...S.flexBetween, alignItems: "center" }}>
                    <label style={S.label} htmlFor={`desc-${video.id}`}>Description</label>
                    <button className="btn btn-secondary" style={{ ...S.btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => copyToClipboard(video.description)} type="button">
                      <Icon name="copy" size={12} /> Copy
                    </button>
                  </div>
                  <textarea id={`desc-${video.id}`} className="input" style={{ ...S.textarea, minHeight: 80 }} value={video.description} onChange={(e) => updateVideo(video.id, { description: e.target.value })} />

                  <div style={{ ...S.flexBetween, alignItems: "center" }}>
                    <label style={S.label} htmlFor={`tags-${video.id}`}>Hashtags</label>
                    <button className="btn btn-secondary" style={{ ...S.btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => copyToClipboard(video.tags)} type="button">
                      <Icon name="copy" size={12} /> Copy
                    </button>
                  </div>
                  <input id={`tags-${video.id}`} className="input" style={S.input} value={video.tags} onChange={(e) => updateVideo(video.id, { tags: e.target.value })} />

                  <label style={S.label} htmlFor={`cap-${video.id}`}>Text To Burn On Video</label>
                  <input
                    id={`cap-${video.id}`}
                    className="input"
                    style={S.input}
                    value={video.captionText}
                    onChange={(e) => updateVideo(video.id, { captionText: e.target.value, processedVideoUrl: "", processedFilename: "" })}
                    placeholder="Example: Some feelings are quiet but heavy"
                  />

                  {video.processedVideoUrl && (
                    <p style={{ color: "#b9ffdc", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                      Captioned video ready. YouTube upload will use the processed video.
                    </p>
                  )}

                  {video.contentPlatform !== "YouTube Shorts" && (
                    <p style={{ color: "#ffcf8a", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                      {video.contentPlatform} pack is for manual posting for now. Real auto-post currently supports YouTube Shorts only.
                    </p>
                  )}

                  <div style={{ ...S.flexWrap, gap: 8, marginTop: 4 }}>
                    <button className="btn btn-secondary" style={S.btnSecondary} onClick={() => { const pack = generatePack(video.topic, video.contentPlatform); updateVideo(video.id, { ...pack, processedVideoUrl: "", processedFilename: "" }); }} type="button">
                      <Icon name="refresh" size={14} />
                      Regenerate
                    </button>
                    <button className="btn btn-primary" style={S.btnPrimary} onClick={() => processCaptionedVideo(video)} disabled={processingVideoId === video.id} type="button">
                      <Icon name="sparkles" size={14} />
                      {processingVideoId === video.id ? "Processing..." : "Process Captioned Video"}
                    </button>
                    {video.processedVideoUrl && (
                      <a href={video.processedVideoUrl} target="_blank" rel="noreferrer" style={{ ...S.btnSecondary, textDecoration: "none" }}>
                        <Icon name="external-link" size={14} />
                        Open Processed
                      </a>
                    )}
                    <button className="btn btn-success" style={S.btnSuccess} onClick={async () => { try { setMessage("Scheduling video..."); await scheduleOne(video); removeDraft(video.id); await loadPosts(); setMessage("Video scheduled."); } catch (error) { setMessage(error instanceof Error ? error.message : "Schedule failed."); } }} type="button">
                      <Icon name="calendar" size={14} />
                      Schedule
                    </button>
                    <button className="btn btn-danger" style={S.btnDanger} onClick={() => removeDraft(video.id)} type="button">
                      <Icon name="trash" size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAccounts = () => (
    <div className="fade-in">
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ ...S.flexBetween, marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Connected Accounts</h2>
            <p style={{ fontSize: 13, color: "#6b6b7b" }}>
              {selectedPlatform === "YouTube Shorts"
                ? "Manage your YouTube channel connections."
                : `Auto-post currently supports YouTube Shorts only. ${selectedPlatform} connections are for future use.`}
            </p>
          </div>
          <div style={{ ...S.flexWrap, gap: 8 }}>
            <button className="btn btn-secondary" style={S.btnSecondary} onClick={loadAccounts} type="button">
              <Icon name="refresh" size={16} />
              Refresh
            </button>
          </div>
        </div>

        {selectedPlatform === "YouTube Shorts" ? (
          <>
            <div style={{ ...S.flexWrap, gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={S.label}>Account ID</label>
                <input className="input" style={S.input} value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)} placeholder="example: my-youtube-channel" />
              </div>
              <button className="btn btn-primary" style={S.btnPrimary} onClick={connectYouTube} type="button">
                <Icon name="plus" size={16} />
                Add Account
              </button>
            </div>

            {connectedAccounts.length === 0 ? (
              <div style={{ ...S.emptyState, padding: 40 }}>
                <Icon name="users" size={48} color="#2a2a3d" />
                <p style={{ marginTop: 16 }}>No accounts connected for this platform</p>
                <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 16 }} onClick={connectYouTube} type="button">
                  Connect Your First Account
                </button>
              </div>
            ) : (
              <div className="grid3" style={S.grid3}>
                {connectedAccounts.map((account) => (
                  <div key={account.accountId} className="card-hover" style={S.accountCard}>
                    <div style={S.accountAvatar}>
                      {account.channelTitle ? account.channelTitle.charAt(0).toUpperCase() : "Y"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {account.channelTitle || account.accountId}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span className={`status-dot ${account.connected ? "connected" : "disconnected"}`} />
                        <span style={{ color: account.connected ? "#10b981" : "#6b6b7b", textTransform: "capitalize" }}>
                          {account.connected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#4a4a5a", marginTop: 4 }}>{account.accountId}</div>
                    </div>
                    <button
                      className="btn btn-danger"
                      style={{ ...S.btnDanger, padding: 8 }}
                      onClick={() => setMessage("Account removal is not supported by the current backend.")}
                      type="button"
                      title="Delete Account"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <label style={S.label}>Select Channel for Uploading</label>
              <select className="input" style={S.input} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                {!connectedAccounts.length && <option value="">No channel connected</option>}
                {connectedAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.channelTitle || account.accountId}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 12, padding: 12, background: "#0a0a0f", borderRadius: 10, border: "1px solid #1e1e2d" }}>
                {isLoadingAccounts ? (
                  <span style={{ fontSize: 13, color: "#6b6b7b" }}>Checking connection...</span>
                ) : selectedAccount ? (
                  <div style={{ ...S.flexRow, gap: 12 }}>
                    <span className="status-dot connected" />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {selectedAccount.channelTitle || selectedAccount.accountId} — Ready to upload
                    </span>
                  </div>
                ) : (
                  <div style={{ ...S.flexRow, gap: 12 }}>
                    <span className="status-dot disconnected" />
                    <span style={{ fontSize: 13, color: "#6b6b7b" }}>No channel selected. Connect YouTube first.</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ ...S.emptyState, padding: 40 }}>
            <Icon name="info" size={48} color="#2a2a3d" />
            <p style={{ marginTop: 16 }}>{selectedPlatform} auto-posting is coming soon</p>
            <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>
              Switch to YouTube Shorts to connect an account.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderQueue = () => (
    <div className="fade-in">
      <SectionHeader
        title="Publishing Queue"
        subtitle="Backend schedule status."
        action={
          <button className="btn btn-secondary" style={S.btnSecondary} onClick={loadPosts} type="button">
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        }
      />

      {scheduledPosts.length === 0 ? (
        <div className="card-hover" style={{ ...S.card, ...S.emptyState }}>
          <Icon name="list" size={48} color="#2a2a3d" />
          <p style={{ marginTop: 16 }}>No scheduled backend posts yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scheduledPosts.map((post) => (
            <div
              key={post.id}
              className="card-hover"
              style={{
                ...S.queueItem,
                borderLeftColor:
                  post.status === "Posted" ? "#10b981" : post.status === "Failed" ? "#ef4444" : "#f59e0b",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {post.title}
                </div>
                <div style={{ ...S.flexWrap, gap: 12, fontSize: 12, color: "#6b6b7b" }}>
                  <span style={{ ...S.flexRow, gap: 4 }}>
                    <Icon name="youtube" size={12} color="#ff0000" />
                    YouTube Shorts
                  </span>
                  <span style={{ ...S.flexRow, gap: 4 }}>
                    <Icon name="users" size={12} />
                    {post.channelTitle || post.accountId}
                  </span>
                  <span style={{ ...S.flexRow, gap: 4 }}>
                    <Icon name="clock" size={12} />
                    {formatDateTime(post.scheduledAt)}
                  </span>
                  <span style={{ ...S.flexRow, gap: 4 }}>
                    <span
                      className={`status-dot ${post.status === "Posted" ? "connected" : post.status === "Failed" ? "error" : "pending"}`}
                    />
                    {post.status}
                  </span>
                  <span style={{ ...S.badge, background: "rgba(255,255,255,0.05)", color: "#6b6b7b" }}>{post.privacyStatus}</span>
                </div>
                {post.error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{post.error}</p>}
                {post.youtubeUrl && (
                  <a href={post.youtubeUrl} target="_blank" rel="noreferrer" style={{ color: "#8b5cf6", fontSize: 12, marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="external-link" size={12} />
                    Open on YouTube
                  </a>
                )}
              </div>
              <div style={{ ...S.flexWrap, gap: 8 }}>
                {post.status !== "Posted" && (
                  <button className="btn btn-success" style={S.btnSuccess} onClick={() => uploadNow(post.id)} type="button">
                    <Icon name="upload" size={14} />
                    Upload Now
                  </button>
                )}
                {post.status !== "Posted" && (
                  <button className="btn btn-danger" style={S.btnDanger} onClick={() => deletePost(post.id)} type="button">
                    <Icon name="trash" size={14} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCaptionStudio = () => {
    const selectedVideo = plannedVideos.find((v) => v.id === captionStudioVideoId);

    async function handleProcessStudio() {
      if (!selectedVideo) {
        setMessage("Select a video first.");
        return;
      }
      if (!captionStudioText.trim()) {
        setMessage("Enter caption text first.");
        return;
      }
      try {
        setProcessingVideoId(selectedVideo.id);
        setMessage("Processing captioned video with FFmpeg...");

        const formData = new FormData();
        formData.append("captionText", captionStudioText.trim());
        formData.append("video", selectedVideo.file);

        const response = await fetch(`${API_BASE_URL}/api/media/process`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Video processing failed.");
        }

        updateVideo(selectedVideo.id, {
          processedVideoUrl: data.processed.fullUrl,
          processedFilename: data.processed.filename,
        });
        setCaptionStudioPreview(data.processed.fullUrl);
        setMessage("Captioned video is ready.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Processing failed.");
      } finally {
        setProcessingVideoId("");
      }
    }

    return (
      <div className="fade-in">
        <div className="grid2" style={{ ...S.grid2, alignItems: "start" }}>
          <div style={S.card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Caption Studio</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Select Video</label>
              <select className="input" style={S.input} value={captionStudioVideoId} onChange={(e) => setCaptionStudioVideoId(e.target.value)}>
                <option value="">Choose a video...</option>
                {plannedVideos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.filename}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Caption Text</label>
              <textarea className="input" style={{ ...S.textarea, minHeight: 160 }} value={captionStudioText} onChange={(e) => setCaptionStudioText(e.target.value)} placeholder="Enter caption text to burn into the video..." />
            </div>

            <button className="btn btn-primary" style={{ ...S.btnPrimary, width: "100%", justifyContent: "center", padding: 12 }} onClick={handleProcessStudio} disabled={!selectedVideo || processingVideoId === selectedVideo?.id} type="button">
              <Icon name="sparkles" size={18} />
              {processingVideoId === selectedVideo?.id ? "Processing..." : "Process Video"}
            </button>
          </div>

          <div style={S.card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Preview</h2>
            {captionStudioPreview || selectedVideo?.processedVideoUrl ? (
              <video
                src={captionStudioPreview || selectedVideo?.processedVideoUrl}
                controls
                style={{ width: "100%", borderRadius: 12, background: "#0a0a0f" }}
              />
            ) : (
              <div style={{ height: 280, background: "#0a0a0f", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#6b6b7b" }}>
                <Icon name="play" size={40} color="#2a2a3d" />
                <span style={{ fontSize: 14 }}>Processed video will appear here</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="fade-in" style={{ maxWidth: 600 }}>
      <div style={S.card}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Planner Settings</h2>

        <div style={{ ...S.flexCol, gap: 20 }}>
          <div>
            <label style={S.label}>Default Platform</label>
            <select className="input" style={S.input} value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value as ContentPlatform)}>
              {contentPlatforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...S.flexBetween, padding: "16px 0", borderTop: "1px solid #1e1e2d" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Auto Schedule</div>
              <div style={S.textMuted}>Automatically schedule videos after upload</div>
            </div>
            <button
              onClick={() => setAutoSchedule(!autoSchedule)}
              type="button"
              style={{ width: 48, height: 28, borderRadius: 14, background: autoSchedule ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "#2a2a3d", position: "relative", cursor: "pointer", border: "none", transition: "all 0.2s" }}
            >
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: autoSchedule ? 23 : 3, transition: "all 0.2s" }} />
            </button>
          </div>

          <div style={{ ...S.flexBetween, padding: "16px 0", borderTop: "1px solid #1e1e2d" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload Notifications</div>
              <div style={S.textMuted}>Get notified when uploads complete</div>
            </div>
            <button
              onClick={() => setNotifyOnUpload(!notifyOnUpload)}
              type="button"
              style={{ width: 48, height: 28, borderRadius: 14, background: notifyOnUpload ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "#2a2a3d", position: "relative", cursor: "pointer", border: "none", transition: "all 0.2s" }}
            >
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: notifyOnUpload ? 23 : 3, transition: "all 0.2s" }} />
            </button>
          </div>

          <div style={{ padding: "16px 0", borderTop: "1px solid #1e1e2d" }}>
            <label style={S.label}>Caption Style</label>
            <select className="input" style={S.input} value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)}>
              <option value="modern">Modern</option>
              <option value="classic">Classic</option>
              <option value="minimal">Minimal</option>
              <option value="bold">Bold</option>
            </select>
          </div>

          <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 8, justifyContent: "center" }} onClick={() => setMessage("Settings saved locally.")} type="button">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================
  return (
    <div style={S.wrap}>
      <style>{GLOBAL_CSS}</style>

      <div className="overlay" style={{ ...S.overlay, display: sidebarOpen ? "block" : "none" }} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={S.logo}>
            <div style={S.logoIcon}>
              <Icon name="play" size={16} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.5px" }}>AutoReel</span>
          </div>
        </div>

        <nav style={S.nav}>
          {VIEWS.map((view) => (
            <button
              key={view.id}
              className="btn"
              style={{ ...S.navItem, ...(activeView === view.id ? S.navItemActive : {}) }}
              onClick={() => {
                setActiveView(view.id);
                setSidebarOpen(false);
              }}
              type="button"
            >
              <Icon name={view.icon} size={18} color={activeView === view.id ? "#c4b5fd" : "#6b6b7b"} />
              <span>{view.label}</span>
              {view.id === "queue" && stats.scheduled > 0 && (
                <span style={{ marginLeft: "auto", background: "#8b5cf6", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                  {stats.scheduled}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={S.sidebarFooter}>
          <button className="btn btn-secondary" style={{ width: "100%", padding: 10, borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, ...S.btnSecondary }} type="button">
            <Icon name="log-out" size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main" style={{ ...S.main, marginLeft: isMobile ? 0 : 260 }}>
        <div className="topBar" style={S.topBar}>
          <div>
            <h1 style={S.pageTitle}>{VIEWS.find((v) => v.id === activeView)?.label}</h1>
            <p style={S.pageSubtitle}>
              {activeView === "dashboard" && "Overview of your content pipeline"}
              {activeView === "videos" && "Manage and schedule your video content"}
              {activeView === "accounts" && "Connected social media accounts"}
              {activeView === "queue" && "Upcoming uploads and publishing queue"}
              {activeView === "caption-studio" && "Add captions to your videos"}
              {activeView === "settings" && "Configure your planner preferences"}
            </p>
          </div>

          <div style={{ ...S.flexRow, gap: 12 }}>
            {activeView !== "settings" && activeView !== "caption-studio" && <PlatformSelector />}
            {isMobile && (
              <button className="btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10, color: "#f1f1f4" }} onClick={() => setSidebarOpen(true)} type="button">
                <Icon name="menu" size={20} />
              </button>
            )}
          </div>
        </div>

        {renderMessage()}

        {activeView === "dashboard" && renderDashboard()}
        {activeView === "videos" && renderVideos()}
        {activeView === "accounts" && renderAccounts()}
        {activeView === "queue" && renderQueue()}
        {activeView === "caption-studio" && renderCaptionStudio()}
        {activeView === "settings" && renderSettings()}
      </main>
    </div>
  );
}
