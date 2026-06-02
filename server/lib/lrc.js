// SRT → LRC converter. The ASR pipeline emits SRT cues like:
//   1
//   00:00:14,230 --> 00:00:17,810
//   I was walking down the street
//
// LRC format (used by karaoke players: VLC, Synced Lyrics in Spotify-like
// UIs) wants one line per cue with timestamp inline:
//   [00:14.23]I was walking down the street
//
// We emit centisecond precision (LRC's max). Multi-line cues collapse to
// one line per source line — each gets the same timestamp so the karaoke
// player advances through them as the cue plays.
//
// Tolerant of CR/LF, BOM, and missing trailing blank lines. Throws nothing —
// malformed cues just don't make it into the output.

export function srtToLrc(srt, { title, artist } = {}) {
  if (!srt || typeof srt !== "string") return "";
  // Strip UTF-8 BOM if present; ASR engines sometimes prepend it.
  const cleaned = srt.replace(/^﻿/, "").replace(/\r/g, "");
  const blocks = cleaned.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const lines = [];

  if (title)  lines.push(`[ti:${title}]`);
  if (artist) lines.push(`[ar:${artist}]`);
  lines.push("[by:Myuzika]");

  for (const block of blocks) {
    const blockLines = block.split("\n");
    // Skip the optional numeric index line. Find the timecode line.
    const tcIdx = blockLines.findIndex((l) => /-->/.test(l));
    if (tcIdx === -1) continue;
    const tc = blockLines[tcIdx];
    const m = tc.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
    if (!m) continue;
    const [, hh, mm, ss, ms] = m;
    const totalSeconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
    const stamp = formatLrcTimestamp(totalSeconds);
    const text = blockLines.slice(tcIdx + 1).join("\n").trim();
    if (!text) continue;
    // Multi-line cue → one LRC line per source line, same timestamp.
    for (const t of text.split("\n")) {
      if (t.trim()) lines.push(`${stamp}${t.trim()}`);
    }
  }
  return lines.join("\n") + "\n";
}

// "[mm:ss.xx]" — minutes can exceed 60 (LRC convention is mm:ss even past
// the hour mark, so a 75-minute clip would emit [75:12.34]).
function formatLrcTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  // Two-digit minutes (pad), two-digit seconds.fractional, .xx hundredths.
  const ss = s.toFixed(2).padStart(5, "0"); // "07.34"
  return `[${String(m).padStart(2, "0")}:${ss}]`;
}
