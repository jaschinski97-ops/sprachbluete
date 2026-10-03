import { SpeechLanguage } from '../audio';

/**
 * Gemeinsamer Vertrag der KI-Anbieter (Phase 10).
 *
 * BIS HIERHER WAR JEDER GENERATOR AUF EINEN ANBIETER FESTGENAGELT: die
 * Sprachsituationen und die Prüfungsaufgaben riefen den Anthropic-SDK direkt
 * auf (AE-12), die Bilder ein eigenes `fetch` gegen Stability (AE-13). Beide
 * Aufrufe standen im jeweiligen Generator neben dem Prompt und dem Parser.
 *
 * DIE NAHT LIEGT DESHALB DORT, WO SIE ANBIETERUNABHÄNGIG IST:
 *
 * - `TextClient` — „System- und Nutzertext rein, Text raus". Mehr brauchen
 *   weder der Dialog- noch der Prüfungsgenerator; beide verlangen JSON im
 *   Prompt und prüfen die Antwort selbst (Phase 4/7). Prompts und Parser
 *   bleiben damit unangetastet und anbieterfrei.
 * - `ImageClient` — „Prompt rein, Bilddaten raus". Das Format kommt aus der
 *   **Antwort** zurück und wird nicht vorausgesetzt: ChatGPT nimmt
 *   `output_format` entgegen, Gemini bestimmt es selbst und nennt es im
 *   `mimeType`. Wer es vorschreiben wollte, müsste bei Gemini lügen.
 *
 * WAS BEWUSST *NICHT* IN DIESEN VERTRAG WANDERT: Temperatur, Werkzeuge,
 * Streaming, Bildgrößen jenseits des Seitenverhältnisses. Nichts davon wird
 * hier gebraucht, und ein Vertrag, der jede Fähigkeit jedes Anbieters abbildet,
 * ist keine Abstraktion mehr, sondern eine Vereinigungsmenge.
 */

/**
 * Die auswählbaren Anbieter.
 *
 * NUTZERENTSCHEIDUNG (10.09., wörtlich): „Entferne bei den KIs Claude und
 * Stability" — beide sind aus der Auswahl gefallen. WARUM das reicht: Die zwei
 * verbliebenen Cloud-Anbieter decken zusammen alle drei Fähigkeiten ab
 * (Gemini und OpenAI je Text + Bild + Sprachausgabe), der Helper bleibt als
 * serverseitiger Audio-Durchgang. Die frühere Begründung für den
 * Bestandsanbieter Stability (AE-28: Claude erzeugt keine Bilder) trägt
 * damit nicht mehr.
 *
 * `chatgpt-helper` ist kein Cloud-Anbieter, sondern der lokale Helper des
 * Inhaltsstudios (Roadmap v2, Phase 2): Er reicht Sprachausgabe an OpenAI
 * **serverseitig** durch — der Schlüssel steht in der Umgebung des Helpers
 * (env `OPENAI_API_KEY`) und wird nie im Browser angetastet. Er spricht nur
 * Sprachausgabe und taucht deshalb nur in der Hörclip-Gruppe auf.
 *
 * GESPEICHERTE STÄNDE: Profile und Backups können noch `claude`/`stability`
 * nennen. `isProviderId` erkennt sie nicht mehr, und `normalizeChoice`
 * (providers/settings.ts) fällt dann nachsichtig auf den Gruppen-Default
 * zurück (AE-25-Muster) — ein alter Speicherstand darf nicht crashen.
 */
export const PROVIDERS = ['chatgpt', 'chatgpt-helper', 'gemini', 'comfyui', 'local-qwen', 'local-gemma'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Der Hörclip-Anbieter für den lokalen Helper des Studios. */
export const HELPER_AUDIO_PROVIDER: ProviderId = 'chatgpt-helper';

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

/** Was ein Anbieter kann — gemessen, nicht vermutet. Siehe AE-26/AE-27/AE-31. */
export type ProviderCapability = 'text' | 'image' | 'audio';

export type ProviderInfo = {
  id: ProviderId;
  /** Name im Auswahlfeld. Der Produktname, nicht der Firmenname. */
  label: string;
  /** Firma dahinter — steht in der Erklärzeile, damit der Schlüssel passt. */
  vendor: string;
  can: Record<ProviderCapability, boolean>;
  /** Wie ein Schlüssel dieses Anbieters ungefähr aussieht. */
  keyPlaceholder: string;
  /** Wo man ihn bekommt. Reiner Hinweistext, kein Link. */
  keySource: string;
  /**
   * Beispielhafter Modellname je Fähigkeit — **Platzhalter, kein Katalog**.
   * Modelle wechseln zu oft, um sie einzufrieren; das Eingabefeld nimmt
   * jeden Text an (Pflicht 5). Leer heißt: kann der Anbieter nicht.
   */
  modelPlaceholder: Record<ProviderCapability, string>;
  /**
   * Beispielhafte Stimme für die Sprachausgabe — wie das Modell ein
   * Platzhalter und kein Katalog. Leer, wenn der Anbieter nicht spricht.
   */
  voicePlaceholder: string;
  /**
   * Warum dieser Anbieter im **Web-Build** nicht oder kaum funktioniert.
   * `null` heißt: nichts dergleichen gemessen. Steht nur im Web in der
   * Oberfläche — nativ gibt es kein CORS, dort gilt der Hinweis nicht.
   */
  webWarning: string | null;
  /**
   * Braucht dieser Anbieter einen Schlüssel im Gerät, um zu laufen?
   * Nicht gesetzt heißt: ja. Beim Helper ist es `false` — sein Schlüssel
   * kommt serverseitig aus der Umgebung; ein hier eingetragener wird
   * ignoriert.
   */
  needsKey?: boolean;
};

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  'local-qwen': {
    id:'local-qwen', label:'Qwen (lokal)', vendor:'Qwen', can:{text:true,image:false,audio:false}, needsKey:false,
    keyPlaceholder:'', keySource:'Lokales Modell', modelPlaceholder:{text:'qwen3.5-9b',image:'',audio:''}, voicePlaceholder:'', webWarning:null,
  },
  'local-gemma': {
    id:'local-gemma', label:'Gemma (lokal)', vendor:'Google', can:{text:true,image:false,audio:false}, needsKey:false,
    keyPlaceholder:'', keySource:'Lokales Modell', modelPlaceholder:{text:'gemma-4-12b',image:'',audio:''}, voicePlaceholder:'', webWarning:null,
  },
  comfyui: {
    id: 'comfyui', label: 'ComfyUI (lokal)', vendor: 'Black Forest Labs',
    can: { text: false, image: true, audio: false },
    keyPlaceholder: '', keySource: 'Lokales FLUX-Modell, kein API-Schlüssel',
    modelPlaceholder: { text: '', image: 'flux-2-klein-4b-fp8', audio: '' },
    voicePlaceholder: '', webWarning: null, needsKey: false,
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    vendor: 'OpenAI',
    can: { text: true, image: true, audio: true },
    keyPlaceholder: 'sk-…',
    keySource: 'platform.openai.com',
    // Sprachausgabe: POST /v1/audio/speech, liefert die Audiodatei binaer
    // (mp3/opus/aac/flac/wav/pcm); Thai steht in der Sprachliste der Doku.
    // Festverdrahteter Schnappschuss (Nutzerwahl 08.09.2026): der datierte
    // 2025-12-15-Snapshot erkennt Woerter deutlich besser als der Alias;
    // Feld bleibt Freitext, ein anderer Name ist jederzeit eintippbar.
    modelPlaceholder: { text: 'gpt-5', image: 'gpt-image-1', audio: 'gpt-4o-mini-tts-2025-12-15' },
    // Nutzerwahl 08.09.2026: 'coral' ist OpenAIs warme, freundliche Stimme —
    // 'alloy' klingt daneben nüchtern-technisch. Freitext, jederzeit änderbar.
    voicePlaceholder: 'coral',
    // Web-Warnung entfallen — beide Messungen bleiben hier dokumentiert:
    // 2026-09-03 (AE-27): Ein POST an api.openai.com mit einem Schluessel,
    // der mit „sk-" beginnt, bekam eine Antwort ohne CORS-Header — der
    // Browser warf sie weg und der Lauf meldete „Keine Antwort"; nur nativ
    // galt der Weg als offen, ein gueltiger Schluessel liess sich damals
    // nicht pruefen.
    // 2026-09-08 (Nachmessung, heute gueltig): Der Preflight (OPTIONS auf
    // /v1/audio/speech, Origin http://localhost:8081, angefragt mit POST
    // sowie authorization,content-type) antwortet HTTP 200 mit
    // access-control-allow-origin: http://localhost:8081,
    // access-control-allow-methods: GET, OPTIONS, POST,
    // access-control-allow-headers: authorization, content-type,
    // access-control-max-age: 86400 (via Cloudflare, x-openai-proxy-wasm
    // v0.1). Der echte POST mit einem gueltigen Schluessel antwortet
    // HTTP 200, audio/mpeg, access-control-allow-origin: *. Text, Bilder
    // und Audio laufen damit auch im Web-Build; das Feld bleibt null, bis
    // eine kuenftige Messung wieder etwas anderes zeigt.
    webWarning: null,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    vendor: 'Google',
    can: { text: true, image: true, audio: true },
    keyPlaceholder: 'AIza…',
    keySource: 'aistudio.google.com',
    // Sprachausgabe ueber denselben generateContent-Aufruf wie Text und Bild,
    // mit responseModalities AUDIO; die Doku nennt Thai ("th") als unterstuetzt.
    modelPlaceholder: {
      text: 'gemini-2.5-flash',
      image: 'gemini-2.5-flash-image',
      audio: 'gemini-2.5-flash-preview-tts',
    },
    voicePlaceholder: 'Kore',
    webWarning: null,
  },
  'chatgpt-helper': {
    id: 'chatgpt-helper',
    // Ausdrücklich MIT Ortsangabe: Es ist ein Weg, nicht ein zweites Produkt —
    // derselbe OpenAI-Dienst hinter dem Direktpfad, nur über den lokalen
    // Helper des Studios geleitet.
    label: 'ChatGPT (Helper, localhost:8082)',
    vendor: 'OpenAI',
    // Reiner Durchgang zu OpenAI-Sprachausgabe — Text und Bilder kann der
    // Helper bewusst nicht (kein zweiter Text-/Bildweg neben dem Direktpfad).
    can: { text: false, image: false, audio: true },
    keyPlaceholder: '(entfällt — Schlüssel liefert der Helper)',
    keySource: 'env OPENAI_API_KEY auf dem Helper — Feld hier wird ignoriert',
    modelPlaceholder: {
      text: '',
      image: '',
      // Derselbe Schnappschuss wie beim Direktpfad; der Helper setzt ihn als
      // Default, wenn das Feld leer bleibt (scripts/content/studio.cjs).
      audio: 'gpt-4o-mini-tts-2025-12-15',
    },
    voicePlaceholder: 'coral',
    // Der Helper ist von Haus aus localhost — es gibt keine fremde Origin,
    // deren CORS man messen müsste. Abhängig von einer Messung wäre der
    // Direktpfad, nicht der Helper.
    webWarning: null,
    // Der Schlüssel steht serverseitig in der Umgebung des Helpers
    // (OPENAI_API_KEY); ein im Browser eingetragener Schlüssel wird nie
    // verschickt. Deshalb braucht dieser Weg keinen.
    needsKey: false,
  },
};

export function providersFor(capability: ProviderCapability): ProviderInfo[] {
  return PROVIDERS.map((id) => PROVIDER_INFO[id]).filter((info) => info.can[capability]);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TextRequest = {
  /** Rollenanweisung. Wer keine getrennte Systemrolle kennt, stellt sie voran. */
  system: string;
  user: string;
  maxTokens: number;
};

export type TextResponse = {
  text: string;
  /**
   * Das Modell, das **tatsächlich** geantwortet hat, falls der Anbieter es
   * nennt — sonst das angefragte. Landet im erzeugten Dokument und macht im
   * Nachhinein nachvollziehbar, womit ein Inhalt entstanden ist.
   */
  model: string;
  /**
   * Verbrauchsangabe des Anbieters, wenn er sie mitliefert (OpenAI: `usage`,
   * Gemini: `usageMetadata`). Ohne diese Zahlen schätzt das Budget des
   * Wortschatz-Loops grob paketweise statt aus echten Tokenzahlen.
   */
  usage?: { inputTokens: number; outputTokens: number };
};

export type TextClient = {
  provider: ProviderId;
  model: string;
  complete(request: TextRequest): Promise<TextResponse>;
};

// ---------------------------------------------------------------------------
// Bild
// ---------------------------------------------------------------------------

export type ImageRequest = {
  prompt: string;
  /** Nicht jeder Anbieter kennt so ein Feld; wer nicht, hängt es an den Prompt. */
  negativePrompt: string;
  /** Wunschformat. Kein Versprechen — maßgeblich ist das der Antwort. */
  preferredFormat: 'webp' | 'png' | 'jpeg';
  aspectRatio: string;
  stylePreset: string;
};

export type ImageResponse = {
  base64: string;
  /** Das Format, das wirklich geliefert wurde. */
  format: 'webp' | 'png' | 'jpeg';
  model: string;
};

export type ImageClient = {
  provider: ProviderId;
  model: string;
  create(request: ImageRequest): Promise<ImageResponse>;
};

// ---------------------------------------------------------------------------
// Sprachausgabe (Phase 11)
// ---------------------------------------------------------------------------

export type AudioFormat = 'wav' | 'mp3';

export type AudioRequest = {
  text: string;
  /**
   * Seit Phase 16 alle vier Sprachen. Die Anbieter werten die Angabe derzeit
   * nicht aus - die Stimme steht in den Einstellungen -, sie wandert aber
   * durch bis in die Clip-ID und muss dort stimmen.
   */
  language: SpeechLanguage;
};

export type AudioResponse = {
  base64: string;
  /** Das Format, in dem die Daten wirklich vorliegen (fertig abspielbar). */
  format: AudioFormat;
  model: string;
  voice: string;
  /** Bekannt bei PCM/WAV; bei komprimierten Formaten nicht aus der Antwort ablesbar. */
  sampleRate?: number;
};

/**
 * „Text rein, abspielbare Audiodatei raus." Das Format entscheidet der
 * Anbieter: Gemini liefert rohes PCM, das hier zu WAV verpackt wird; OpenAI
 * liefert direkt mp3. Beides spielt `expo-audio` ab; die Ablage benennt die
 * Datei nach dem Format (AE-30).
 */
export type AudioClient = {
  provider: ProviderId;
  model: string;
  voice: string;
  synthesize(request: AudioRequest): Promise<AudioResponse>;
};

const CAPABILITY_NEGATED: Record<ProviderCapability, string> = {
  text: 'keinen Text',
  image: 'keine Bilder',
  audio: 'keine Sprachausgabe',
};

/**
 * Ein Anbieter kann das nicht — als Fehler, nicht als stiller Leerlauf.
 *
 * Die Oberfläche verhindert die Kombination bereits (das Auswahlfeld zeigt
 * für eine Gruppe nur Anbieter an, die die Aufgabe können). Diese Sperre
 * liegt trotzdem hier, weil gespeicherte Einstellungen aus einer älteren
 * Version eine Kombination tragen können, die es inzwischen nicht mehr gibt —
 * dieselbe Überlegung wie beim dreifachen isConcrete-Tor (AE-15) und beim
 * Prüfen an der Lesegrenze (AE-25).
 */
export function unsupported(provider: ProviderId, capability: ProviderCapability): Error {
  const info = PROVIDER_INFO[provider];
  return new Error(
    `${info.label} (${info.vendor}) erzeugt ${CAPABILITY_NEGATED[capability]} — ` +
      'bitte in den Einstellungen einen anderen Anbieter wählen.'
  );
}
