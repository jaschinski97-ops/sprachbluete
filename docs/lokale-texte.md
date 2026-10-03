# Lokale Textinhalte und Lernstufen

Zusätzliche Studio-Anbieter: Qwen3.5-9B Q5_K_M und **Gemma 4 12B IT** Q4_K_M (Instruction-Tuning, nicht Base). Vokabeln, Vokabelprüfung und Gesprächssituationen nutzen den vorhandenen Textvertrag. Gespeicherte Anbieterentscheidungen bleiben erhalten; lokal bewusst auswählen. Audio bleibt unverändert. Kein API-Schlüssel und kein Cloud-Fallback; lokale Generierung benötigt Zeit und Strom.

## Einrichtung

`scripts/content/setup-local-text.ps1` installiert llama.cpp b11379 Windows CUDA 12.4 aus dem offiziellen GitHub-Release sowie GGUF-Gewichte von Unsloth bzw. Bartowski. Modellrevision und SHA-256 werden geprüft; Runtime-Prüfsumme wird geprüft, wenn das Release sie liefert. Rund 14 GB Gewichte plus Runtime/Archive unter `_Local/text` einplanen. Das Setup führt keine Modelle aus. Gewichte gehören nicht in den App-Build.

Nach Ende des Bilddurchgangs ComfyUI beenden, damit dessen GPU-Speicher frei wird. Danach `scripts/content/start-local-text.ps1` starten und den Studio-Helper neu starten. Der Server hört nur auf `127.0.0.1:8090`. Das Startskript verweigert aktive ComfyUI-Aufträge und eine belegte GPU, ohne Prozesse zu beenden.

Der llama.cpp-Router hält höchstens **ein geladenes Modell**. Studio- und Prüferwahl steuern Modellwechsel. Namen: `qwen3.5-9b`, `gemma-4-12b`. Kleine Vergleichsserien zuerst; Kreuzprüfung lädt die Modelle nacheinander neu und kostet zusätzlich Zeit. KI-Prüfung ist keine unabhängige Sprachfreigabe.

Der Helper akzeptiert nur lokale App-Origins, begrenzt Auftrag/Laufzeit und ruft einen festen Loopback-Endpunkt auf. Falsches Modell oder abgeschnittene Ausgabe schlagen fehl. JSON-Ausgaben werden eingeschränkt; bestehende Inhalts-/Schrift-/Übersetzungsprüfungen bleiben verbindlich. Lokale Vokabelpakete maximal fünf Wörter (je 20 Übersetzungen). Die lokale Prompt-Ausschlussliste ist begrenzt; der vollständige gespeicherte Bestand bleibt zur Duplikatprüfung erhalten. 8192 Ausgabetokens und 16384 Kontexttokens sind Startwerte; echte Geschwindigkeit und Sprachqualität auf diesem PC noch prüfen.

## Anfänger, Erfahren, Profi

Alle 20 App-Sprachen haben die sichtbaren Bezeichnungen. Interne Zuordnung: Anfänger=A1/A2, Erfahren=B1/B2, Profi=C1/C2. Gruppen beschreiben Inhaltsschwierigkeit, kein Zertifikat. Offizielle Goethe-Prüfungsnamen bleiben fachlich korrekt; Goethe B2 weiter zuletzt.

Neue Vokabeln tragen `learningStage`; alte Wörter ohne Feld zählen als Anfänger. Ziele zählen je Sprache und Gruppe. Gesprächspläne verwenden die gewählte Gruppe und unterschiedliche Prompts; vorhandene IDs, Fortschritte und Standardpläne bleiben kompatibel. Kapitel, Dialoge und abgeleitete Lesetexte zeigen die verständliche Gruppe; vorhandene B1-Vertiefung heißt Erfahren. Kein Profi-Bestand wird erfunden.

## Vorbereitung während des Bildlaufs

Änderungen liegen ausschließlich im Worktree `local-text-levels`. Während der Browser-Bildlauf aktiv ist weder in den aktiven Checkout übernehmen noch App/Helper neu starten. Danach nur Code/Dokumentation übernehmen; Nutzer-Katalog und generierte Medien unberührt lassen. `_Local/text` separat übernehmen (gitignored). Anschließend Helper neu starten und echte kleine Proben beider Modelle ausführen. Native iPhone-Abnahme bleibt offen.

Quellen: [llama.cpp Router](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#using-multiple-models), [Qwen](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF), [Gemma IT](https://huggingface.co/bartowski/gemma-4-12B-it-GGUF).
