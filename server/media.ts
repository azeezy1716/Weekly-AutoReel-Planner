import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const router = express.Router();

export const DATA_DIR = path.join(process.cwd(), "server", "data");
export const MUSIC_DIR = path.join(DATA_DIR, "music");
export const PROCESSED_DIR = path.join(DATA_DIR, "processed");
const TEMP_DIR = path.join(DATA_DIR, "temp");

fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(PROCESSED_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const musicUpload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: 80 * 1024 * 1024,
  },
});

const videoUpload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
});

function safeFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const base = path
    .basename(filename, ext)
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);

  return `${base || "file"}-${Date.now()}${ext}`;
}

function escapeDrawText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, "\\n");
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });
  });
}

async function getVideoDurationSeconds(filePath: string) {
  const ffprobePath = ffprobeStatic.path;

  return new Promise<number>((resolve) => {
    const child = spawn(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      {
        windowsHide: true,
      }
    );

    let output = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", () => {
      const duration = Number.parseFloat(output.trim());
      resolve(Number.isFinite(duration) ? duration : 0);
    });

    child.on("error", () => {
      resolve(0);
    });
  });
}

function buildCaptionFilter(captionText: string) {
  const text = escapeDrawText(captionText.trim());

  return `drawtext=text='${text}':fontcolor=white:fontsize=46:line_spacing=10:box=1:boxcolor=black@0.58:boxborderw=22:x=(w-text_w)/2:y=h-(text_h*2)-90`;
}

function buildMusicFilter(volume: number, duration: number, fadeIn: number, fadeOut: number) {
  const safeVolume = Math.min(Math.max(volume, 0), 1);
  const safeFadeIn = Math.max(fadeIn, 0);
  const safeFadeOut = Math.max(fadeOut, 0);

  let filter = `volume=${safeVolume}`;

  if (safeFadeIn > 0) {
    filter += `,afade=t=in:st=0:d=${safeFadeIn}`;
  }

  if (safeFadeOut > 0 && duration > safeFadeOut) {
    const fadeOutStart = Math.max(duration - safeFadeOut, 0);
    filter += `,afade=t=out:st=${fadeOutStart}:d=${safeFadeOut}`;
  }

  return filter;
}

function isAudioFile(filename: string) {
  return [".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(
    path.extname(filename).toLowerCase()
  );
}

function isVideoFile(filename: string) {
  return [".mp4", ".mov", ".mkv", ".webm"].includes(
    path.extname(filename).toLowerCase()
  );
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mediaEngine: "running",
    ffmpeg: Boolean(ffmpegPath),
    musicFolder: MUSIC_DIR,
    processedFolder: PROCESSED_DIR,
  });
});

router.get("/music", (_req, res) => {
  const tracks = fs
    .readdirSync(MUSIC_DIR)
    .filter(isAudioFile)
    .map((filename) => {
      const filePath = path.join(MUSIC_DIR, filename);
      const stats = fs.statSync(filePath);

      return {
        filename,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };
    });

  res.json({
    tracks,
  });
});

router.post("/music", musicUpload.single("music"), (req, res) => {
  const uploadedFile = req.file;

  try {
    if (!uploadedFile) {
      res.status(400).json({ error: "Missing music file." });
      return;
    }

    if (!isAudioFile(uploadedFile.originalname)) {
      fs.unlinkSync(uploadedFile.path);
      res.status(400).json({
        error: "Use an audio file: mp3, wav, m4a, aac, or ogg.",
      });
      return;
    }

    const finalFilename = safeFilename(uploadedFile.originalname);
    const finalPath = path.join(MUSIC_DIR, finalFilename);

    fs.renameSync(uploadedFile.path, finalPath);

    res.json({
      ok: true,
      track: {
        filename: finalFilename,
        size: fs.statSync(finalPath).size,
      },
    });
  } catch (error) {
    if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Music upload failed.",
    });
  }
});

router.delete("/music/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(MUSIC_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Music track not found." });
    return;
  }

  fs.unlinkSync(filePath);

  res.json({
    ok: true,
  });
});

router.post("/process", videoUpload.single("video"), async (req, res) => {
  const uploadedVideo = req.file;

  try {
    if (!ffmpegPath) {
      res.status(500).json({ error: "FFmpeg binary was not found." });
      return;
    }

    if (!uploadedVideo) {
      res.status(400).json({ error: "Missing video file." });
      return;
    }

    if (!isVideoFile(uploadedVideo.originalname)) {
      fs.unlinkSync(uploadedVideo.path);
      res.status(400).json({
        error: "Use a video file: mp4, mov, mkv, or webm.",
      });
      return;
    }

    const captionText = String(req.body.captionText || "").trim();
    const musicFilename = path.basename(String(req.body.musicFilename || "").trim());
    const musicVolume = Number(req.body.musicVolume || 0.2);
    const fadeIn = Number(req.body.fadeIn || 1.5);
    const fadeOut = Number(req.body.fadeOut || 1.5);

    if (!captionText && !musicFilename) {
      res.status(400).json({
        error: "Add caption text, select music, or both.",
      });
      return;
    }

    const outputFilename = safeFilename(
      uploadedVideo.originalname.replace(/\.[^/.]+$/, "-processed.mp4")
    );

    const outputPath = path.join(PROCESSED_DIR, outputFilename);
    const duration = await getVideoDurationSeconds(uploadedVideo.path);

    const hasCaption = Boolean(captionText);
    const hasMusic = Boolean(musicFilename);

    if (hasMusic) {
      const musicPath = path.join(MUSIC_DIR, musicFilename);

      if (!fs.existsSync(musicPath)) {
        res.status(404).json({ error: "Selected music file was not found." });
        return;
      }

      const musicFilter = buildMusicFilter(musicVolume, duration, fadeIn, fadeOut);
      const captionFilter = hasCaption ? buildCaptionFilter(captionText) : "null";

      const withOriginalAudioArgs = [
        "-y",
        "-i",
        uploadedVideo.path,
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        `[0:v]${captionFilter}[v];[1:a]${musicFilter}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ];

      const musicOnlyAudioArgs = [
        "-y",
        "-i",
        uploadedVideo.path,
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        `[0:v]${captionFilter}[v];[1:a]${musicFilter}[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ];

      try {
        await runCommand(ffmpegPath, withOriginalAudioArgs);
      } catch {
        await runCommand(ffmpegPath, musicOnlyAudioArgs);
      }
    } else {
      const captionFilter = buildCaptionFilter(captionText);

      await runCommand(ffmpegPath, [
        "-y",
        "-i",
        uploadedVideo.path,
        "-vf",
        captionFilter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    }

    res.json({
      ok: true,
      processed: {
        filename: outputFilename,
        url: `/processed/${outputFilename}`,
        fullUrl: `http://localhost:${process.env.SERVER_PORT || 4000}/processed/${outputFilename}`,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Video processing failed.",
    });
  } finally {
    if (uploadedVideo?.path && fs.existsSync(uploadedVideo.path)) {
      fs.unlinkSync(uploadedVideo.path);
    }
  }
});

export default router;