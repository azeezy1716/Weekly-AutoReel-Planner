import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = "http://localhost:4000";
const APP_NAME = "AZ Weekly AutoReel";
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || "";

type View = "dashboard" | "videos" | "accounts" | "queue" | "caption-studio" | "settings";

type ContentPlatform = "YouTube Shorts" | "YouTube Video" | "TikTok" | "Instagram Reels" | "Facebook Reels";

const contentPlatforms: ContentPlatform[] = [
  "YouTube Shorts",
  "YouTube Video",
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

type CaptionPosition = "top" | "bottom" | "center";
type CaptionStyle = "modern" | "bold" | "minimal" | "classic" | "cinematic";

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
  captionPosition: CaptionPosition;
  captionStyle: CaptionStyle;
  processedVideoUrl: string;
  processedFilename: string;
  scheduledAt: string;
  privacyStatus: "private" | "unlisted" | "public";
  status: "Draft" | "Scheduled";
};

type NotificationItem = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

type Plan = "free" | "pro";

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

// ==================== AI GENERATION ====================
async function generateWithGemini(topic: string, platform: string): Promise<{ title: string; description: string; tags: string; captionText: string } | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const prompt = `You are a professional social media content creator. Create engaging content for a video about: "${topic}".
Platform: ${platform}.
Requirements:
- Title: catchy, under 90 characters, no timestamps, no random numbers, no channel names, no "posted by" text
- Description: 2-3 engaging sentences that hook the viewer, platform-appropriate tone
- Tags: 5-8 highly relevant hashtags as a single space-separated string (e.g. #Shorts #Viral)
- CaptionText: one short hook sentence (under 60 chars) to burn onto the video as on-screen text

Return ONLY a JSON object with keys: title, description, tags, captionText. No markdown, no explanation.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 512 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: (parsed.title || topic).slice(0, 90),
      description: parsed.description || "",
      tags: parsed.tags || parsed.hashtags || "",
      captionText: parsed.captionText || parsed.hook || "",
    };
  } catch {
    return null;
  }
}

const HOOK_TEMPLATES: Record<string, string[]> = {
  general: [
    "This changed everything I thought I knew.",
    "Wait for the ending.",
    "The result surprised everyone.",
    "You need to see this.",
    "This is why consistency wins.",
    "The moment that made it all worth it.",
    "I did not expect this to happen.",
    "This is the shortcut nobody talks about.",
    "Watch this till the end.",
  ],
  emotional: [
    "Some feelings are quiet, but heavy.",
    "Everyone smiled, but one person felt it.",
    "He typed the message but never sent it.",
    "The silence said more than words ever could.",
    "Sometimes the smallest moments hit the hardest.",
  ],
  food: [
    "The secret ingredient is always patience.",
    "This recipe hits different every single time.",
    "One bite and you will understand why.",
    "The kitchen smelled like home after this.",
    "Simple ingredients, unforgettable flavor.",
  ],
  sports: [
    "Football fans will understand this feeling.",
    "That moment when the game changes forever.",
    "Pressure is a privilege.",
    "This play still gives me chills.",
    "Champions are made in moments like this.",
  ],
  satisfying: [
    "This cleaning moment is too satisfying.",
    "Oddly satisfying and impossible to stop watching.",
    "The before and after will shock you.",
    "This transformation is pure therapy.",
    "Satisfying enough to watch on repeat.",
  ],
  travel: [
    "This view made the whole trip worth it.",
    "The kind of place that steals your breath.",
    "Wanderlust activated.",
    "I did not want to leave.",
    "Every traveler needs to see this once.",
  ],
  fitness: [
    "The rep that changes everything.",
    "Your only competition is yesterday.",
    "This workout destroyed me in the best way.",
    "Small steps, massive results.",
    "The burn is where the growth lives.",
  ],
  tech: [
    "This feature changes everything.",
    "The trick every developer needs to know.",
    "Simple code, powerful result.",
    "This tool just saved me hours.",
    "The future of tech is already here.",
  ],
  business: [
    "The mindset shift that changed my income.",
    "This one habit separates winners from the rest.",
    "The real reason most businesses fail.",
    "Small tweaks, massive profits.",
    "The strategy nobody is talking about.",
  ],
};

const TITLE_TEMPLATES = [
  (t: string) => `${t} — The Truth`,
  (t: string) => `Why ${t} Matters More Than You Think`,
  (t: string) => `The ${t} Secret Nobody Shares`,
  (t: string) => `I Tried ${t} For 30 Days`,
  (t: string) => `${t} Changed Everything`,
  (t: string) => `This Is What ${t} Really Looks Like`,
  (t: string) => `The Real Reason ${t} Works`,
  (t: string) => `${t} Explained In 60 Seconds`,
  (t: string) => `The ${t} Hack You Need`,
  (t: string) => `What ${t} Actually Looks Like`,
];

function detectCategory(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.match(/friend|alone|sad|message|phone|left out|heart|love|break|cry|feel/)) return "emotional";
  if (lower.match(/cook|chef|kitchen|food|recipe|eat|meal|dish|bake|grill/)) return "food";
  if (lower.match(/football|soccer|goal|sport|basketball|nba|game|match|team|player/)) return "sports";
  if (lower.match(/clean|satisfying|asmr|restoration|rust|repair|fix|transform/)) return "satisfying";
  if (lower.match(/travel|trip|vacation|beach|mountain|city|hotel|flight|adventure/)) return "travel";
  if (lower.match(/fitness|gym|workout|health|exercise|muscle|cardio|lift|train/)) return "fitness";
  if (lower.match(/tech|code|app|ai|software|programming|developer|web|digital/)) return "tech";
  if (lower.match(/money|finance|invest|business|entrepreneur|startup|side.hustle|income/)) return "business";
  return "general";
}

function generatePack(topicInput: string, platform: ContentPlatform = "YouTube Shorts", variation = 0) {
  const cleanedTopic = cleanFilename(topicInput);
  const topic = titleCase(cleanedTopic);
  const category = detectCategory(topic);
  const hooks = HOOK_TEMPLATES[category] || HOOK_TEMPLATES.general;
  const hook = hooks[variation % hooks.length];
  const titleFn = TITLE_TEMPLATES[variation % TITLE_TEMPLATES.length];
  const title = titleFn(topic).slice(0, 90);

  const baseHashtags = ["#Shorts", "#ViralShorts", "#ShortFormContent"];
  const categoryTags: Record<string, string[]> = {
    emotional: ["#DeepQuotes", "#RealFeelings", "#Relatable", "#POV"],
    food: ["#FoodTok", "#Recipe", "#Cooking", "#Foodie"],
    sports: ["#Sports", "#Football", "#Soccer", "#GameDay"],
    satisfying: ["#Satisfying", "#OddlySatisfying", "#ASMR", "#CleanTok"],
    travel: ["#Travel", "#Wanderlust", "#Adventure", "#Explore"],
    fitness: ["#Fitness", "#GymTok", "#Workout", "#Health"],
    tech: ["#Tech", "#Coding", "#AI", "#Developer"],
    business: ["#Business", "#Entrepreneur", "#Money", "#Success"],
    general: ["#Viral", "#Trending", "#Content", "#Creator"],
  };

  const platformHashtags: Record<string, string[]> = {
    "YouTube Shorts": ["#YouTubeShorts", "#Shorts"],
    "YouTube Video": ["#YouTube", "#Video"],
    TikTok: ["#TikTok", "#FYP", "#ForYou"],
    "Instagram Reels": ["#Reels", "#InstagramReels", "#ExplorePage"],
    "Facebook Reels": ["#FacebookReels", "#ReelsVideo", "#WatchThis"],
  };

  const finalHashtags = Array.from(
    new Set([...baseHashtags, ...(categoryTags[category] || []), ...(platformHashtags[platform] || [])])
  ).slice(0, 9);

  const descShorts = `${hook}\n\n${topic}\n\n${finalHashtags.join(" ")}`;
  const descLong = `In this video, we dive into ${topic.toLowerCase()} and uncover what most people miss.\n\n${hook}\n\n${finalHashtags.join(" ")}`;
  const descTikTok = `POV: ${topic.toLowerCase()}\n\n${hook}\n\n${finalHashtags.join(" ")}`;
  const descIG = `${hook}\n\n${topic}\n\nSave this if you felt it.\n\n${finalHashtags.join(" ")}`;
  const descFB = `${hook}\n\n${topic}\n\nWhat would you do?\n\n${finalHashtags.join(" ")}`;

  const descriptionMap: Record<ContentPlatform, string> = {
    "YouTube Shorts": descShorts,
    "YouTube Video": descLong,
    TikTok: descTikTok,
    "Instagram Reels": descIG,
    "Facebook Reels": descFB,
  };

  return { title, description: descriptionMap[platform], tags: finalHashtags.join(" "), captionText: hook };
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
      return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
    case "video":
      return <svg {...s}><rect x="2" y="2" width="20" height="20" rx="2.18" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" /></svg>;
    case "users":
      return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "list":
      return <svg {...s}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case "type":
      return <svg {...s}><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>;
    case "settings":
      return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "upload":
      return <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case "trash":
      return <svg {...s}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;
    case "refresh":
      return <svg {...s}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>;
    case "copy":
      return <svg {...s}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
    case "check":
      return <svg {...s}><polyline points="20 6 9 17 4 12" /></svg>;
    case "x":
      return <svg {...s}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    case "plus":
      return <svg {...s}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case "calendar":
      return <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case "clock":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "play":
      return <svg {...s}><polygon points="5 3 19 12 5 21 5 3" /></svg>;
    case "sparkles":
      return <svg {...s}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>;
    case "alert":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    case "menu":
      return <svg {...s}><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>;
    case "chevron-right":
      return <svg {...s}><polyline points="9 18 15 12 9 6" /></svg>;
    case "image":
      return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
    case "log-out":
      return <svg {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
    case "youtube":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>;
    case "tiktok":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.89 2.89 2.89 0 0 1 2.88-2.89c.3 0 .59.05.88.13V9.4a6.37 6.37 0 0 0-.88-.06A6.34 6.34 0 0 0 2.89 15.68a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.83a8.16 8.16 0 0 0 4.92 1.66V7.36a4.85 4.85 0 0 1-1-.07z" /></svg>;
    case "facebook":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>;
    case "instagram":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>;
    case "film":
      return <svg {...s}><rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>;
    case "info":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
    case "external-link":
      return <svg {...s}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;
    case "send":
      return <svg {...s}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
    case "wand":
      return <svg {...s}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
    case "monitor":
      return <svg {...s}><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
    case "smartphone":
      return <svg {...s}><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>;
    case "zap":
      return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case "chevron-down":
      return <svg {...s}><polyline points="6 9 12 15 18 9" /></svg>;
    case "bell":
      return <svg {...s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    case "trending-up":
      return <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case "award":
      return <svg {...s}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>;
    case "layers":
      return <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
    case "dollar":
      return <svg {...s}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
    case "lock":
      return <svg {...s}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "star":
      return <svg {...s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case "arrow-right":
      return <svg {...s}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case "gift":
      return <svg {...s}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

// ==================== CUSTOM 3D SELECT ====================
function CustomSelect({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label || value;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label
          style={{
            fontSize: 12,
            color: "#6b6b7b",
            fontWeight: 500,
            display: "block",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#f1f1f4",
          borderRadius: 12,
          padding: "10px 14px",
          fontFamily: "inherit",
          fontSize: 14,
          outline: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: open ? "scale(0.98) translateY(1px)" : "scale(1)",
          boxShadow: open
            ? "0 0 0 3px rgba(139,92,246,0.15), 0 8px 32px rgba(139,92,246,0.1)"
            : "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <span style={{ fontWeight: 500 }}>{selectedLabel}</span>
        <span
          style={{
            transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-flex",
          }}
        >
          <Icon name="chevron-down" size={16} color="#6b6b7b" />
        </span>
      </button>

      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          right: 0,
          zIndex: 50,
          perspective: 800,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          style={{
            background: "rgba(19, 19, 31, 0.95)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(139,92,246,0.15)",
            borderRadius: 16,
            padding: 8,
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.08)",
            transformOrigin: "top center",
            transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: open ? "rotateX(0deg) translateY(0) translateZ(0)" : "rotateX(-20deg) translateY(-12px) translateZ(-30px)",
            opacity: open ? 1 : 0,
          }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isHovered = hovered === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setHovered(opt.value)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  color: isSelected ? "#fff" : "#b4b4c7",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(139,92,246,0.35), rgba(236,72,153,0.25))"
                    : isHovered
                    ? "rgba(255,255,255,0.06)"
                    : "transparent",
                  border: isSelected ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                  marginBottom: 2,
                  transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  transform: open
                    ? `translateY(0) translateZ(${isHovered ? 8 : 0}px) scale(${isHovered ? 1.02 : 1})`
                    : `translateY(-8px) translateZ(-20px)`,
                  opacity: open ? 1 : 0,
                  transitionDelay: open ? `${i * 25}ms` : "0ms",
                  fontWeight: isSelected ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 12px rgba(139,92,246,0.5)",
                    }}
                  >
                    <Icon name="check" size={10} color="#fff" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
  videoThumb: { background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", aspectRatio: "9/16", maxHeight: 420 },
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
  ratio916: { aspectRatio: "9/16", maxHeight: 420, background: "#0a0a0f", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  ratio169: { aspectRatio: "16/9", maxHeight: 280, background: "#0a0a0f", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
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
  .video916 video { width: 100%; height: 100%; object-fit: cover; }
  .video169 video { width: 100%; height: 100%; object-fit: cover; }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  .float-anim { animation: float 4s ease-in-out infinite; }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(139,92,246,0.15); }
    50% { box-shadow: 0 0 40px rgba(139,92,246,0.3); }
  }
  .glow-pulse { animation: glowPulse 3s ease-in-out infinite; }
  @keyframes slideIn3D {
    from { opacity: 0; transform: perspective(800px) rotateX(-8deg) translateY(-20px) translateZ(-40px); }
    to { opacity: 1; transform: perspective(800px) rotateX(0) translateY(0) translateZ(0); }
  }
  .slide-3d { animation: slideIn3D 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes confettiFall {
    0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  .confetti-piece {
    position: fixed;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    top: -10px;
    z-index: 100;
    animation: confettiFall 3s ease-out forwards;
  }
  @keyframes toastIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .toast-in { animation: toastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes toastOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(120%); opacity: 0; }
  }
  .toast-out { animation: toastOut 0.3s ease forwards; }
  @keyframes popIn {
    0% { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  .pop-in { animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
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
  "YouTube Video": { color: "#ff0000", icon: "youtube" },
  TikTok: { color: "#00f2ea", icon: "tiktok" },
  "Instagram Reels": { color: "#e1306c", icon: "instagram" },
  "Facebook Reels": { color: "#1877f2", icon: "facebook" },
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TEMPLATES = [
  { id: "fitness", name: "Fitness", icon: "zap", color: "#10b981" },
  { id: "food", name: "Food", icon: "star", color: "#f59e0b" },
  { id: "tech", name: "Tech", icon: "monitor", color: "#3b82f6" },
  { id: "business", name: "Business", icon: "dollar", color: "#8b5cf6" },
  { id: "travel", name: "Travel", icon: "external-link", color: "#ec4899" },
];

// ==================== APP ====================
export default function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform>("YouTube Shorts");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [plannedVideos, setPlannedVideos] = useState<PlannedVideo[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [processingVideoId, setProcessingVideoId] = useState("");
  const [message, setMessage] = useState("");

  const [autoSchedule, setAutoSchedule] = useState(false);
  const [notifyOnUpload, setNotifyOnUpload] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("modern");

  const [captionStudioVideoId, setCaptionStudioVideoId] = useState("");
  const [captionStudioText, setCaptionStudioText] = useState("");
  const [captionStudioPosition, setCaptionStudioPosition] = useState<CaptionPosition>("top");
  const [captionStudioStyle, setCaptionStudioStyle] = useState<CaptionStyle>("modern");
  const [captionStudioPreview, setCaptionStudioPreview] = useState("");

  const [regenCounter, setRegenCounter] = useState(0);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  const [currentPlan, setCurrentPlan] = useState<Plan>("free");

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

  useEffect(() => {
    const done = localStorage.getItem("az_onboarding_complete");
    if (!done) setShowOnboarding(true);
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

  const freeLimit = 3;
  const atLimit = currentPlan === "free" && plannedVideos.length >= freeLimit;

  function addNotification(message: string, type: "success" | "error" | "info" = "info") {
    const id = createId();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }

  function triggerConfetti() {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  }

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
      addNotification("Connection lost. Reconnecting...", "error");
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
      addNotification("Could not load publishing queue.", "error");
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

  async function smartGeneratePack(topic: string, platform: ContentPlatform, variation: number) {
    const aiResult = await generateWithGemini(topic, platform);
    if (aiResult) return aiResult;
    return generatePack(topic, platform, variation);
  }

  function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("video/"));
    if (!files.length) return;

    if (currentPlan === "free" && plannedVideos.length + files.length > freeLimit) {
      addNotification("Free plan: 3 video limit reached. Upgrade to Pro for unlimited.", "error");
      event.currentTarget.value = "";
      return;
    }

    const defaultPlatform = selectedPlatform;

    const newVideos = files.map((file, index) => {
      const topic = cleanFilename(file.name);
      const pack = generatePack(topic, defaultPlatform, regenCounter + index);

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
        captionPosition: "top" as CaptionPosition,
        captionStyle: "modern" as CaptionStyle,
        processedVideoUrl: "",
        processedFilename: "",
        scheduledAt: getNextWeekSchedule(plannedVideos.length + index),
        privacyStatus: "public" as const,
        status: "Draft" as const,
      };
    });

    setPlannedVideos((current) => [...current, ...newVideos]);
    setRegenCounter((c) => c + files.length);
    addNotification(`${files.length} video${files.length > 1 ? "s" : ""} uploaded successfully.`, "success");
    event.currentTarget.value = "";
  }

  async function regenerateAll() {
    const nextCounter = regenCounter + plannedVideos.length;
    setRegenCounter(nextCounter);

    const updated = await Promise.all(
      plannedVideos.map(async (video, index) => {
        const pack = await smartGeneratePack(video.topic, video.contentPlatform, nextCounter + index);
        return {
          ...video,
          ...pack,
          processedVideoUrl: "",
          processedFilename: "",
          scheduledAt: video.scheduledAt || getNextWeekSchedule(index),
        };
      })
    );
    setPlannedVideos(updated);
    addNotification("All content packs regenerated with AI.", "success");
  }

  async function regenerateOne(video: PlannedVideo) {
    const nextCounter = regenCounter + 1;
    setRegenCounter(nextCounter);
    const pack = await smartGeneratePack(video.topic, video.contentPlatform, nextCounter);
    updateVideo(video.id, {
      ...pack,
      processedVideoUrl: "",
      processedFilename: "",
    });
    addNotification("Content pack regenerated.", "success");
  }

  function updateVideo(id: string, updates: Partial<PlannedVideo>) {
    setPlannedVideos((current) => current.map((video) => (video.id === id ? { ...video, ...updates } : video)));
  }

  function removeDraft(id: string) {
    const video = plannedVideos.find((item) => item.id === id);
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
    setPlannedVideos((current) => current.filter((item) => item.id !== id));
    addNotification("Video removed.", "info");
  }

  async function processCaptionedVideo(video: PlannedVideo) {
    if (!video.captionText.trim()) {
      alert("Add caption text first.");
      return;
    }
    try {
      setProcessingVideoId(video.id);
      addNotification("Burning captions into your video...", "info");

      const formData = new FormData();
      formData.append("captionText", video.captionText.trim());
      formData.append("video", video.file);
      formData.append("captionPosition", video.captionPosition || "top");
      formData.append("captionStyle", video.captionStyle || "modern");

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
      addNotification("Captioned video is ready for publishing.", "success");
    } catch (error) {
      addNotification(error instanceof Error ? error.message : "Processing failed.", "error");
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
    const isYouTube = video.contentPlatform === "YouTube Shorts" || video.contentPlatform === "YouTube Video";
    if (!isYouTube) {
      throw new Error(
        "YouTube publishing is live. TikTok, Instagram & Facebook coming soon."
      );
    }
    if (!selectedAccountId) {
      throw new Error("Connect your channel to start publishing.");
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
      alert("Connect your channel to start publishing.");
      return;
    }
    const unsupportedVideos = plannedVideos.filter((video) => {
      const isYouTube = video.contentPlatform === "YouTube Shorts" || video.contentPlatform === "YouTube Video";
      return !isYouTube;
    });
    if (unsupportedVideos.length) {
      alert(
        "YouTube publishing is live. Switch TikTok/Instagram/Facebook drafts to YouTube to auto-post, or publish them manually."
      );
      return;
    }
    try {
      setIsScheduling(true);
      addNotification("Scheduling your content...", "info");
      for (const video of plannedVideos) {
        await scheduleOne(video);
      }
      plannedVideos.forEach((video) => URL.revokeObjectURL(video.previewUrl));
      setPlannedVideos([]);
      await loadPosts();
      triggerConfetti();
      addNotification("All videos scheduled! They will go live automatically.", "success");
    } catch (error) {
      addNotification(error instanceof Error ? error.message : "Scheduling failed.", "error");
    } finally {
      setIsScheduling(false);
    }
  }

  async function uploadNow(postId: string) {
    try {
      addNotification("Publishing now...", "info");
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/upload-now`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Upload now failed");
      }
      await loadPosts();
      addNotification("Your video is now live!", "success");
    } catch (error) {
      addNotification(error instanceof Error ? error.message : "Upload failed.", "error");
    }
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this scheduled post?");
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }
      await loadPosts();
      addNotification("Post deleted.", "info");
    } catch (error) {
      addNotification(error instanceof Error ? error.message : "Delete failed.", "error");
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
    const isError =
      message.toLowerCase().includes("failed") ||
      message.toLowerCase().includes("error") ||
      message.toLowerCase().includes("not reachable") ||
      message.toLowerCase().includes("could not");
    return (
      <div
        style={{
          ...S.messageBanner,
          background: isError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
          borderColor: isError ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)",
          color: isError ? "#ef4444" : "#10b981",
        }}
      >
        <Icon name={isError ? "alert" : "check"} size={16} />
        <span style={{ flex: 1 }}>{message}</span>
        <button className="btn" style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }} onClick={() => setMessage("")} type="button">
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  };

  // ==================== ONBOARDING ====================
  const renderOnboarding = () => {
    if (!showOnboarding) return null;
    const steps = [
      { title: "Welcome to " + APP_NAME, desc: "Upload once. We write the captions, titles, and hashtags. Then we post at the perfect time.", icon: "sparkles" },
      { title: "Upload Your Content", desc: "Drop your videos here. We support 9:16 vertical for Shorts, Reels, and TikTok.", icon: "upload" },
      { title: "Connect Your Channel", desc: "Link your YouTube channel. We will handle the rest.", icon: "users" },
      { title: "Go Viral on Autopilot", desc: "Your content goes live automatically. Focus on creating, not posting.", icon: "zap" },
    ];
    const step = steps[onboardingStep];

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,10,15,0.95)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="pop-in" style={{ maxWidth: 480, width: "100%", background: "#13131f", border: "1px solid #1e1e2d", borderRadius: 24, padding: 40, textAlign: "center" }}>
          <div className="float-anim" style={{ width: 80, height: 80, borderRadius: 24, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <Icon name={step.icon} size={36} color="#fff" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>{step.title}</h2>
          <p style={{ fontSize: 15, color: "#6b6b7b", lineHeight: 1.6, marginBottom: 32 }}>{step.desc}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {onboardingStep > 0 && (
              <button className="btn btn-secondary" style={S.btnSecondary} onClick={() => setOnboardingStep((s) => s - 1)} type="button">Back</button>
            )}
            {onboardingStep < steps.length - 1 ? (
              <button className="btn btn-primary" style={S.btnPrimary} onClick={() => setOnboardingStep((s) => s + 1)} type="button">
                Next <Icon name="arrow-right" size={14} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={S.btnPrimary}
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem("az_onboarding_complete", "true");
                }}
                type="button"
              >
                Get Started <Icon name="arrow-right" size={14} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === onboardingStep ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "#2a2a3d", transition: "all 0.3s" }} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ==================== NOTIFICATIONS ====================
  const renderNotifications = () => (
    <div style={{ position: "fixed", top: 24, right: 24, zIndex: 90, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360, pointerEvents: "none" }}>
      {notifications.map((n) => (
        <div
          key={n.id}
          className="toast-in"
          style={{
            background: "rgba(19,19,31,0.95)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${n.type === "success" ? "rgba(16,185,129,0.2)" : n.type === "error" ? "rgba(239,68,68,0.2)" : "rgba(139,92,246,0.2)"}`,
            borderRadius: 14,
            padding: "14px 18px",
            color: "#f1f1f4",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: n.type === "success" ? "#10b981" : n.type === "error" ? "#ef4444" : "#8b5cf6",
              boxShadow: `0 0 10px ${n.type === "success" ? "rgba(16,185,129,0.5)" : n.type === "error" ? "rgba(239,68,68,0.5)" : "rgba(139,92,246,0.5)"}`,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>{n.message}</span>
        </div>
      ))}
    </div>
  );

  // ==================== CONFETTI ====================
  const renderConfetti = () => {
    if (!showConfetti) return null;
    const colors = ["#8b5cf6", "#ec4899", "#10b981", "#3b82f6", "#f59e0b", "#ff0000"];
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 99, pointerEvents: "none", overflow: "hidden" }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left: `${Math.random() * 100}%`,
              background: colors[Math.floor(Math.random() * colors.length)],
              animationDelay: `${Math.random() * 1.5}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
              width: `${6 + Math.random() * 8}px`,
              height: `${6 + Math.random() * 8}px`,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            }}
          />
        ))}
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

      <div className="grid4" style={{ ...S.grid4, marginBottom: 32 }}>
        <div className="card-hover slide-3d" style={{ ...S.card, padding: 20 }}>
          <div style={{ ...S.flexRow, gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="trending-up" size={20} color="#8b5cf6" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b6b7b" }}>Best Time to Post</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>3:00 PM EST</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#4a4a5a" }}>Based on your audience activity</div>
        </div>
        <div className="card-hover slide-3d" style={{ ...S.card, padding: 20 }}>
          <div style={{ ...S.flexRow, gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="award" size={20} color="#10b981" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b6b7b" }}>Top Performing</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>YouTube Shorts</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#4a4a5a" }}>87% of your views this week</div>
        </div>
        <div className="card-hover slide-3d" style={{ ...S.card, padding: 20 }}>
          <div style={{ ...S.flexRow, gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="layers" size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b6b7b" }}>Content Streak</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>5 Days</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#4a4a5a" }}>Keep the momentum going</div>
        </div>
        <div className="card-hover slide-3d" style={{ ...S.card, padding: 20, border: "1px solid rgba(139,92,246,0.2)" }}>
          <div style={{ ...S.flexRow, gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="star" size={20} color="#c4b5fd" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#c4b5fd" }}>Pro Feature</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>AI Content Suite</div>
            </div>
          </div>
          <button className="btn" style={{ ...S.btnPrimary, width: "100%", justifyContent: "center", marginTop: 8, padding: "8px 12px", fontSize: 12 }} type="button">
            Upgrade to Pro
          </button>
        </div>
      </div>

      <SectionHeader title="Weekly Timeline" subtitle="Your content schedule at a glance" />
      <div className="grid7" style={S.grid7}>
        {DAYS.map((dayName) => {
          const dayItems = calendarGroups.filter((item) => getDayName(item.scheduledAt) === dayName);
          return (
            <div key={dayName} className="card-hover slide-3d" style={S.timelineDay}>
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #1e1e2d" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{dayName}</div>
                <div style={{ fontSize: 12, color: "#6b6b7b", marginTop: 2 }}>
                  {dayItems.length > 0 ? `${dayItems.length} upload${dayItems.length > 1 ? "s" : ""}` : "No uploads"}
                </div>
              </div>
              <div>
                {dayItems.slice(0, 4).map((item) => (
                  <div key={`${item.source}-${item.id}`} className="card-hover" style={S.timelineCard}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
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
              <Icon name="wand" size={16} />
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
      {currentPlan === "free" && (
        <div className="slide-3d" style={{ ...S.card, marginBottom: 24, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.03)" }}>
          <div style={{ ...S.flexBetween }}>
            <div style={{ ...S.flexRow, gap: 12 }}>
              <Icon name="gift" size={20} color="#f59e0b" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Free Plan</div>
                <div style={{ fontSize: 12, color: "#6b6b7b" }}>
                  {plannedVideos.length} of {freeLimit} videos used this week
                </div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ ...S.btnPrimary, fontSize: 12 }} onClick={() => setCurrentPlan("pro")} type="button">
              <Icon name="star" size={12} />
              Upgrade to Pro
            </button>
          </div>
          <div style={{ width: "100%", height: 4, background: "#1e1e2d", borderRadius: 2, marginTop: 12 }}>
            <div style={{ width: `${Math.min((plannedVideos.length / freeLimit) * 100, 100)}%`, height: "100%", background: "linear-gradient(90deg, #8b5cf6, #ec4899)", borderRadius: 2, transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ ...S.flexWrap, gap: 12 }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="btn card-hover"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#f1f1f4",
                fontSize: 13,
                fontWeight: 600,
              }}
              onClick={() => addNotification(`${t.name} template applied. Upload videos to see the difference.`, "info")}
              type="button"
            >
              <Icon name={t.icon} size={14} color={t.color} />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div
        className="card-hover float-anim"
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
        <div className="glow-pulse" style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Icon name="upload" size={28} color="#8b5cf6" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Upload Week Videos</h3>
        <p style={{ fontSize: 14, color: "#6b6b7b", maxWidth: 400, margin: "0 auto" }}>
          Drag and drop video files here, or click to browse. 9:16 vertical recommended for Shorts/Reels/TikTok.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
          <span style={{ ...S.badge, background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>{selectedPlatform}</span>
          <span style={{ ...S.badge, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>9:16</span>
        </div>
      </div>

      <SectionHeader
        title={`Draft Videos (${plannedVideos.length})`}
        subtitle="Edit, caption, process, then schedule."
        action={
          plannedVideos.length > 0 && (
            <div style={{ ...S.flexWrap, gap: 8 }}>
              <button className="btn btn-secondary" style={S.btnSecondary} onClick={regenerateAll} type="button">
                <Icon name="wand" size={14} />
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
          <p style={{ marginTop: 16 }}>Your queue is empty</p>
          <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>Upload your first week of videos to get started.</p>
          <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 20 }} onClick={() => fileInputRef.current?.click()} type="button">
            <Icon name="upload" size={16} />
            Upload Your First Video
          </button>
        </div>
      ) : (
        <div className="grid2" style={S.grid2}>
          {plannedVideos.map((video, index) => {
            const isShorts = video.contentPlatform.includes("Shorts") || video.contentPlatform.includes("Reels") || video.contentPlatform === "TikTok";
            return (
              <div key={video.id} className="card-hover slide-3d" style={S.videoCard}>
                <div style={S.videoThumb}>
                  <video
                    src={video.processedVideoUrl || video.previewUrl}
                    className={isShorts ? "video916" : "video169"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    controls
                  />
                  <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, flexDirection: "column" }}>
                    <span style={{ ...S.badge, background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)" }}>
                      {isShorts ? "9:16" : "16:9"}
                    </span>
                    <span style={{ ...S.badge, background: video.processedVideoUrl ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: video.processedVideoUrl ? "#10b981" : "#f59e0b" }}>
                      {video.processedVideoUrl ? "Captioned" : "Draft"}
                    </span>
                  </div>
                  <div style={{ position: "absolute", bottom: 12, left: 12 }}>
                    <span style={{ ...S.badge, background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)" }}>
                      {formatFileSize(video.file.size)}
                    </span>
                  </div>
                </div>

                <div style={S.videoInfo}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, wordBreak: "break-all" }}>{video.filename}</div>
                    <div style={{ fontSize: 12, color: "#6b6b7b" }}>Video {index + 1} of {plannedVideos.length}</div>
                  </div>

                  <div style={{ ...S.flexCol, gap: 12 }}>
                    <CustomSelect
                      label="Content Platform"
                      value={video.contentPlatform}
                      onChange={(val) => {
                        const contentPlatform = val as ContentPlatform;
                        const pack = generatePack(video.topic, contentPlatform, regenCounter);
                        updateVideo(video.id, {
                          contentPlatform,
                          ...pack,
                          processedVideoUrl: "",
                          processedFilename: "",
                        });
                      }}
                      options={contentPlatforms.map((p) => ({ value: p, label: p }))}
                    />

                    <label style={S.label}>
                      Topic
                      <input
                        className="input"
                        style={S.input}
                        value={video.topic}
                        onChange={(e) => {
                          const topic = e.target.value;
                          const pack = generatePack(topic, video.contentPlatform, regenCounter);
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

                    <CustomSelect
                      label="Privacy"
                      value={video.privacyStatus}
                      onChange={(val) => updateVideo(video.id, { privacyStatus: val as "private" | "unlisted" | "public" })}
                      options={[
                        { value: "public", label: "Public" },
                        { value: "unlisted", label: "Unlisted" },
                        { value: "private", label: "Private" },
                      ]}
                    />

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

                    <div style={{ ...S.flexWrap, gap: 8 }}>
                      <CustomSelect
                        label="Position"
                        value={video.captionPosition}
                        onChange={(val) => updateVideo(video.id, { captionPosition: val as CaptionPosition })}
                        options={[
                          { value: "top", label: "Top" },
                          { value: "center", label: "Center" },
                          { value: "bottom", label: "Bottom" },
                        ]}
                      />
                      <CustomSelect
                        label="Style"
                        value={video.captionStyle}
                        onChange={(val) => updateVideo(video.id, { captionStyle: val as CaptionStyle })}
                        options={[
                          { value: "modern", label: "Modern" },
                          { value: "bold", label: "Bold" },
                          { value: "minimal", label: "Minimal" },
                          { value: "classic", label: "Classic" },
                          { value: "cinematic", label: "Cinematic" },
                        ]}
                      />
                    </div>

                    {video.processedVideoUrl && (
                      <p style={{ color: "#b9ffdc", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                        Captioned video ready. YouTube upload will use the processed video.
                      </p>
                    )}

                    {video.contentPlatform !== "YouTube Shorts" && video.contentPlatform !== "YouTube Video" && (
                      <p style={{ color: "#ffcf8a", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                        {video.contentPlatform} pack is for manual posting for now. Real auto-post currently supports YouTube only.
                      </p>
                    )}

                    <div style={{ ...S.flexWrap, gap: 8, marginTop: 4 }}>
                      <button className="btn btn-secondary" style={S.btnSecondary} onClick={() => regenerateOne(video)} type="button">
                        <Icon name="refresh" size={14} />
                        Regenerate
                      </button>
                      <button className="btn btn-primary" style={S.btnPrimary} onClick={() => processCaptionedVideo(video)} disabled={processingVideoId === video.id} type="button">
                        <Icon name="sparkles" size={14} />
                        {processingVideoId === video.id ? "Processing..." : "Burn Captions"}
                      </button>
                      {video.processedVideoUrl && (
                        <a href={video.processedVideoUrl} target="_blank" rel="noreferrer" style={{ ...S.btnSecondary, textDecoration: "none" }}>
                          <Icon name="external-link" size={14} />
                          Open Processed
                        </a>
                      )}
                      <button
                        className="btn btn-success"
                        style={S.btnSuccess}
                        onClick={async () => {
                          try {
                            addNotification("Scheduling your video...", "info");
                            await scheduleOne(video);
                            removeDraft(video.id);
                            await loadPosts();
                            addNotification("Video scheduled. It will go live automatically.", "success");
                          } catch (error) {
                            addNotification(error instanceof Error ? error.message : "Schedule failed.", "error");
                          }
                        }}
                        type="button"
                      >
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
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAccounts = () => (
    <div className="fade-in">
      <div className="slide-3d" style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ ...S.flexBetween, marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Connected Accounts</h2>
            <p style={{ fontSize: 13, color: "#6b6b7b" }}>
              {selectedPlatform === "YouTube Shorts" || selectedPlatform === "YouTube Video"
                ? "Manage your YouTube channel connections."
                : `YouTube publishing is live. ${selectedPlatform} coming soon.`}
            </p>
          </div>
          <div style={{ ...S.flexWrap, gap: 8 }}>
            <button className="btn btn-secondary" style={S.btnSecondary} onClick={loadAccounts} type="button">
              <Icon name="refresh" size={16} />
              Refresh
            </button>
          </div>
        </div>

        {selectedPlatform === "YouTube Shorts" || selectedPlatform === "YouTube Video" ? (
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
                <p style={{ marginTop: 16 }}>No accounts connected</p>
                <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>Connect your YouTube channel to start publishing.</p>
                <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 16 }} onClick={connectYouTube} type="button">
                  Connect Your First Channel
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
                      onClick={() => addNotification("Account removal is not supported yet.", "error")}
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
              <CustomSelect
                label="Select Channel for Uploading"
                value={selectedAccountId}
                onChange={(val) => setSelectedAccountId(val)}
                options={[
                  ...(connectedAccounts.length === 0 ? [{ value: "", label: "No channel connected" }] : []),
                  ...connectedAccounts.map((a) => ({ value: a.accountId, label: a.channelTitle || a.accountId })),
                ]}
              />
              <div style={{ marginTop: 12, padding: 12, background: "#0a0a0f", borderRadius: 10, border: "1px solid #1e1e2d" }}>
                {isLoadingAccounts ? (
                  <span style={{ fontSize: 13, color: "#6b6b7b" }}>Checking connection...</span>
                ) : selectedAccount ? (
                  <div style={{ ...S.flexRow, gap: 12 }}>
                    <span className="status-dot connected" />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {selectedAccount.channelTitle || selectedAccount.accountId} — Ready to publish
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
            <p style={{ marginTop: 16 }}>{selectedPlatform} publishing is coming soon</p>
            <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>
              Switch to YouTube Shorts or YouTube Video to connect a channel.
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
        subtitle="Your upcoming content schedule."
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
          <p style={{ marginTop: 16 }}>Your queue is empty</p>
          <p style={{ fontSize: 13, color: "#6b6b7b", marginTop: 4 }}>Upload your first week of videos to get started.</p>
          <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 20 }} onClick={() => { setActiveView("videos"); }} type="button">
            <Icon name="upload" size={16} />
            Upload Videos
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scheduledPosts.map((post) => (
            <div
              key={post.id}
              className="card-hover slide-3d"
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
                    YouTube
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
                    Publish Now
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
        addNotification("Select a video first.", "error");
        return;
      }
      if (!captionStudioText.trim()) {
        addNotification("Enter caption text first.", "error");
        return;
      }
      try {
        setProcessingVideoId(selectedVideo.id);
        addNotification("Burning captions into your video...", "info");

        const formData = new FormData();
        formData.append("captionText", captionStudioText.trim());
        formData.append("video", selectedVideo.file);
        formData.append("captionPosition", captionStudioPosition);
        formData.append("captionStyle", captionStudioStyle);

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
        addNotification("Captioned video is ready for publishing.", "success");
      } catch (error) {
        addNotification(error instanceof Error ? error.message : "Processing failed.", "error");
      } finally {
        setProcessingVideoId("");
      }
    }

    return (
      <div className="fade-in">
        <div className="grid2" style={{ ...S.grid2, alignItems: "start" }}>
          <div className="slide-3d" style={S.card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Caption Studio</h2>

            <div style={{ marginBottom: 16 }}>
              <CustomSelect
                label="Select Video"
                value={captionStudioVideoId}
                onChange={(val) => setCaptionStudioVideoId(val)}
                options={[
                  { value: "", label: "Choose a video..." },
                  ...plannedVideos.map((v) => ({ value: v.id, label: v.filename })),
                ]}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Caption Text</label>
              <textarea className="input" style={{ ...S.textarea, minHeight: 100 }} value={captionStudioText} onChange={(e) => setCaptionStudioText(e.target.value)} placeholder="Enter caption text to burn onto the video..." />
            </div>

            <div style={{ ...S.flexWrap, gap: 12, marginBottom: 16 }}>
              <CustomSelect
                label="Position"
                value={captionStudioPosition}
                onChange={(val) => setCaptionStudioPosition(val as CaptionPosition)}
                options={[
                  { value: "top", label: "Top" },
                  { value: "center", label: "Center" },
                  { value: "bottom", label: "Bottom" },
                ]}
              />
              <CustomSelect
                label="Style"
                value={captionStudioStyle}
                onChange={(val) => setCaptionStudioStyle(val as CaptionStyle)}
                options={[
                  { value: "modern", label: "Modern" },
                  { value: "bold", label: "Bold" },
                  { value: "minimal", label: "Minimal" },
                  { value: "classic", label: "Classic" },
                  { value: "cinematic", label: "Cinematic" },
                ]}
              />
            </div>

            <button className="btn btn-primary" style={{ ...S.btnPrimary, width: "100%", justifyContent: "center", padding: 12 }} onClick={handleProcessStudio} disabled={!selectedVideo || processingVideoId === selectedVideo?.id} type="button">
              <Icon name="sparkles" size={18} />
              {processingVideoId === selectedVideo?.id ? "Processing..." : "Process Video"}
            </button>
          </div>

          <div className="slide-3d" style={S.card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Preview</h2>
            {captionStudioPreview || selectedVideo?.processedVideoUrl ? (
              <div className="video916" style={{ ...S.ratio916, borderRadius: 12 }}>
                <video
                  src={captionStudioPreview || selectedVideo?.processedVideoUrl}
                  controls
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
                />
              </div>
            ) : (
              <div style={{ ...S.ratio916, borderRadius: 12, flexDirection: "column", gap: 12, color: "#6b6b7b" }}>
                <Icon name="play" size={40} color="#2a2a3d" />
                <span style={{ fontSize: 14 }}>Processed 9:16 video will appear here</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="fade-in" style={{ maxWidth: 600 }}>
      <div className="slide-3d" style={S.card}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Planner Settings</h2>

        <div style={{ ...S.flexCol, gap: 20 }}>
          <CustomSelect
            label="Default Platform"
            value={selectedPlatform}
            onChange={(val) => setSelectedPlatform(val as ContentPlatform)}
            options={contentPlatforms.map((p) => ({ value: p, label: p }))}
          />

          <div style={{ padding: 16, background: "#0a0a0f", borderRadius: 12, border: "1px solid #1e1e2d" }}>
            <div style={{ ...S.flexBetween, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>AI Content Generation</div>
                <div style={S.textMuted}>
                  {GEMINI_API_KEY ? "Powered by Google Gemini. Active." : "Add VITE_GEMINI_API_KEY to your .env file to enable AI."}
                </div>
              </div>
              <span style={{ ...S.badge, background: GEMINI_API_KEY ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: GEMINI_API_KEY ? "#10b981" : "#f59e0b" }}>
                {GEMINI_API_KEY ? "Active" : "Setup Required"}
              </span>
            </div>
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
            <CustomSelect
              label="Default Caption Style"
              value={captionStyle}
              onChange={(val) => setCaptionStyle(val as CaptionStyle)}
              options={[
                { value: "modern", label: "Modern" },
                { value: "bold", label: "Bold" },
                { value: "minimal", label: "Minimal" },
                { value: "classic", label: "Classic" },
                { value: "cinematic", label: "Cinematic" },
              ]}
            />
          </div>

          <button className="btn btn-primary" style={{ ...S.btnPrimary, marginTop: 8, justifyContent: "center" }} onClick={() => addNotification("Settings saved.", "success")} type="button">
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

      {renderConfetti()}
      {renderNotifications()}
      {renderOnboarding()}

      <div className="overlay" style={{ ...S.overlay, display: sidebarOpen ? "block" : "none" }} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={S.logo}>
            <div style={S.logoIcon}>
              <Icon name="play" size={16} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.5px" }}>{APP_NAME}</span>
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

        <div style={{ ...S.sidebarFooter, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, background: "#0a0a0f", borderRadius: 10, border: "1px solid #1e1e2d" }}>
            <div style={{ ...S.flexBetween, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#f1f1f4" }}>Plan</span>
              <span style={{ ...S.badge, background: currentPlan === "pro" ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)", color: currentPlan === "pro" ? "#c4b5fd" : "#6b6b7b" }}>
                {currentPlan === "pro" ? "Pro" : "Free"}
              </span>
            </div>
            {currentPlan === "free" && (
              <button className="btn btn-primary" style={{ ...S.btnPrimary, width: "100%", justifyContent: "center", fontSize: 12, padding: "8px 12px" }} onClick={() => { setCurrentPlan("pro"); addNotification("Upgraded to Pro! Enjoy unlimited videos.", "success"); }} type="button">
                <Icon name="star" size={12} />
                Upgrade to Pro
              </button>
            )}
          </div>
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
