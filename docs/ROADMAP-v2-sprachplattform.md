# Roadmap v2 — Sprachlernplattform (Stand 2026-09-09)

> **AMENDMENT 08.10.2026 (Nutzerentscheidung):** Die Goethe-Prüfungssimulation ist komplett entfernt; Abschnitte zu Prüfungen sind historisch. Lernstufen heißen Anfänger · Fortgeschritten · Profi (umgesetzt). Die Sprachpakete über GitHub Releases bleiben das Auslieferungsziel: Der Admin erzeugt Inhalte lokal, lädt sie als Release hoch, Nutzer laden ihre Lernsprache per Knopf.

## Offene Nutzeraufgaben — ergänzt am 03.10.2026

- [ ] **Verständliche Lernstufen:** Sichtbare Bezeichnungen A1, A2 und weitere GER-Kürzel bei generierten Vokabeln, Texten, Gesprächssituationen und allen weiteren Lerninhalten durch **Anfänger · Erfahren · Profi** ersetzen. Einheitliche Einteilung in Studio-Auswahl, Lernübersicht, Filtern und Inhaltsbeschriftungen; in allen 20 App-Sprachen übersetzen. Bestehende Inhalte weiterverwenden. Feinere Schwierigkeitsabstufungen intern erhalten; konkrete Zuordnung vor Umsetzung festlegen. Offizielle Goethe-Prüfungsnamen separat behandeln; Goethe B2 bleibt bis zuletzt zurückgestellt. Die drei Gruppen sind Inhaltsstufen und bescheinigen kein erreichtes Sprachniveau. **Nur vorgemerkt, noch nicht umgesetzt.**
- [ ] **Lokale Textgenerierung prüfen:** Für RTX 3080 12 GB, Ryzen 7 5700X und 64 GB RAM ein mehrsprachiges Modell für th/en/es/de sowie die benötigten Übersetzungen und vollständigen JSON-Inhalte vergleichen. Erste Kandidaten: Qwen3.5-9B und Gemma 4 12B in quantisierter Form. Reale Studio-Prompts, Thai-Umschrift/Töne, Bedeutungen, Dialoge und 20-Sprachen-Vollständigkeit als Abnahme; keine Qualitätsfreigabe allein aufgrund von Modell-Benchmarks. Nach dem Bilddurchgang testen, GPU nicht gleichzeitig mit beiden Modellen belegen. **Recherche/Vormerkung, keine Anbieterumstellung; Audio unverändert.**

> **AMENDMENT 09.09.2026 (Nutzerentscheidung):** Französisch wurde **komplett entfernt** — als Ziel- wie als UI-Sprache. Der Sprachkanon ist jetzt **Kern 4: Englisch, Spanisch, Deutsch, Thailändisch**. Der frühere FR-Grundstoff (150 Vokabeln, Drills, UI-Übersetzungen) liegt vollständig im Git-Verlauf (Commits `0c96493`/`0bae43c`) und kann von dort jederzeit zurückgeholt werden. Alle Nennungen von „Kern 5" und Französisch in diesem Dokument sind historisch zu lesen.

Vision des Nutzers, Entscheidungen und Bauplan. Quelle: Gespräch 08.09.2026 (4 Agenten-Recherche: SLA-Forschung, Store-Limits, Code-Audit, Chat-Historie).

## Produktvision

Eine App, in der jemand **ohne Vorkenntnisse** in seiner **Systemsprache** eine von **5 Sprachen** (Englisch, Spanisch, Französisch, Deutsch, Thai) zum **schnellen Lernen** wählt — vollständig **offline** mitsamt Audio. Für jede Sprache: Sätze sprechen, Hören (Sätze verstehen), Lesen und Schreiben, Vokabeln (Karteikarten) und **Diktate**. Prüfungssimulation **A1–B2 nach dem Format des Goethe-Zertifikats** für jede Angebotsprache.

- Die App erkennt die Systemsprache des Geräts und stellt UI + Brückensprache darauf um. Ein Deutscher sieht nie „Deutsch als Zielsprache" für sich selbst (sein Auswahlangebot ist EN/ES/FR/TH) — natives Prinzip, vom Nutzer so gewollt.
- Deutsch wird **eigene Zielsprache** (für EN/ES/FR/TH-Sprecher), nicht mehr Hub.
- Erweiterung erfolgt durch den Nutzer selbst im Debug-Studio: Key-Feld → KI-Dropdown → „Was erweitern?"-Dropdown (Vokabeln / Audio / Bilder / Diktate / Gespräche) → Start → automatische Ton-Prüfung → Paket wird Nutzern als Update verfügbar gemacht.

## Festgelegte Entscheidungen (08.09.2026)

| Entscheidung | Wahl |
|---|---|
| Sprachkanon Start | **Kern 5**: Englisch, Spanisch, Französisch, Deutsch, Thai (Mandarin u. a. später per Dropdown nachschiebbar) |
| Content-Auslieferung | **Sprachpakete, gehostet auf GitHub Releases** (App klein, Paket-Download beim ersten Start einer Sprache, danach komplett offline) |
| Updates an Nutzer | Neue Inhalte = neues Paket-Release (kein Store-Review nötig); App-/Binary-Updates weiterhin über die Stores |

## Antworten auf offene Fragen

1. **„Karteikarten sind aktuell für Vokabeln, oder?"** Ja — Karteikartenmodus mit FSRS (Bewertung 1–4, Ziel-Retention 90 %, max. 10 neue Karten/Sitzung), gefüttert von Karteikarte und freiem Schreiben. Multiple-Choice-Drills speisen FSRS bewusst nicht (Ratequote). Das ist genau die am besten belegte Methode (Spaced Repetition + Test-Effekt).
2. **„Goethe 1:1 übersetzt oder nicht?"** Weder — **Struktur ja, Inhalte nein.** Goethe-Zertifikate existieren nur für Deutsch; andere Sprachen haben eigene Prüfungsverter (DELE, DELF, HSK). Richtig: das Prüfungsgestell 1:1 übernehmen (4 Teile Hören/Lesen/Schreiben/Sprechen, Tasktypen, Punkteschema, Zeitvorgaben, Stufen A1–B2) und mit sprachspezifischen Inhalten füllen. Vorbild ist der bestehende Thai-Aufbau (gzsd1/gzsd2, 32 Module). Kennzeichnung: „Prüfungssimulation nach dem Format des Goethe-Zertifikats" — keine offizielle Zertifizierung, Markenname nicht werblich beanspruchen.

## Ehrliche Lückenanalyse (Vision vs. Stand heute)

| Bereich | Stand heute | Benötigt |
|---|---|---|
| Richtungslogik | Hardcoded Hub: 6 Richtungen de↔th/en/es (`HUB_LANGUAGE='de'`, `src/lib/languages/types.ts`) | Paarmatrix S∈{de,en,es,fr,th} × T∈5, S≠T (20 Paare); Brückensprache = Systemsprache (expo-localization) |
| UI-Sprache | Nur Deutsch | i18n-Gerüst, alle Strings in 5 Sprachen |
| Deutsch als Ziel | Nur Quellsprache; Artikeld-/Stammformen-Drills und gzsd-Prüfungen vorhanden | Eigene Ziel-Sprache mit Audio (135 fehlende de-Clips tauchen hier wieder auf), Vokabeln mit Übersetzungen aus 4 Brückensprachen |
| Französisch | fehlt komplett | Neuer Content: Vokabeln (frequenzsortiert), Beispielsätze, Betonungsdrills (analog Spanisch), Audio (2 Stimmen), Dialoge, Diktate, Prüfungen |
| Diktate | fehlen (Schreiben nur von Lesevorgabe) | Neuer Runner: Satzaudio → tippen → Diff → FSRS; offline, nutzt vorhandene Satzclips; OS-Tastaturen decken alle 5 Sprachen |
| Prüfungen | Goethe-Format A1/A2 (th→de) | B1/B2-Gerüst definieren; dann ×5 Sprachen (teuerster Content-Block) |
| Audio einbetten | 195 MB per `require()` im Binary | **Umstellung**: App ohne eingebettetes Audio (~60–80 MB), Sprachpakete via GitHub Releases, Download einmalig pro Sprache, sha256 im Manifest, danach offline |
| Sprechervarianz | 1 synthetische Stimme pro Sprache | 2 Stimmen pro Sprache (HVPT-Forschung: viele Sprecher > einer, klare Evidenz) |
| Vokabelumfang | ~85/Sprache | Ziel ~650 (A1) bis 2.400+ (B2) frequenzsortiert je Sprache |
| Studio | Key-Feld, KI-Dropdown, Erweiterungsläufe, Auto-Ton-Check, Publish vorhanden | OpenAI-CORS umgehen (Helper-Proxy auf Port 8082), Sprachziel-Dropdown, Paket-Export + GitHub-Upload, Protokollierung je Lauf |
| Struktur | scripts/content/ + docs/ + _Local/ + content/*-Berichte verstreut | Ein `pipeline/`-Ort: Skripte, `pipeline/logs/`, `pipeline/reports/`, Gates, Runbooks — jedes KI-Lauf protokolliert (Datum, Modell, Kosten, Checks, Ergebnis) |

**Größenrechnung (Ehrlichkeit):** Eine Sprache in heutiger Tiefe ≈ 125 MB Audio (3.100 Clips à 64 kbit/s) + ~4 MB Bilder nach WebP. 5 Sprachen ≈ 650 MB → passt in kein Binary (Play 500 MB Basis-Modul, Apple 4 GB). Paket-Architektur ist daher zwingend, nicht optional. TTS-Kosten grob 2–3 $ je 1.000 Clips; der eigentliche Flaschenhals ist Content-QA (Ton-Check, Probehören, Übersetzungsqualität), nicht das Geld.

## Bauplan (Phasen)

- **Phase 0 — Sofort (1 Session):** Content committen (3.212 untracked Dateien!); 78 PNG → WebP (74 → ~4 MB); Textfix pipeline.cjs („150 MiB" → 256); Nutzeraktion: `eas login && eas init`, OpenAI-Key rotieren.
- **Phase 1 — Architektur (2–3 Sessions):** i18n + Systemsprach-Erkennung; Richtungslogik → Paarmatrix; Diktat-Runner; Paket-Downloader (expo-file-system, Manifest + sha256, Fortschritt, Offline-Gate, WLAN-Default); App läuft mit Thai-Paket als Pilot.
- **Phase 2 — Studio + Hosting (1–2 Sessions):** Helper-Proxy (8082) für OpenAI; „Paket bauen & auf GitHub Releases hochladen" im Studio; `pipeline/`-Struktur mit Lauf-Protokollen; USD-Schätzung vor jedem Start (Gate existiert).
- **Phase 3 — Inhalte Kern 5 (Löwenanteil):** Deutsch komplett; Französisch neu; en/es auf Thai-Tiefe heben; je Sprache: ~650 A1-Vokabeln frequenzsortiert, 2 TTS-Stimmen, Diktate, Dialoge.
- **Phase 4 — A1–B2:** B1/B2-Prüfungsgerüst nach Goethe-Format, Inhalte ×5 Sprachen.

## Evidenzanker (aus Recherche 08.09.2026, Details im Chat-Protokoll)

FSRS/Spaced Repetition (Kim & Webb 2022) · Test-Effekt/aktiver Abruf (Yang 2021, g≈0,5) · ASR-Feedback mittel-groß (Ngo 2024) · HVPT/Sprechervarianz (Uchihara 2025) · Diktat/Dictogloss für Chunks (LTR 2022) · Extensive Reading (Nakanishi 2015) · Thai: FSI-Klasse ~1.100 h, Töne per HVPT trainierbar (Zhang 2021) · „Schnell" ehrlich kommunizieren: Stundenziel, keine Versprechen.
