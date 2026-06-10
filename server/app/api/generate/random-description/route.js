// GET /api/generate/random-description
//
// Returns one randomly chosen Simple-mode description so the user can hit the
// dice icon in CreatePanel and seed a fresh prompt. Matches the upstream
// ace-step-ui contract: { description, instrumental, vocalLanguage }.
//
// Upstream called a Gradio prediction endpoint (`/load_random_simple_description`)
// in the ACE-Step Python service. We don't host Gradio in this stack, so we
// instead pick from a curated, hand-written list below. Easy to extend — add
// more entries and the dice button gets richer variety automatically.
import { requireUser, json, handler } from "../../../../lib/api.js";

// Each entry mirrors what the upstream Gradio call used to return:
//   description    — free-form text the user sees in the textarea
//   instrumental   — pre-fills the Instrumental toggle
//   vocalLanguage  — pre-fills the vocal-language picker ('unknown' means "let the model pick")
const SAMPLES = [
  { description: "Lo-fi hip-hop with mellow piano chords, soft rain in the background, late-night studying vibe, 70 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Energetic synthwave with driving bassline, retro 80s feel, neon-soaked night drive, 120 BPM, layered analog pads", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Acoustic folk ballad with fingerpicked guitar and warm male vocals, melancholic and intimate, slow tempo around 75 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Trap with deep 808 bass, hi-hat rolls, dark and moody atmosphere, auto-tuned male vocals, 140 BPM half-time feel", instrumental: false, vocalLanguage: "en" },
  { description: "Ambient cinematic piece with swelling strings and reverb-drenched piano, hopeful but bittersweet, slow tempo", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Upbeat indie pop with bright guitars, catchy hook, female lead vocals, anthemic chorus, 128 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Salsa with brass section, lively percussion, party atmosphere, Spanish male vocals, 100 BPM", instrumental: false, vocalLanguage: "es" },
  { description: "Dreamy shoegaze with washed-out guitars, ethereal female vocals, layered reverb, slow build, 90 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Hard-hitting drum and bass, fast breakbeats, gritty synth bass, 174 BPM, peak-time festival energy", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Smooth jazz with saxophone lead, walking bassline, brushed drums, warm and sophisticated, 90 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Korean R&B with smooth male vocals, lush synths, modern production, romantic mood, 95 BPM", instrumental: false, vocalLanguage: "ko" },
  { description: "Anime-style J-pop with bright synths, fast tempo, female vocals, catchy melodic hook, 160 BPM", instrumental: false, vocalLanguage: "ja" },
  { description: "Reggae with offbeat guitar skanks, deep bass, laid-back groove, male vocals about freedom, 80 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Orchestral epic with full string section, choir, pounding drums, heroic and triumphant, slow build", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Bedroom pop with lo-fi guitars, intimate female vocals, soft drum machine, nostalgic and warm, 85 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Techno with driving four-on-the-floor kick, hypnotic synth loops, industrial atmosphere, 130 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Country rock with twangy guitars, story-telling male vocals, harmonica solo, road-trip energy, 110 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Trap beat instrumental with dark piano melody, 808 bass, sparse hi-hats, perfect for freestyle, 70 BPM half-time", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Future bass with chopped vocal samples, melodic synth lead, big drop, festival-ready, 150 BPM half-time", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Bossa nova with nylon guitar, soft brushed drums, warm Portuguese female vocals, sunny and laid-back, 100 BPM", instrumental: false, vocalLanguage: "pt" },
  { description: "Dark electronic with gritty bass synths, glitchy percussion, dystopian sci-fi vibe, 90 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Pop punk with crunchy guitars, energetic drums, male vocals about teenage angst, anthemic chorus, 170 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Afrobeat with polyrhythmic percussion, funky bass, horn section, infectious groove, 110 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Minimal piano with sparse notes, deep reverb, contemplative and lonely, very slow tempo around 60 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "House music with soulful female vocals, classic disco strings, four-on-the-floor groove, 124 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Chinese traditional fusion with erhu and pipa over modern hip-hop beat, female vocals, 90 BPM", instrumental: false, vocalLanguage: "zh" },
  { description: "Psychedelic rock with fuzzy guitars, swirling organ, dreamy male vocals, trippy outro, 100 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Drill beat with sliding 808s, dark piano melody, gritty UK-style production, 140 BPM half-time", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Christmas pop with sleigh bells, warm strings, cheerful female vocals, festive and uplifting, 110 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Vaporwave with chopped 80s sample, slowed tempo, lo-fi tape hiss, nostalgic shopping-mall vibe, 70 BPM", instrumental: true,  vocalLanguage: "unknown" },
  { description: "Heavy metal with palm-muted riffs, double-kick drums, screaming male vocals, aggressive and fast, 180 BPM", instrumental: false, vocalLanguage: "en" },
  { description: "Children's lullaby with music box, soft strings, gentle hum, peaceful and dreamy, very slow", instrumental: true,  vocalLanguage: "unknown" },
];

export const GET = handler(async (req) => {
  // The upstream contract requires an authenticated user — gate identically so
  // the frontend doesn't need to special-case anonymous flow.
  await requireUser(req);
  const pick = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  return json(pick);
});
