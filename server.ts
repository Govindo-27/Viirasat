import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.resolve(process.cwd(), "data");
const CONTRIBUTIONS_FILE = path.join(DATA_DIR, "contributions.json");
const REGIONAL_TRANSLATIONS_FILE = path.join(DATA_DIR, "regional-translations.json");
const AUDIO_CACHE_DIR = path.resolve(DATA_DIR, "audio-cache");

if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

// Supported regional languages with native typography and icons
const REGIONAL_LANGUAGES = [
  { id: "hindi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", description: "मानक हिन्दी" },
  { id: "bhojpuri", name: "Bhojpuri", nativeName: "भोजपुरी", flag: "🌾", description: "भोजपुरिया लोक-कंठ" },
  { id: "kashmiri", name: "Kashmiri", nativeName: "कॉशुर (كٲशُر)", flag: "🏔️", description: "कश्मीरी वादीक बोली" },
  { id: "nagpuri", name: "Nagpuri", nativeName: "नागपुरी / सादरी", flag: "🌿", description: "छोटानागपुरिया सादरी" },
  { id: "english", name: "English", nativeName: "English", flag: "🌐", description: "Scholarly English" },
  { id: "maithili", name: "Maithili", nativeName: "मैथिली", flag: "📜", description: "मिथिलांचल भाषा" },
  { id: "awadhi", name: "Awadhi", nativeName: "अवधी", flag: "🪔", description: "अवध लोक शैली" },
  { id: "bengali", name: "Bengali", nativeName: "বাংলা", flag: "🌊", description: "ঐতিহ্যবাহী বাংলা" },
];

app.use(express.json({ limit: "5mb" }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper to read contributions
function loadContributions(): any[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(CONTRIBUTIONS_FILE)) {
      const raw = fs.readFileSync(CONTRIBUTIONS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error reading contributions:", err);
  }
  return [];
}

// Helper to persist contributions
function saveContributions(items: any[]): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONTRIBUTIONS_FILE, JSON.stringify(items, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error saving contributions:", err);
    return false;
  }
}

// Unified Gemini AI curation
async function generateCuration(
  title: string,
  originalText: string,
  language: string,
  category: string,
  region: string
): Promise<{ summary: string; tags: string[]; englishTranslation: string }> {
  const prompt = `You are the scholarly AI Heritage Curator for "Virasat" (tagline: "Every tradition deserves a tomorrow").
Your duty is to carefully document community traditions with deep cultural respect and linguistic precision without inventing facts.

TRADITION DETAILS:
- Title: ${title}
- Original Language: ${language || "Unknown"}
- Category: ${category || "General Heritage"}
- Region: ${region || "Unspecified"}

ORIGINAL TEXT:
"""
${originalText}
"""

Please output valid JSON matching this schema:
{
  "summary": "A concise 2-3 sentence curatorial summary highlighting the core practice, community context, and cultural significance.",
  "tags": ["3 to 5 specific, informative cultural tags, e.g. 'Folk Hydrology', 'Oral Mnemonic'"],
  "englishTranslation": "A faithful, sensitive English translation preserving poetic cadence and technical heritage vocabulary. If original is already English, provide a refined editorial reading."
}

Return ONLY valid JSON. Do not wrap in markdown or backticks.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an AI Cultural Heritage Curator. Output valid raw JSON only.",
        temperature: 0.2,
      },
    });

    let raw = (response.text || "").trim();
    if (raw.startsWith("```json")) raw = raw.replace(/^```json/, "").replace(/```$/, "").trim();
    else if (raw.startsWith("```")) raw = raw.replace(/^```/, "").replace(/```$/, "").trim();

    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary || "Traditional cultural record preserved in the Virasat archive.",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [category, language, "Cultural Heritage"],
      englishTranslation: parsed.englishTranslation || originalText,
    };
  } catch (err: any) {
    console.warn("AI Curation error, providing baseline:", err.message);
    const firstSentence = originalText.split(".")[0] || originalText.slice(0, 100);
    return {
      summary: `Traditional ${category.toLowerCase()} preserved in ${language} from ${region || "oral memory"}. ${firstSentence}.`,
      tags: [category, language, region ? region.split(",")[0].trim() : "Heritage"],
      englishTranslation: originalText,
    };
  }
}

// API Routes

// 1. Get all contributions
app.get("/api/contributions", (req: Request, res: Response) => {
  const { q, category, language } = req.query;
  let items = loadContributions();

  if (category && category !== "All") {
    items = items.filter(
      (item) => item.category && item.category.toLowerCase() === String(category).toLowerCase()
    );
  }

  if (language && language !== "All") {
    items = items.filter(
      (item) => item.language && item.language.toLowerCase().includes(String(language).toLowerCase())
    );
  }

  if (q && String(q).trim() !== "") {
    const term = String(q).toLowerCase();
    items = items.filter((item) => {
      const titleMatch = item.title?.toLowerCase().includes(term);
      const textMatch = item.originalText?.toLowerCase().includes(term);
      const summaryMatch = item.curatorNotes?.summary?.toLowerCase().includes(term);
      const regionMatch = item.region?.toLowerCase().includes(term);
      const tagsMatch = item.curatorNotes?.tags?.some((t: string) => t.toLowerCase().includes(term));
      const transMatch = item.curatorNotes?.englishTranslation?.toLowerCase().includes(term);
      return titleMatch || textMatch || summaryMatch || regionMatch || tagsMatch || transMatch;
    });
  }

  res.json({ success: true, count: items.length, data: items });
});

// 2. Get single contribution by ID
app.get("/api/contributions/:id", (req: Request, res: Response) => {
  const items = loadContributions();
  const match = items.find((item) => item.id === req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, error: "Tradition entry not found" });
  }
  res.json({ success: true, data: match });
});

// 3. AI Heritage Curator: on-demand preview
app.post("/api/curate", async (req: Request, res: Response) => {
  const { title, originalText, language, category, region } = req.body;

  if (!title || !originalText) {
    return res.status(400).json({ success: false, error: "Title and original text are required." });
  }

  try {
    const curation = await generateCuration(
      title.trim(),
      originalText.trim(),
      language || "Unknown",
      category || "Stories",
      region || ""
    );

    res.json({
      success: true,
      data: {
        summary: curation.summary,
        tags: curation.tags,
        englishTranslation: curation.englishTranslation,
        isAiCurated: true,
        modelUsed: "Virasat AI Heritage Curator",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to curate tradition" });
  }
});

// 4. Save new contribution
app.post("/api/contributions", async (req: Request, res: Response) => {
  const {
    title,
    originalLanguage,
    category,
    region,
    originalText,
    contributorName,
    consentGiven,
    curatorNotes,
    audioSource,
  } = req.body;

  if (!title || typeof title !== "string" || title.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Title must be at least 3 characters long." });
  }
  if (!originalLanguage || typeof originalLanguage !== "string") {
    return res.status(400).json({ success: false, error: "Original language is required." });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ success: false, error: "Category is required." });
  }
  if (!originalText || typeof originalText !== "string" || originalText.trim().length < 15) {
    return res.status(400).json({
      success: false,
      error: "Original tradition text must be at least 15 characters long.",
    });
  }
  if (consentGiven !== true) {
    return res.status(400).json({
      success: false,
      error: "Community consent acknowledgment is required to preserve traditions.",
    });
  }

  const items = loadContributions();
  const nextNum = items.length + 1;
  const newId = `VIR-2026-${String(nextNum).padStart(3, "0")}`;

  let finalCuratorNotes = curatorNotes;
  if (!finalCuratorNotes || !finalCuratorNotes.summary) {
    const generated = await generateCuration(
      title.trim(),
      originalText.trim(),
      originalLanguage.trim(),
      category.trim(),
      region ? region.trim() : ""
    );
    finalCuratorNotes = {
      summary: generated.summary,
      tags: generated.tags,
      englishTranslation: generated.englishTranslation,
      generatedAt: new Date().toISOString(),
      model: "Virasat AI Heritage Curator",
      isAiCurated: true,
    };
  }

  const record = {
    id: newId,
    title: title.trim(),
    category: category.trim(),
    language: originalLanguage.trim(),
    region: region ? region.trim() : "Unspecified Region",
    contributorName: contributorName && contributorName.trim() ? contributorName.trim() : "Community Custodian",
    datePreserved: new Date().toISOString().split("T")[0],
    originalText: originalText.trim(),
    consentGiven: true,
    verifiedStatus: "Unverified Community Contribution",
    curatorNotes: finalCuratorNotes,
    audioSource: audioSource || null,
  };

  items.unshift(record);
  saveContributions(items);

  res.status(201).json({ success: true, data: record });
});

// 5. Ask the Archive (Strict RAG with Source Citations & Non-hallucination guard)
app.post("/api/ask", async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ success: false, error: "A question is required." });
  }

  const items = loadContributions();

  const archiveDigest = items
    .map(
      (it) => `
[ENTRY #${it.id}]
Title: ${it.title}
Category: ${it.category}
Language: ${it.language}
Region: ${it.region}
Curator Summary: ${it.curatorNotes?.summary || "N/A"}
English Translation / Content: ${it.curatorNotes?.englishTranslation || it.originalText}
Tags: ${(it.curatorNotes?.tags || []).join(", ")}
`
    )
    .join("\n--------------------\n");

  const prompt = `You are the scholarly archive curator for Virasat ("Every tradition deserves a tomorrow").
Users ask questions about our preserved traditions, oral histories, folk practices, and crafts.

MANDATORY INSTRUCTIONS:
1. Answer the question using ONLY the content provided in the VIRASAT ARCHIVE CATALOG below.
2. Cite the source entry IDs and titles for all facts mentioned, for example: "[VIR-2026-001: The Song of the Kutch Monsoon Weavers]".
3. IF the user's question cannot be answered using the entries currently in the archive catalog, you MUST explicitly state:
"This information is not present in the Virasat cultural archive."
4. Do NOT invent traditions, recipes, rituals, or cultural history not contained in the catalog.
5. Emphasize that all records are unverified community contributions.

VIRASAT ARCHIVE CATALOG:
${archiveDigest}

USER QUESTION:
"${question.trim()}"

Provide an articulate, respectful curatorial answer:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "You are an AI Heritage Curator. Answer only using the provided Virasat archive catalog. Never invent facts. Cite source entry IDs.",
        temperature: 0.2,
      },
    });

    const answer = response.text || "";

    const citedEntries: string[] = [];
    for (const item of items) {
      if (answer.includes(item.id) || answer.includes(item.title)) {
        citedEntries.push(item.id);
      }
    }

    res.json({
      success: true,
      answer: answer,
      citedEntries: citedEntries,
      modelUsed: "Virasat AI Heritage Curator",
      archiveEntriesCount: items.length,
    });
  } catch (err: any) {
    console.error("Ask Archive error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to query the archive",
    });
  }
});

// 6. Status endpoint
app.get("/api/status", (_req: Request, res: Response) => {
  const items = loadContributions();
  res.json({
    status: "online",
    archiveEntries: items.length,
    storage: "JSON prototype (data/contributions.json)",
    aiCurator: "Cloud AI Heritage Engine (Zero Setup Required)",
  });
});

// ==========================================
// 7. High-Quality AI Voice Synthesis Service
// ==========================================

const ELEVENLABS_VOICES = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel (Storyteller)",
    gender: "Female",
    description: "Warm, natural cadence, ideal for living traditions & oral history",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni (Chronicler)",
    gender: "Male",
    description: "Resonant, scholarly, and clear for archival recitations",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella (Folk Voice)",
    gender: "Female",
    description: "Expressive and evocative for rituals, chants, and song mnemonics",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel (Archivist)",
    gender: "Male",
    description: "Authoritative documentary voice for historical preservation",
  },
];

/**
 * Procedural harmonic chime generator as a graceful offline fallback.
 * Produces a genuine, valid 16-bit PCM WAV buffer.
 */
function generateProceduralNarrationWav(): Buffer {
  const sampleRate = 22050;
  const durationSec = 4.0;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Acoustic tanpura/bell harmonics (D - A - D - F# chord)
  const notes = [146.83, 220.0, 293.66, 369.99];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    notes.forEach((freq, idx) => {
      const decay = Math.exp(-t * (0.8 + idx * 0.3));
      sample += Math.sin(2 * Math.PI * freq * t) * decay * 0.22;
    });
    const intSample = Math.max(-32767, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

/**
 * Synthesize speech via ElevenLabs Text-to-Speech API
 */
async function synthesizeWithElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errText}`);
  }

  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Synthesize speech via Gemini 3.8 Flash Lite TTS (Human-like oral voice, 24kHz studio WAV)
 */
async function synthesizeWithGeminiTTS(
  text: string,
  language = "en",
  voiceName = "Kore"
): Promise<Buffer> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const clean = text.replace(/[\r\n]+/g, " ").trim();
  const truncated = clean.length > 800 ? clean.slice(0, 800) + "..." : clean;

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-lite-tts",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: truncated,
            speechMetadata: {
              style: "Warm, respectful Indian cultural oral storyteller, natural human breathing and pauses, emotive oral tradition cadence",
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("Gemini TTS returned no audio data");
  }

  return Buffer.from(base64Audio, "base64");
}

/**
 * Get or synthesize audio buffer with disk caching
 */
async function getOrSynthesizeSpeech(
  text: string,
  voiceId = "21m00Tcm4TlvDq8ikWAM",
  customKey?: string,
  language = "en"
): Promise<{ buffer: Buffer; mimeType: string; engine: "elevenlabs" | "gemini" | "ambient"; cachePath: string }> {
  const normalizedText = text.trim();
  const hashKey = crypto
    .createHash("sha256")
    .update(`v2_${voiceId}_${language}_${normalizedText}`)
    .digest("hex");

  const wavPath = path.join(AUDIO_CACHE_DIR, `${hashKey}.wav`);
  const mp3Path = path.join(AUDIO_CACHE_DIR, `${hashKey}.mp3`);

  // Check cache
  if (fs.existsSync(wavPath)) {
    const buffer = fs.readFileSync(wavPath);
    return { buffer, mimeType: "audio/wav", engine: "gemini", cachePath: wavPath };
  }
  if (fs.existsSync(mp3Path)) {
    const buffer = fs.readFileSync(mp3Path);
    return { buffer, mimeType: "audio/mpeg", engine: "elevenlabs", cachePath: mp3Path };
  }

  // Attempt 1: ElevenLabs API (User-supplied key or Server ELEVENLABS_API_KEY)
  const elevenKey = customKey && customKey.trim() ? customKey.trim() : process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    try {
      console.log(`🎙️ Synthesizing narration with ElevenLabs (Voice: ${voiceId})...`);
      const buffer = await synthesizeWithElevenLabs(normalizedText, voiceId, elevenKey);
      fs.writeFileSync(mp3Path, buffer);
      return { buffer, mimeType: "audio/mpeg", engine: "elevenlabs", cachePath: mp3Path };
    } catch (err: any) {
      console.warn("ElevenLabs synthesis warning, attempting Gemini TTS fallback:", err.message);
    }
  }

  // Attempt 2: Gemini 3.8 Flash Lite TTS (Human-sounding studio-grade audio)
  try {
    console.log(`🎙️ Synthesizing narration with Gemini TTS (${language})...`);
    let geminiVoice = "Kore";
    if (voiceId.includes("Antoni") || voiceId.includes("ErX")) geminiVoice = "Fenrir";
    else if (voiceId.includes("Bella") || voiceId.includes("EXAV")) geminiVoice = "Puck";
    else if (voiceId.includes("Daniel") || voiceId.includes("onw")) geminiVoice = "Zephyr";
    else if (language === "hindi" || language === "hi") geminiVoice = "Puck";

    const buffer = await synthesizeWithGeminiTTS(normalizedText, language, geminiVoice);
    fs.writeFileSync(wavPath, buffer);
    return { buffer, mimeType: "audio/wav", engine: "gemini", cachePath: wavPath };
  } catch (err: any) {
    console.warn("Gemini TTS warning, attempting procedural acoustic fallback:", err.message);
  }

  // Attempt 3: Procedural resonant harmonic audio fallback (Tanpura & Bell Harmonics)
  console.log("🎙️ Using procedural acoustic harmonic audio fallback...");
  const buffer = generateProceduralNarrationWav();
  fs.writeFileSync(wavPath, buffer);
  return { buffer, mimeType: "audio/wav", engine: "ambient", cachePath: wavPath };
}

// 7a. Get Voice Configuration & Available Narrators
app.get("/api/voice/info", (_req: Request, res: Response) => {
  res.json({
    elevenlabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    neuralConfigured: true,
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    voices: ELEVENLABS_VOICES,
  });
});

// 7b. Voice Synthesis POST endpoint
app.post("/api/voice/synthesize", async (req: Request, res: Response) => {
  try {
    const { traditionId, text, voiceId, customApiKey, language } = req.body;
    let targetText = text;
    let targetLang = language || "en";

    if (!targetText && traditionId) {
      const items = loadContributions();
      const tradition = items.find((t) => t.id === traditionId);
      if (tradition) {
        targetText =
          tradition.curatorNotes?.summary ||
          tradition.curatorNotes?.englishTranslation ||
          tradition.originalText;
        if (!language) {
          targetLang = tradition.language || "en";
        }
      }
    }

    if (!targetText || typeof targetText !== "string" || targetText.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Text or valid traditionId is required for synthesis." });
    }

    const voice = voiceId || "21m00Tcm4TlvDq8ikWAM";
    const result = await getOrSynthesizeSpeech(targetText, voice, customApiKey, targetLang);

    res.json({
      success: true,
      engine: result.engine,
      mimeType: result.mimeType,
      streamUrl: `/api/voice/stream?id=${encodeURIComponent(traditionId || "")}&voiceId=${encodeURIComponent(voice)}`,
    });
  } catch (err: any) {
    console.error("Voice synthesis endpoint error:", err);
    res.status(500).json({ success: false, error: err.message || "Voice synthesis failed" });
  }
});

// 7c. Direct Audio Streaming GET endpoint (Supports Range header for seeking & streaming)
app.get("/api/voice/stream", async (req: Request, res: Response) => {
  try {
    const traditionId = req.query.id as string;
    const voiceId = (req.query.voiceId as string) || "21m00Tcm4TlvDq8ikWAM";
    const textType = req.query.type as string;
    const customKey = req.query.customKey as string;
    let targetText = req.query.text as string;
    let targetLang = "en";

    if (!targetText && traditionId) {
      const items = loadContributions();
      const tradition = items.find((t) => t.id === traditionId);
      if (tradition) {
        if (textType === "translation" && tradition.curatorNotes?.englishTranslation) {
          targetText = tradition.curatorNotes.englishTranslation;
          targetLang = "en";
        } else if (textType === "original" && tradition.originalText) {
          targetText = tradition.originalText;
          targetLang = tradition.language || "en";
        } else {
          targetText =
            tradition.curatorNotes?.summary ||
            tradition.curatorNotes?.englishTranslation ||
            tradition.originalText;
          targetLang = "en";
        }
      }
    }

    if (!targetText || !targetText.trim()) {
      targetText = "Virasat cultural archive living tradition.";
    }

    const { buffer, mimeType } = await getOrSynthesizeSpeech(
      targetText,
      voiceId,
      customKey,
      targetLang
    );

    // Support HTTP Range requests
    const range = req.headers.range;
    const totalSize = buffer.length;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;
      const chunk = buffer.subarray(start, end + 1);

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      });
      res.end(chunk);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });
      res.end(buffer);
    }
  } catch (err: any) {
    console.error("Audio stream error:", err);
    res.status(500).json({ error: "Failed to stream voice narration." });
  }
});

// ============================================================
// 8. Regional Language Narration & Audio Service (Hindi, Bhojpuri, Kashmiri, Nagpuri, English, etc.)
// ============================================================

function loadRegionalTranslations(): Record<string, Record<string, any>> {
  try {
    if (fs.existsSync(REGIONAL_TRANSLATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(REGIONAL_TRANSLATIONS_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Error reading regional translations:", e);
  }
  return {};
}

function saveRegionalTranslations(data: Record<string, Record<string, any>>) {
  try {
    fs.writeFileSync(REGIONAL_TRANSLATIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving regional translations:", e);
  }
}

async function getOrGenerateRegionalNarration(traditionId: string, langId: string) {
  const normLang = (langId || "hindi").toLowerCase().trim();
  const translations = loadRegionalTranslations();

  // 1. Check existing translation in pre-computed dataset / cache
  if (translations[traditionId] && translations[traditionId][normLang]) {
    return {
      success: true,
      cached: true,
      ...translations[traditionId][normLang],
    };
  }

  // 2. Lookup tradition
  const items = loadContributions();
  const tradition = items.find((t) => t.id === traditionId);
  if (!tradition) {
    throw new Error(`Tradition ${traditionId} not found`);
  }

  const langObj = REGIONAL_LANGUAGES.find((l) => l.id === normLang) || {
    id: normLang,
    name: normLang,
    nativeName: normLang,
    flag: "🗣️",
    description: `${normLang} regional dialect`,
  };

  // 3. Dynamic generation with Gemini
  const prompt = `You are an expert cultural linguist and native heritage storyteller for Indian regional languages and oral dialects.
Translate and narratively adapt this cultural tradition into authentic ${langObj.name} (${langObj.nativeName}).

TRADITION DETAILS:
- Title: ${tradition.title}
- Original Language: ${tradition.language}
- Summary: ${tradition.curatorNotes?.summary || tradition.originalText}
- Full Story: ${tradition.curatorNotes?.englishTranslation || tradition.originalText}

Please generate JSON matching this schema:
{
  "caption": "A concise 1-2 sentence spoken caption / summary in authentic ${langObj.name} (using native script e.g. Devanagari / Perso-Arabic / Latin).",
  "description": "A warm, immersive 3-5 sentence oral narration in authentic ${langObj.name} capturing local idioms, vernacular rhythm, and reverence."
}
Return raw JSON only.`;

  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an AI Cultural Linguist and Heritage Storyteller. Output valid raw JSON only.",
        temperature: 0.3,
      },
    });

    let raw = (res.text || "").trim();
    if (raw.startsWith("```json")) raw = raw.replace(/^```json/, "").replace(/```$/, "").trim();
    else if (raw.startsWith("```")) raw = raw.replace(/^```/, "").replace(/```$/, "").trim();

    const parsed = JSON.parse(raw);
    const newEntry = {
      language: langObj.name,
      nativeName: langObj.nativeName,
      flag: langObj.flag,
      caption: parsed.caption || tradition.curatorNotes?.summary || tradition.title,
      description: parsed.description || tradition.originalText,
    };

    if (!translations[traditionId]) {
      translations[traditionId] = {};
    }
    translations[traditionId][normLang] = newEntry;
    saveRegionalTranslations(translations);

    return {
      success: true,
      cached: false,
      ...newEntry,
    };
  } catch (err: any) {
    console.warn("Gemini regional generation fallback:", err.message);
    const fallbackEntry = {
      language: langObj.name,
      nativeName: langObj.nativeName,
      flag: langObj.flag,
      caption: tradition.curatorNotes?.summary || tradition.title,
      description: tradition.curatorNotes?.englishTranslation || tradition.originalText,
    };
    return {
      success: true,
      cached: false,
      ...fallbackEntry,
    };
  }
}

// 8a. List supported regional languages
app.get("/api/voice/regional-languages", (_req: Request, res: Response) => {
  res.json({
    success: true,
    languages: REGIONAL_LANGUAGES,
  });
});

// 8b. Get regional narration text (caption + description)
app.get("/api/voice/regional-narration", async (req: Request, res: Response) => {
  try {
    const traditionId = req.query.id as string;
    const lang = ((req.query.lang as string) || "hindi").toLowerCase();

    if (!traditionId) {
      return res.status(400).json({ success: false, error: "Tradition ID is required." });
    }

    const narration = await getOrGenerateRegionalNarration(traditionId, lang);

    res.json({
      success: true,
      traditionId,
      langId: lang,
      language: narration.language,
      nativeName: narration.nativeName,
      flag: narration.flag,
      caption: narration.caption,
      description: narration.description,
      fullText: `${narration.caption} ${narration.description}`,
      audioUrls: {
        all: `/api/voice/regional-audio?id=${encodeURIComponent(traditionId)}&lang=${encodeURIComponent(lang)}&part=all`,
        caption: `/api/voice/regional-audio?id=${encodeURIComponent(traditionId)}&lang=${encodeURIComponent(lang)}&part=caption`,
        description: `/api/voice/regional-audio?id=${encodeURIComponent(traditionId)}&lang=${encodeURIComponent(lang)}&part=description`,
      },
    });
  } catch (err: any) {
    console.error("Regional narration error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to get regional narration" });
  }
});

// 8c. Stream regional narration audio (Supports part=all, caption, or description)
app.get("/api/voice/regional-audio", async (req: Request, res: Response) => {
  try {
    const traditionId = req.query.id as string;
    const lang = ((req.query.lang as string) || "hindi").toLowerCase();
    const part = ((req.query.part as string) || "all").toLowerCase();
    const voiceId = (req.query.voiceId as string) || "21m00Tcm4TlvDq8ikWAM";

    if (!traditionId) {
      return res.status(400).json({ error: "Tradition ID is required." });
    }

    const narration = await getOrGenerateRegionalNarration(traditionId, lang);
    let targetText = narration.description;
    if (part === "caption") {
      targetText = narration.caption;
    } else if (part === "all") {
      targetText = `${narration.caption} ${narration.description}`;
    }

    const { buffer, mimeType } = await getOrSynthesizeSpeech(
      targetText,
      voiceId,
      undefined,
      lang
    );

    const range = req.headers.range;
    const totalSize = buffer.length;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;
      const chunk = buffer.subarray(start, end + 1);

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      });
      res.end(chunk);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });
      res.end(buffer);
    }
  } catch (err: any) {
    console.error("Regional audio stream error:", err);
    res.status(500).json({ error: "Failed to stream regional voice narration." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🏛️  Virasat server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Virasat server:", err);
});
