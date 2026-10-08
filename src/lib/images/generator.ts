import { describeHttpError } from '../providers/http';
import { createImageProvider } from '../providers/image';
import { ImageClient, PROVIDER_INFO, ProviderId } from '../providers/types';

import { assertConcreteSpec } from './plan';
import { GeneratedImage, ImageFormat, ImageSpec } from './types';

/**
 * Erzeugt ein einzelnes Vokabelbild.
 *
 * SEIT PHASE 10 IST DER ANBIETER WÄHLBAR. Der Prompt, das isConcrete-Tor und
 * die zweiteilige Ablage bleiben davon unberührt; wie ein Bild über die
 * Leitung kommt, steht in `lib/providers/image.ts`. NUTZERENTSCHEIDUNG
 * 10.09.: Der frühere Bild-Default Stability ist aus der Auswahl gefallen
 * („Entferne bei den KIs Claude und Stability") — der Modell-Vorschlag folgt
 * dem neuen Gruppen-Default Gemini, dessen Bildweg im Web-Build gemessen ist.
 *
 * ANBIETERWAHL (AE-13) — gemessen, nicht angenommen. Die Anthropic-API aus
 * Phase 4 erzeugt keine Bilder, es musste also ein zweiter Anbieter her.
 * Zuerst war OpenAI Images gesetzt (offizieller SDK, wie in AE-12). Aus dem
 * laufenden Web-Build heraus zeigte sich: `GET api.openai.com/v1/models` war
 * lesbar, `POST` auf `/v1/images/generations` und `/v1/chat/completions`
 * dagegen `TypeError: Failed to fetch`, während Stability mit einem lesbaren
 * 401 antwortete. Damit fiel OpenAI aus, und Stability wurde gesetzt.
 *
 * PHASE 10 HAT DAS NACHGEMESSEN UND DEN GRUND GEFUNDEN (AE-27): Es ist nicht
 * „POST ist gesperrt". Ausschlaggebend ist das **Präfix des Schlüssels**. Ein
 * POST mit `Authorization: Bearer ungueltig` kommt mit lesbarem 401 zurück;
 * derselbe POST mit `Bearer sk-…` bekommt eine Antwort ohne
 * `Access-Control-Allow-Origin`, die der Browser verwirft. `SK-` in
 * Großbuchstaben und `xk-` kommen wieder durch — es hängt buchstäblich an
 * diesen drei Zeichen. Beim GET greift die Regel nicht, was genau erklärt,
 * warum die Tabelle aus Phase 5 GET und POST unterschiedlich sah.
 *
 * FÜR DIE APP ÄNDERT DAS NICHTS AN DER ENTSCHEIDUNG: Jeder echte
 * OpenAI-Schlüssel beginnt mit `sk-`. Ob ein **gültiger** Schlüssel die
 * Ausnahme ist, ließ sich ohne einen solchen nicht prüfen — und ein Versuch
 * würde womöglich berechnet, ohne dass die Antwort ankommt. ChatGPT ist
 * deshalb im Web-Build als eingeschränkt gekennzeichnet und nativ offen.
 *
 * KEIN SDK, SONDERN `fetch` — anders als in AE-12 und mit Grund: für Stability
 * gibt es **keinen** offiziellen JavaScript-SDK (nachgesehen: `stability-sdk`
 * ist Python, auf npm gibt es nur ein Paket eines Einzelentwicklers von 2024).
 * Eine multipart-Anfrage von zwanzig Zeilen selbst zu schreiben ist die
 * kleinere Abhängigkeit als ein fremdgepflegter Node-SDK im Browser-Bundle.
 *
 * DIE PARAMETER SIND GEGEN DIE LAUFENDE API BELEGT, nicht aus dem Gedächtnis:
 * Stability prüft Pflichtfelder und Aufzählungswerte **vor** der
 * Authentifizierung, deshalb ließ sich die Anfrageform ohne gültigen Schlüssel
 * vollständig festklopfen. Die API antwortete selbst:
 *   - `output_format: "tiff"` → „invalid enum value. Expected 'png' | 'jpeg' | 'webp'"
 *   - `aspect_ratio: "3:7"`   → „Expected '21:9' | '16:9' | '3:2' | '5:4' | '1:1' | …"
 *   - ohne `prompt`           → „prompt: required"
 *   - `seed: "abc"`           → „expected number, received string"
 *   - die vollständige, gültige Anfrage → 401 „authorization: invalid or missing
 *     header value", also bis zum Schlüssel durchgelaufen.
 *   - ein falscher Pfad → 404. Das 401 belegt damit auch, dass es den
 *     Endpunkt gibt.
 */

/** Voreinstellung, kein Zwang — das Modell ist ein Freitextfeld (Pflicht 5). */
export const IMAGE_MODEL = PROVIDER_INFO.gemini.modelPlaceholder.image;

/**
 * WebP statt PNG: Das Bild landet auf dem Gerät in einer Datei und im Web in
 * einer IndexedDB — kleinere Dateien sind hier kein Detail (AE-14).
 */
export const IMAGE_FORMAT: ImageFormat = 'webp';
/** Quadratisch, weil die Karteikarte einen quadratischen Rahmen zeigt. */
export const IMAGE_ASPECT_RATIO = '1:1';
/** Einheitlicher Stil über alle Karten hinweg. */
export const IMAGE_STYLE_PRESET = 'digital-art';

/**
 * Was auf keinen Fall im Bild sein soll.
 *
 * Schrift steht an erster Stelle: ein Modell, das Buchstaben malt, malt
 * falsche — bei Thai-Schrift erst recht. Eine erfundene Schreibung neben
 * sorgfältig geprüften Vokabeln wäre schädlicher als gar kein Bild. Danach
 * kommt alles, was die Eindeutigkeit zerstört: mehrere Motive, Collagen,
 * Rahmen.
 */
export const NEGATIVE_PROMPT =
  'text, letters, words, numbers, captions, watermark, signature, logo, ' +
  'frame, border, collage, multiple objects, split image, blurry';

export type ImageGenerationClient = {
  generate(spec: ImageSpec): Promise<GeneratedImage>;
};

/**
 * Der Bildauftrag in Worten — englisch, weil Bildmodelle englisch trainiert
 * sind. Das Motiv selbst kommt aus `motifs.ts` und ist je Vokabel von Hand
 * festgelegt; hier kommt nur der gemeinsame Rahmen dazu, damit alle Karten
 * denselben Stil haben.
 */
export function buildImagePrompt(spec: ImageSpec): string {
  return (
    `${spec.motif}. ` +
    // Kein "one single subject" mehr: Handlungen, Orte und Gruppen (umarmen,
    // Stau, Geschwister) wurden damit zu einer einzelnen Figur ohne Sinn.
    'Simple flashcard illustration, one clear focus, centered, ' +
    'plain uncluttered background, clear outlines, friendly flat style, ' +
    'no text and no letters anywhere in the image.'
  );
}

/**
 * Liest die Fehlerform von Stability (`{"errors":[…],"name":"…"}`) aus.
 *
 * Seit Phase 10 tut das der gemeinsame Fehlerleser aller Anbieter — was in der
 * Fehlerliste eines Laufs landet, soll bei allen vier gleich aussehen. Der
 * Name hier bleibt, weil er an mehreren Stellen geprüft wird.
 */
export const describeApiError = describeHttpError;

/**
 * Verbindet den Prompt dieser Datei mit einem beliebigen Bildanbieter.
 *
 * HIER SITZT DIE DRITTE SPERRE DES isConcrete-TORS (AE-15) — unmittelbar vor
 * dem Aufruf, der Geld kostet, und jetzt an **einer** Stelle für alle drei
 * Anbieter statt dreimal kopiert. Der Zweck ist unverändert: eine einzelne
 * Sperre wird irgendwann durch einen neuen Aufrufer umgangen, und ein neuer
 * Anbieter ist genau so ein neuer Aufrufer.
 */
export function createImageClient(provider: ImageClient): ImageGenerationClient {
  return {
    async generate(spec) {
      assertConcreteSpec(spec);

      const prompt = buildImagePrompt(spec);
      const image = await provider.create({
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        preferredFormat: IMAGE_FORMAT,
        aspectRatio: IMAGE_ASPECT_RATIO,
        stylePreset: IMAGE_STYLE_PRESET,
      });

      return { base64: image.base64, format: image.format, model: image.model, prompt };
    },
  };
}

export function createImageGenerationClient(
  provider: ProviderId,
  apiKey: string,
  model: string = IMAGE_MODEL
): ImageGenerationClient {
  return createImageClient(createImageProvider(provider, apiKey, model));
}
