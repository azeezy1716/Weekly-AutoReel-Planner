import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import "./App.css";

const APP_STORAGE_KEY = "weekly-autoreel-planner-v1";
const APP_VERSION = "1.0.0";

const platforms = [
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
] as const;

type Platform = (typeof platforms)[number];

const statuses = ["Not Ready", "Ready", "Posted"] as const;
type Status = (typeof statuses)[number];

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type PostingDay = (typeof days)[number];

type StatusFilter = "All" | Status;
type PlatformFilter = "All" | Platform;

type VideoPlan = {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  previewUrl?: string;
  platform: Platform;
  topic: string;
  day: PostingDay;
  time: string;
  status: Status;
  title: string;
  caption: string;
  description: string;
  hashtags: string;
  bestPostingTime: string;
  musicMood: string;
  musicSearch: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type StoredVideoPlan = Omit<VideoPlan, "previewUrl">;

const postingTimeSuggestions: Record<Platform, string[]> = {
  "YouTube Shorts": ["12 PM EST", "3 PM EST", "6 PM EST", "9 PM EST"],
  TikTok: ["11 AM EST", "2 PM EST", "6 PM EST", "10 PM EST"],
  "Instagram Reels": ["9 AM EST", "12 PM EST", "5 PM EST", "8 PM EST"],
  "Facebook Reels": ["10 AM EST", "1 PM EST", "4 PM EST", "7 PM EST"],
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function cleanFilenameToTopic(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugToHashtag(text: string) {
  const cleaned = text
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  return cleaned ? `#${cleaned}` : "";
}

function getSuggestedTime(platform: Platform, seed: number) {
  const times = postingTimeSuggestions[platform];
  return times[seed % times.length];
}

function getMusicSuggestion(topic: string) {
  const lowerTopic = topic.toLowerCase();

  if (
    lowerTopic.includes("rat") ||
    lowerTopic.includes("chef") ||
    lowerTopic.includes("kitchen") ||
    lowerTopic.includes("cat")
  ) {
    return {
      mood: "funny suspense kitchen jazz",
      search: "sneaky cartoon cooking sound",
    };
  }

  if (
    lowerTopic.includes("football") ||
    lowerTopic.includes("soccer") ||
    lowerTopic.includes("stadium") ||
    lowerTopic.includes("world cup")
  ) {
    return {
      mood: "stadium hype drums",
      search: "football crowd hype beat",
    };
  }

  if (
    lowerTopic.includes("sad") ||
    lowerTopic.includes("alone") ||
    lowerTopic.includes("silent") ||
    lowerTopic.includes("motivation") ||
    lowerTopic.includes("pain")
  ) {
    return {
      mood: "emotional cinematic ambient",
      search: "deep emotional cinematic background",
    };
  }

  if (
    lowerTopic.includes("satisfying") ||
    lowerTopic.includes("rust") ||
    lowerTopic.includes("clean") ||
    lowerTopic.includes("asmr")
  ) {
    return {
      mood: "clean satisfying ASMR",
      search: "satisfying soft ASMR sound",
    };
  }

  return {
    mood: "upbeat cinematic short-form energy",
    search: "upbeat viral vlog background",
  };
}

function generatePostingPack(video: VideoPlan, indexSeed: number): Partial<VideoPlan> {
  const topic = video.topic.trim() || cleanFilenameToTopic(video.filename);
  const bestTime = video.time || getSuggestedTime(video.platform, indexSeed);
  const music = getMusicSuggestion(topic);

  const topicHashtag = slugToHashtag(topic);
  const platformHashtags: Record<Platform, string> = {
    "YouTube Shorts": "#Shorts #YouTubeShorts #ViralShorts",
    TikTok: "#TikTok #ForYou #FYP",
    "Instagram Reels": "#Reels #InstagramReels #ExplorePage",
    "Facebook Reels": "#FacebookReels #ReelsVideo #ShortVideo",
  };

  const title = `${topic} | ${video.platform}`;
  const caption = `This one is worth watching till the end. ${topicHashtag}`;
  const description = `Video topic: ${topic}

Platform: ${video.platform}
Best posting time: ${bestTime}

Manual posting reminder:
Upload the video manually, paste the caption, add the hashtags, choose a matching sound by searching the suggested audio phrase, then post at the scheduled time.`;

  const hashtags = [
    topicHashtag,
    platformHashtags[video.platform],
    "#ShortFormContent",
    "#ViralVideo",
    "#ContentCreator",
  ]
    .filter(Boolean)
    .join(" ");

  const notes = `Manual post only. Do not use copyrighted music automatically. Search this audio phrase inside ${video.platform}, CapCut, or Instagram/TikTok sounds: "${music.search}".`;

  return {
    topic,
    title,
    caption,
    description,
    hashtags,
    bestPostingTime: bestTime,
    musicMood: music.mood,
    musicSearch: music.search,
    notes,
    updatedAt: new Date().toISOString(),
  };
}

function videoToStoredVideo(video: VideoPlan): StoredVideoPlan {
  return {
    id: video.id,
    filename: video.filename,
    fileSize: video.fileSize,
    fileType: video.fileType,
    platform: video.platform,
    topic: video.topic,
    day: video.day,
    time: video.time,
    status: video.status,
    title: video.title,
    caption: video.caption,
    description: video.description,
    hashtags: video.hashtags,
    bestPostingTime: video.bestPostingTime,
    musicMood: video.musicMood,
    musicSearch: video.musicSearch,
    notes: video.notes,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

function convertToCsv(videos: VideoPlan[]) {
  const headers = [
    "filename",
    "fileSize",
    "fileType",
    "platform",
    "topic",
    "day",
    "time",
    "status",
    "title",
    "caption",
    "description",
    "hashtags",
    "bestPostingTime",
    "musicMood",
    "musicSearch",
    "notes",
  ];

  const escapeCsv = (value: string | number) => {
    const stringValue = String(value ?? "");
    return `"${stringValue.replaceAll('"', '""')}"`;
  };

  const rows = videos.map((video) =>
    headers.map((header) => escapeCsv(video[header as keyof VideoPlan] ?? "")).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(filename, blob);
}

function safeTextFilename(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function parseTimeToMinutes(time: string) {
  const match = time.match(/(\d{1,2})\s*(AM|PM)/i);

  if (!match) return 9999;

  let hour = Number(match[1]);
  const period = match[2].toUpperCase();

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return hour * 60;
}

function isPlatform(value: string): value is Platform {
  return platforms.includes(value as Platform);
}

function isStatus(value: string): value is Status {
  return statuses.includes(value as Status);
}

function isPostingDay(value: string): value is PostingDay {
  return days.includes(value as PostingDay);
}

function App() {
  const [videos, setVideos] = useState<VideoPlan[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("All");
  const [copiedMessage, setCopiedMessage] = useState("");
  const hasLoadedStorage = useRef(false);

  useEffect(() => {
    const savedPlan = localStorage.getItem(APP_STORAGE_KEY);

    if (savedPlan) {
      try {
        const parsed = JSON.parse(savedPlan);
        const savedVideos = Array.isArray(parsed?.videos) ? parsed.videos : [];

        const restoredVideos: VideoPlan[] = savedVideos.map((video: StoredVideoPlan, index: number) => {
          const platform = isPlatform(video.platform) ? video.platform : platforms[index % platforms.length];
          const day = isPostingDay(video.day) ? video.day : days[index % days.length];
          const status = isStatus(video.status) ? video.status : "Not Ready";

          return {
            id: video.id || createId(),
            filename: video.filename || `Imported Video ${index + 1}`,
            fileSize: Number(video.fileSize || 0),
            fileType: video.fileType || "video/*",
            platform,
            topic: video.topic || "",
            day,
            time: video.time || getSuggestedTime(platform, index),
            status,
            title: video.title || "",
            caption: video.caption || "",
            description: video.description || "",
            hashtags: video.hashtags || "",
            bestPostingTime: video.bestPostingTime || "",
            musicMood: video.musicMood || "",
            musicSearch: video.musicSearch || "",
            notes: video.notes || "",
            createdAt: video.createdAt || new Date().toISOString(),
            updatedAt: video.updatedAt || new Date().toISOString(),
          };
        });

        setVideos(restoredVideos);
      } catch {
        localStorage.removeItem(APP_STORAGE_KEY);
      }
    }

    hasLoadedStorage.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;

    const savedData = {
      appName: "Weekly AutoReel Planner",
      version: APP_VERSION,
      savedAt: new Date().toISOString(),
      videos: videos.map(videoToStoredVideo),
    };

    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(savedData, null, 2));
  }, [videos]);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesStatus = statusFilter === "All" || video.status === statusFilter;
      const matchesPlatform = platformFilter === "All" || video.platform === platformFilter;

      return matchesStatus && matchesPlatform;
    });
  }, [videos, statusFilter, platformFilter]);

  const stats = useMemo(() => {
    const readyVideos = videos.filter((video) => video.status === "Ready").length;
    const postedVideos = videos.filter((video) => video.status === "Posted").length;
    const remainingVideos = videos.filter((video) => video.status !== "Posted").length;

    const videosPerPlatform = platforms.map((platform) => ({
      platform,
      count: videos.filter((video) => video.platform === platform).length,
    }));

    return {
      totalVideos: videos.length,
      readyVideos,
      postedVideos,
      remainingVideos,
      videosPerPlatform,
    };
  }, [videos]);

  const calendarVideos = useMemo(() => {
    return days.map((day) => ({
      day,
      videos: videos
        .filter((video) => video.day === day)
        .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)),
    }));
  }, [videos]);

  const updateVideo = (id: string, updates: Partial<VideoPlan>) => {
    setVideos((currentVideos) =>
      currentVideos.map((video) =>
        video.id === id
          ? {
              ...video,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : video
      )
    );
  };

  const handleUploadVideos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));

    const newVideos: VideoPlan[] = videoFiles.map((file, index) => {
      const globalIndex = videos.length + index;
      const platform = platforms[globalIndex % platforms.length];
      const day = days[globalIndex % days.length];
      const time = getSuggestedTime(platform, globalIndex);
      const now = new Date().toISOString();

      return {
        id: createId(),
        filename: file.name,
        fileSize: file.size,
        fileType: file.type || "video/*",
        previewUrl: URL.createObjectURL(file),
        platform,
        topic: cleanFilenameToTopic(file.name),
        day,
        time,
        status: "Not Ready",
        title: "",
        caption: "",
        description: "",
        hashtags: "",
        bestPostingTime: time,
        musicMood: "",
        musicSearch: "",
        notes: "",
        createdAt: now,
        updatedAt: now,
      };
    });

    setVideos((currentVideos) => [...currentVideos, ...newVideos]);
    event.currentTarget.value = "";
  };

  const generatePackForVideo = (id: string) => {
    setVideos((currentVideos) =>
      currentVideos.map((video, index) =>
        video.id === id
          ? {
              ...video,
              ...generatePostingPack(video, index),
            }
          : video
      )
    );
  };

  const generateWeeklyPlan = () => {
    setVideos((currentVideos) =>
      currentVideos.map((video, index) => {
        const day = days[index % days.length];
        const time = getSuggestedTime(video.platform, index);

        const updatedVideo: VideoPlan = {
          ...video,
          day,
          time,
          bestPostingTime: time,
        };

        return {
          ...updatedVideo,
          ...generatePostingPack(updatedVideo, index),
        };
      })
    );
  };

  const removeVideo = (id: string) => {
    setVideos((currentVideos) => {
      const videoToRemove = currentVideos.find((video) => video.id === id);

      if (videoToRemove?.previewUrl) {
        URL.revokeObjectURL(videoToRemove.previewUrl);
      }

      return currentVideos.filter((video) => video.id !== id);
    });
  };

  const copyText = async (label: string, text: string) => {
    if (!text.trim()) {
      setCopiedMessage(`${label} is empty`);
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopiedMessage(`${label} copied`);

    window.setTimeout(() => {
      setCopiedMessage("");
    }, 1800);
  };

  const exportJson = () => {
    const data = {
      appName: "Weekly AutoReel Planner",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      videos: videos.map(videoToStoredVideo),
    };

    downloadTextFile(
      "weekly-plan.json",
      JSON.stringify(data, null, 2),
      "application/json"
    );
  };

  const exportCsv = () => {
    downloadTextFile("weekly-plan.csv", convertToCsv(videos), "text/csv");
  };

  const exportZip = async () => {
    const zip = new JSZip();
    const storedVideos = videos.map(videoToStoredVideo);

    const jsonData = {
      appName: "Weekly AutoReel Planner",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      videos: storedVideos,
    };

    zip.file("weekly-plan.json", JSON.stringify(jsonData, null, 2));
    zip.file("weekly-plan.csv", convertToCsv(videos));

    const folder = zip.folder("video-posting-packs");

    videos.forEach((video, index) => {
      const textContent = `Weekly AutoReel Planner - Video Posting Pack

Video Number: ${index + 1}
Filename: ${video.filename}
Platform: ${video.platform}
Topic/Niche: ${video.topic}
Posting Day: ${video.day}
Posting Time: ${video.time}
Status: ${video.status}

Title:
${video.title}

Caption:
${video.caption}

Description:
${video.description}

Hashtags:
${video.hashtags}

Best Posting Time:
${video.bestPostingTime}

Music Mood:
${video.musicMood}

Sound Search:
${video.musicSearch}

Manual Posting Notes:
${video.notes}
`;

      folder?.file(`${index + 1}-${safeTextFilename(video.filename)}.txt`, textContent);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("weekly-autoreel-plan.zip", blob);
  };

  const importJsonPlan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedVideos = Array.isArray(parsed?.videos) ? parsed.videos : [];

      const restoredVideos: VideoPlan[] = importedVideos.map(
        (video: StoredVideoPlan, index: number) => {
          const platform = isPlatform(video.platform)
            ? video.platform
            : platforms[index % platforms.length];

          const day = isPostingDay(video.day) ? video.day : days[index % days.length];

          const status = isStatus(video.status) ? video.status : "Not Ready";

          return {
            id: video.id || createId(),
            filename: video.filename || `Imported Video ${index + 1}`,
            fileSize: Number(video.fileSize || 0),
            fileType: video.fileType || "video/*",
            platform,
            topic: video.topic || "",
            day,
            time: video.time || getSuggestedTime(platform, index),
            status,
            title: video.title || "",
            caption: video.caption || "",
            description: video.description || "",
            hashtags: video.hashtags || "",
            bestPostingTime: video.bestPostingTime || "",
            musicMood: video.musicMood || "",
            musicSearch: video.musicSearch || "",
            notes: video.notes || "",
            createdAt: video.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      );

      setVideos(restoredVideos);
    } catch {
      alert("Import failed. Make sure you selected a valid weekly-plan.json file.");
    }

    event.currentTarget.value = "";
  };

  const clearPlanner = () => {
    const confirmed = window.confirm(
      "Clear the whole planner? This removes saved metadata from this browser."
    );

    if (!confirmed) return;

    videos.forEach((video) => {
      if (video.previewUrl) URL.revokeObjectURL(video.previewUrl);
    });

    setVideos([]);
    localStorage.removeItem(APP_STORAGE_KEY);
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Weekly AutoReel Planner</p>
          <h1>Weekly Video Planner</h1>
          <p className="hero-text">
            Upload your weekly videos, prepare posting packs, schedule manually,
            export your plan, and keep everything saved in your browser.
          </p>
        </div>

        <div className="hero-actions">
          <label className="primary-upload">
            Select Weekly Videos
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handleUploadVideos}
            />
          </label>

          <button type="button" onClick={generateWeeklyPlan}>
            Generate Weekly Plan
          </button>
        </div>
      </section>

      <section className="toolbar">
        <div className="toolbar-group">
          <button type="button" onClick={exportCsv} disabled={!videos.length}>
            Export CSV
          </button>

          <button type="button" onClick={exportJson} disabled={!videos.length}>
            Export JSON
          </button>

          <button type="button" onClick={exportZip} disabled={!videos.length}>
            Export ZIP
          </button>
        </div>

        <div className="toolbar-group">
          <label className="import-button">
            Import JSON
            <input type="file" accept="application/json" onChange={importJsonPlan} />
          </label>

          <button type="button" className="danger-button" onClick={clearPlanner}>
            Clear Planner
          </button>
        </div>
      </section>

      {copiedMessage && <div className="copy-toast">{copiedMessage}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total Videos</span>
          <strong>{stats.totalVideos}</strong>
        </article>

        <article className="stat-card">
          <span>Ready Videos</span>
          <strong>{stats.readyVideos}</strong>
        </article>

        <article className="stat-card">
          <span>Posted Videos</span>
          <strong>{stats.postedVideos}</strong>
        </article>

        <article className="stat-card">
          <span>Remaining Videos</span>
          <strong>{stats.remainingVideos}</strong>
        </article>
      </section>

      <section className="platform-stats">
        {stats.videosPerPlatform.map((item) => (
          <div key={item.platform}>
            <span>{item.platform}</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>

      <section className="filters">
        <div>
          <label>Status Filter</label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="All">All</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Platform Filter</label>
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value as PlatformFilter)}
          >
            <option value="All">All</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="content-grid">
        <div className="video-list">
          <div className="section-heading">
            <h2>Video List</h2>
            <p>{filteredVideos.length} showing</p>
          </div>

          {!videos.length && (
            <div className="empty-state">
              <h3>No videos yet</h3>
              <p>Select your weekly videos to start planning.</p>
            </div>
          )}

          {filteredVideos.map((video) => (
            <article className="video-card" key={video.id}>
              <div className="video-preview">
                {video.previewUrl ? (
                  <video src={video.previewUrl} controls />
                ) : (
                  <div className="missing-preview">
                    <span>No preview after refresh</span>
                    <small>Metadata is saved. Browser video files are not.</small>
                  </div>
                )}
              </div>

              <div className="video-card-body">
                <div className="video-card-header">
                  <div>
                    <h3>{video.filename}</h3>
                    <p>
                      {formatFileSize(video.fileSize)} · {video.fileType || "video"}
                    </p>
                  </div>

                  <span className={`status-pill status-${video.status.replace(" ", "-").toLowerCase()}`}>
                    {video.status}
                  </span>
                </div>

                <div className="form-grid">
                  <label>
                    Platform
                    <select
                      value={video.platform}
                      onChange={(event) => {
                        const platform = event.target.value as Platform;
                        const seed = days.indexOf(video.day);

                        updateVideo(video.id, {
                          platform,
                          time: getSuggestedTime(platform, seed),
                          bestPostingTime: getSuggestedTime(platform, seed),
                        });
                      }}
                    >
                      {platforms.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Topic/Niche
                    <input
                      value={video.topic}
                      onChange={(event) =>
                        updateVideo(video.id, { topic: event.target.value })
                      }
                      placeholder="Example: Tiny Chef Rat Episode 1"
                    />
                  </label>

                  <label>
                    Posting Day
                    <select
                      value={video.day}
                      onChange={(event) =>
                        updateVideo(video.id, { day: event.target.value as PostingDay })
                      }
                    >
                      {days.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Posting Time
                    <input
                      value={video.time}
                      onChange={(event) =>
                        updateVideo(video.id, {
                          time: event.target.value,
                          bestPostingTime: event.target.value,
                        })
                      }
                      placeholder="Example: 6 PM EST"
                    />
                  </label>

                  <label>
                    Status
                    <select
                      value={video.status}
                      onChange={(event) =>
                        updateVideo(video.id, { status: event.target.value as Status })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="pack-box">
                  <label>
                    Title
                    <input
                      value={video.title}
                      onChange={(event) =>
                        updateVideo(video.id, { title: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Caption
                    <textarea
                      value={video.caption}
                      onChange={(event) =>
                        updateVideo(video.id, { caption: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      value={video.description}
                      onChange={(event) =>
                        updateVideo(video.id, { description: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Hashtags
                    <textarea
                      value={video.hashtags}
                      onChange={(event) =>
                        updateVideo(video.id, { hashtags: event.target.value })
                      }
                    />
                  </label>

                  <div className="mini-grid">
                    <label>
                      Best Posting Time
                      <input
                        value={video.bestPostingTime}
                        onChange={(event) =>
                          updateVideo(video.id, {
                            bestPostingTime: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Music Mood
                      <input
                        value={video.musicMood}
                        onChange={(event) =>
                          updateVideo(video.id, { musicMood: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label>
                    TikTok/CapCut/Instagram Sound Search
                    <input
                      value={video.musicSearch}
                      onChange={(event) =>
                        updateVideo(video.id, { musicSearch: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Manual Posting Notes
                    <textarea
                      value={video.notes}
                      onChange={(event) =>
                        updateVideo(video.id, { notes: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="button-grid">
                  <button type="button" onClick={() => generatePackForVideo(video.id)}>
                    Generate Pack
                  </button>

                  <button type="button" onClick={() => copyText("Title", video.title)}>
                    Copy Title
                  </button>

                  <button type="button" onClick={() => copyText("Caption", video.caption)}>
                    Copy Caption
                  </button>

                  <button
                    type="button"
                    onClick={() => copyText("Description", video.description)}
                  >
                    Copy Description
                  </button>

                  <button
                    type="button"
                    onClick={() => copyText("Hashtags", video.hashtags)}
                  >
                    Copy Hashtags
                  </button>

                  <button
                    type="button"
                    onClick={() => copyText("Music Search", video.musicSearch)}
                  >
                    Copy Music Search
                  </button>

                  <button
                    type="button"
                    onClick={() => updateVideo(video.id, { status: "Ready" })}
                  >
                    Mark Ready
                  </button>

                  <button
                    type="button"
                    onClick={() => updateVideo(video.id, { status: "Posted" })}
                  >
                    Mark Posted
                  </button>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => removeVideo(video.id)}
                  >
                    Remove Video
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="calendar-panel">
          <div className="section-heading">
            <h2>Weekly Calendar</h2>
            <p>Manual posting schedule</p>
          </div>

          <div className="calendar-list">
            {calendarVideos.map((group) => (
              <article className="calendar-day" key={group.day}>
                <h3>{group.day}</h3>

                {!group.videos.length && <p className="no-schedule">No videos scheduled</p>}

                {group.videos.map((video) => (
                  <div className="calendar-video" key={video.id}>
                    <strong>{video.time}</strong>
                    <span>{video.platform}</span>
                    <p>{video.topic || video.filename}</p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;