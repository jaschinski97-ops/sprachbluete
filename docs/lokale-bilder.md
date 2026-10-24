# Lokale Bilder für das Entwicklerstudio

FLUX.2 klein **4B distilled FP8** ersetzt den Bildweg über Gemini. ComfyUI läuft auf diesem Windows-PC, nicht auf dem iPhone. Fertige Bilder werden wie bisher geprüft, exportiert und mit dem Offline-Build ausgeliefert. Text- und Audioanbieter sowie ihre gespeicherten Einstellungen bleiben unverändert.

## Start auf diesem PC

In getrennten Terminals:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/content/start-local-images.ps1
node scripts/content/studio.cjs
npx expo start --web --port 8081 --max-workers 2
```

Im Studio → Bilder → Anbieter **ComfyUI (lokal)**, Modell **flux-2-klein-4b-fp8**. Kein API-Schlüssel. Bestehende Bildanbieter-Einstellungen bleiben erhalten; die neue Vorgabe bei leerer Einstellung ist ComfyUI. Die Text- und Audioauswahl wird dabei nicht verändert. Keine Cloud-Ausweichlogik. Jedes neue Bild wird nach technischer Prüfung und Budgetkontrolle automatisch übernommen. Die Speicherung und Live-Übernahme können mit der nächsten Bildgenerierung überlappen. Alte, unabhängige Stage-Entwürfe bleiben erhalten. Die Medien werden direkt beim Helper gespeichert, ohne die Browser-Metadatenquote zu belasten. Der statische Build-Index wird automatisch am Laufende aktualisiert, damit HMR die Generierung nicht abbricht. Bei Browser-Abbruch sichert der Helper den Index nach zwei Minuten ohne Heartbeat; bei Helper-Neustart stellt er die gesicherten Übernahmen wieder her. Eine Motiv-Vorschau durch den Admin gibt es nicht (Nutzerentscheidung 24.10.2026).

Der Helper auf 8082 akzeptiert Bildaufträge nur von den beiden lokalen App-Origins auf Port 8081. Er ruft fest `127.0.0.1:8188` auf, erzeugt ein Bild pro Auftrag und holt nur die zugehörige Ausgabe. Zeitlimit zehn Minuten; ein überfälliger Auftrag kann in ComfyUI weiterlaufen. Deshalb vor einer Wiederholung dessen Warteschlange prüfen. Ein Timeout unterbricht keine fremden Aufträge.

## Kleine Vorschau

```powershell
node scripts/content/local-image-trial.cjs
```

Drei kompakte 512×512-WebPs (erzeugt bei 768×768) mit Prompt/Modell/Laufzeit unter `_Local/image-trial/<Zeitstempel>/`. Kein Stage, Publish, Text- oder Audioaufruf. Freiwilliger technischer Test der lokalen Einrichtung; für den Studio-Lauf nicht nötig.

## Einrichtung unter Linux (seit 23.10.2026)

```bash
bash scripts/content/setup-local-images.sh   # einmalig, ~16 GB, setzt abgebrochene Downloads fort
bash scripts/content/start-local-images.sh   # ComfyUI auf 127.0.0.1:8188
```

Das Skript klont ComfyUI von GitHub nach `_Local/comfy/ComfyUI`, legt eine Python-Umgebung an (Linux Mint hat kein `ensurepip`; pip kommt über das offizielle `get-pip.py`), installiert PyTorch mit CUDA 12.8 und lädt dieselben drei Modelldateien wie unter Windows; die Prüfsumme des Bildmodells wird verglichen. Auf diesem Rechner (RTX 3080, ComfyUI 0.42) dauert ein 768×1664-Bild rund 5 s.

## Einrichtung auf einem neuen Windows-PC

Offizielles [ComfyUI Portable](https://docs.comfy.org/installation/comfyui_portable_windows) nach `_Local/comfy/` entpacken. Hier geprüft: Version 0.38.0, NVIDIA-Paket, eingebettetes Python 3.13.14. Globales Python muss dafür nicht verändert werden. Die Modellgewichte kommen aus den Links der [offiziellen ComfyUI-Anleitung](https://docs.comfy.org/tutorials/flux/flux-2-klein):

| Verzeichnis unter ComfyUI/models | Datei |
| --- | --- |
| diffusion_models | flux-2-klein-4b-fp8.safetensors |
| text_encoders | qwen_3_4b.safetensors |
| vae | flux2-vae.safetensors |

Nicht die Base- oder 9B-Variante nehmen. Das verwendete [4B-FP8-Modell](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8) steht unter Apache 2.0. Die Diffusionsdatei hat SHA-256 `97ed34fe0567e436200f2faee3939b88f2b5d99f8af2a4dc16532c4245c0ccb6` (beim Download geprüft). Runtime und Modelle sind lokal/gitignored; der zusätzliche Platzbedarf liegt bei etwa 17 GB zuzüglich Installationsarchiv.

Der Helper komprimiert neue Bilder mit dem vorhandenen lokalen FFmpeg zu 512×512-WebP (Qualität 85); die PNG-Originale liegen weiterhin im ComfyUI-Ausgabeordner.

Das ComfyUI-Core-Workflow nutzt vier Schritte, Euler, CFG 1, Batch 1 und die Gerätewahl `default` für den Textencoder. ComfyUI verwaltet GPU und Speicher-Auslagerung; auf der RTX 3080 mit 12 GB VRAM erfolgreich geprüft. Dieser Encoder wird nur intern für Bild-Prompts verwendet; er ersetzt nicht die Textgenerierung der App. Lokale Aufträge bleiben seriell, ohne die zusätzliche Cloud-Pause. Der Helper fragt fertige Ergebnisse alle 250 ms ab.

## Messung vom 03.10.2026

RTX 3080 12 GB, 64 GB RAM, keine bezahlten API-Aufrufe: Apfel 20,5 s einschließlich erstem Modellladen; Stuhl 16,3 s; Fahrrad 16,3 s. Drei lesbare, textfreie Motive. Apfel wirkt flächiger, Fahrrad detailreicher; Stil vor einer großen Serie vereinheitlichen. Lokale Ausgaben: `_Local/image-trial/apple.png`, `chair.png`, `bicycle.png`. Kein Inhalt automatisch veröffentlicht.

Beim Studio-Probelauf war bereits vor dem Bild die Summe aus Stage und Katalog mit 707,7 MiB über dem Budget. Der ausgelieferte Katalog liegt bei 411,1 MiB. Vor einer Veröffentlichung den vorhandenen Stage gezielt auswählen/bereinigen; das Budget bleibt 512 MiB. Keine alten Entwürfe automatisch gelöscht.

Studio-Nachprobe: Flugzeugkarte als WebP mit 4626 Byte; Export als Entwurf erfolgreich. Das Motiv ist stark vereinfacht und braucht vor Veröffentlichung eine visuelle Prüfung.

Der abschließende wiederholbare WebP-Probelauf brauchte 14,4/15,4/15,3 s (Apfel/Stuhl/Fahrrad), Dateien 6006/5996/20578 Byte. Visuell geprüft; Ausgaben: `_Local/image-trial/2026-10-03T16-59-59-898Z/`.

### Geschwindigkeitsoptimierung am 03.10.2026

Der Nutzer hat den Serienlauf bei 23 erfolgreich gespeicherten Bildern angehalten. Benchmark mit drei gleichen Motiven, festen Seeds und jeweils eigener Prompt-Verarbeitung: CPU/1024 13,4–14,6 s, GPU/1024 4,3–5,7 s, GPU/768 2,7–3,0 s, GPU/512 1,9–2,2 s. Keine Speicherfehler. 768 als Kompromiss übernommen; 512 erzeugt wurde nicht als Standard gewählt, um für komplexere Motive mehr Auflösung zu behalten. Alle Ausgaben bleiben 512-WebPs. Benchmark und Bildvergleich: `_Local/image-speed/2026-10-03T17-45-20-640Z/`. Werte sind kleine lokale Proben, keine Garantie für alle 3823 Motive. Bereits gespeicherte Bilder werden beim Fortsetzen übersprungen.
