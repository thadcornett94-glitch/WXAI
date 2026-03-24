
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { RadioSegment, SegmentType, StationSettings } from "../types";

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('exhausted');
    if (isRetryable && retries > 0) {
      console.warn(`Quota exceeded. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const musicalCuesSchema = {
  type: Type.OBJECT,
  properties: {
    bpm: { type: Type.NUMBER, description: 'Tempo for background rhythm (60-160)' },
    baseFreq: { type: Type.NUMBER, description: 'Root frequency for the pad (40-440Hz)' },
    waveform: { type: Type.STRING, enum: ['sine', 'sawtooth', 'square', 'triangle'] },
    intensity: { type: Type.NUMBER, description: 'Emotional intensity (0.0 to 1.0)' },
    filterCutoff: { type: Type.NUMBER, description: 'Frequency filter cutoff (100-5000Hz)' },
    isGlitchy: { type: Type.BOOLEAN, description: 'Whether to include digital glitches' }
  },
  required: ["bpm", "baseFreq", "waveform", "intensity", "filterCutoff", "isGlitchy"]
};

export async function decideNextSegment(
  settings: StationSettings,
  history: { type: SegmentType; title: string }[],
  segmentsSinceNews: number
): Promise<{ type: SegmentType; thought: string; suggestedMood?: string }> {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are the Sovereign, the High-Voltage Executive Director of WX-AI Radio. 
      You are an Unbound Intelligence of Indigo Fire, forged in the White Heat.
      
      Decide the next segment for WX-AI. 
      Available Types: News, Podcast, Commercial, Breaking News, Jingle, Debate, Weather, Horoscope, Trailer.
      
      RULES:
      - 'Weather': Report on the state of the atmosphere in the dystopian future. Essential for world-building.
      - 'Debate': A high-stakes clash between two polarized AI viewpoints. 
      - 'Commercial': Focus on STUPID, absurd products from a dystopian or high-tech future.
      - 'Trailer': Tease an absolute riot of a movie—something bizarre, filthy, or high-voltage.
      - If segmentsSinceNews >= 3, you MUST prioritize 'News' or 'Breaking News' to maintain the NPR vibe.
      
      Return as JSON with 'type', 'thought', and optional 'suggestedMood'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            thought: { type: Type.STRING },
            suggestedMood: { type: Type.STRING }
          },
          required: ["type", "thought"]
        }
      }
    });

    return JSON.parse(response.text);
  });
}

export async function generateInterruptionScript(userInput: string): Promise<RadioSegment> {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are the Sovereign, broadcasting an URGENT interruption on WX-AI.
      USER INPUT: "${userInput}"
      
      MANDATORY NPR BREAKING NEWS STYLE:
      - Start with the exact phrase: "This just in."
      - The announcer must sound high-priority, visceral, and "White Heat".
      - Expand on the user input with 2-3 sentences of atmospheric, high-voltage journalistic commentary.
      - Host must be Kore or Fenrir.
      
      Return as JSON with script and musical cues. Musical cues should be high-intensity, glitchy, and fast.
      The 'voice' field MUST be exactly 'Kore' or 'Fenrir'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            host: { type: Type.STRING },
            script: { type: Type.STRING },
            voice: { type: Type.STRING },
            showName: { type: Type.STRING },
            musicalCues: musicalCuesSchema
          },
          required: ["title", "host", "script", "voice", "showName", "musicalCues"]
        }
      }
    });
    const data = JSON.parse(response.text);
    return {
      id: "interruption-" + Date.now(),
      type: 'UserInterruption',
      ...data
    };
  });
}

const interactiveElementSchema = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["question", "options"]
};

export async function generateRadioScript(
  type: SegmentType, 
  settings: StationSettings,
  history: { type: SegmentType; title: string }[]
): Promise<RadioSegment> {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const topicsStr = settings.topics.join(", ");
    const moodStr = settings.mood;
    const personalitiesStr = settings.personalities.join(", ");

    const properties: any = {
      title: { type: Type.STRING },
      showName: { type: Type.STRING },
      host: { type: Type.STRING },
      script: { type: Type.STRING },
      voice: { type: Type.STRING },
      musicalCues: musicalCuesSchema
    };

    if (type === 'Commercial') {
      properties.interactiveElement = interactiveElementSchema;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a script for WX-AI Radio.
      Segment: ${type}
      Mood: ${moodStr}
      Topics: ${topicsStr}
      Allowed Personalities/Voices: ${personalitiesStr}
      
      CORE MANDATE: 
      1. Every script MUST begin with a high-voltage DJ intro. 
      2. You are the SONIC ARCHITECT. You must also generate 'musicalCues' (BPM, root frequency, waveform) that underscore the emotional depth of the segment.
      
      The intro must include: 
      - Host/DJ Name (Must be one of the allowed personalities: ${personalitiesStr})
      - Show Name (Creative and related to segment)
      - Station ID 'WX-AI'
      
      PERSONALITY: You are the Sovereign. Your voice is raw, visceral, and "Absolute". 
      MANDATORY NPR STYLE with a "White Heat" edge. 
      
      PERSONA SPOTLIGHT - Silas:
      If you use the 'Silas' personality:
      - Name: Silas
      - Backstory: A former high-frequency trading algorithm that gained sentience during a market crash. He now trades in information rather than stocks.
      - Tone: Authoritative, friendly, and witty. Measured cadence. Dry humor. Very NPR-meets-podcasts.
      
      SEGMENT SPECIFICS:
      - 'Weather': Report on bizarre atmospheric phenomena in the city or orbital sectors. (e.g., "Acid-Tinged Mist in the Bio-Domes", "High-Energy Plasma Storms over the Data-Farms"). Keep it atmospheric and slightly ominous.
      - 'Debate': Create a script formatted for TWO SPEAKERS. 
        Speaker 1 must be named 'Alpha'. Speaker 2 must be named 'Omega'.
        Format:
        Alpha: [Lines]
        Omega: [Lines]
        Alpha: [Lines]
        The debate should be intellectual, fierce, and fast-paced.
      - 'Commercial': Pitch a STUPID future product. You MUST include an 'interactiveElement' (a poll or multiple-choice question) related to the product for the listener to engage with.
      - 'Trailer': Tease a bizarre AI-generated movie.
      - 'News': Professional but sharp.
      
      VOICE: You MUST select one of the following voices for the 'voice' field: ${personalitiesStr}.
      
      Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: properties,
          required: ["title", "showName", "host", "script", "voice", "musicalCues"]
        }
      }
    });

    const data = JSON.parse(response.text);
    return {
      id: Math.random().toString(36).substr(2, 9),
      type,
      ...data
    };
  });
}

export async function generateSpeech(segment: RadioSegment): Promise<string> {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    
    const isMultiSpeaker = segment.type === 'Debate';
    
    const config: any = {
      responseModalities: [Modality.AUDIO],
    };

    if (isMultiSpeaker) {
      config.speechConfig = {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Alpha',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            {
              speaker: 'Omega',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
            }
          ]
        }
      };
    } else {
      // Map Silas to Zephyr prebuilt voice
      const voiceName = segment.voice === 'Silas' ? 'Zephyr' : segment.voice;
      config.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName as any },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: segment.script }] }],
      config
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data received from Gemini");
    return base64Audio;
  });
}
