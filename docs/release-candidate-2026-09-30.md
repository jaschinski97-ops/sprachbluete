# iPhone-Quellkandidat vom 30.09.2026

Status: **lokal geprüft, Veröffentlichung zurückgestellt (`hold`)**. Der Quellkandidat ist für den nächsten nativen iPhone-Test vorbereitet. Er ist keine installierbare IPA. Kein Store-/TestFlight-Upload, Git-Push, Cloud-Build oder kostenpflichtiger KI-Lauf wurde gestartet.

## Umgesetzter Endnutzer-Durchlauf

Vier Lernziele, insbesondere Thai als Oberfläche und Deutsch als Ziel: Kapitelwortschatz ohne beliebige Auffüllung, echte Szenenregeln statt fremder Grammatikfragen, vollständige Dialogbedeutungen, direkt zugängliche Kapiteltexte, Musterhilfe ohne FSRS-Gutschrift, ausgewählte gültige Rollenspielvarianten, neutrale Rückmeldung bei anderen Formulierungen und ehrlicher B1-Lesestart. Die Goethe-Prüfung ist seit 08.10.2026 entfernt. Alle neuen UI-Texte sind in 20 Wörterbüchern vorhanden. Einzelheiten stehen im CHANGELOG.

## Prüfung

| Nachweis | Ergebnis |
| --- | --- |
| TypeScript | `npx tsc --noEmit` bestanden |
| Gesamte Jest-Suite | 97 Suites, 1260 Tests bestanden |
| Nachtests der letzten Änderungen | 12 Suites, 178 Tests bestanden |
| Inhalts-Pipeline | 14 Tests bestanden |
| Katalogintegrität | `errors: []`, 22.727 Einträge |
| Expo-SDK-57-Abhängigkeiten | kompatible Patchstände; `expo install --check` aktuell |
| Produktions-Export | iOS, Android und Web mit Source Maps erfolgreich |
| Produktions-Modulgraph | keine Generator-/Anbieter-/Schlüsselmodule auf allen drei Plattformen |
| Assetvergleich | 15.197 Medienreferenzen, 45.591 Bytevergleiche, alle identisch |
| Browser | Produktionsoberfläche auf 390 × 844; vier Lernziele stichprobenartig, Thai→Deutsch ausführlicher |
| ESLint | bestehende 29 Fehler / 50 Warnungen; keine neuen Fehler in den geänderten Dateien gegenüber HEAD |
| npm Audit | 15 moderate, keine hohen/kritischen Befunde; kein inkompatibles Force-Update |

Jest und Browser belegen weder nativen Build noch Mikrofonfunktion am iPhone. Der letzte Browserfund in der Thai-Kopierhilfe (Umschrift als Tasten) wurde auf die tatsächlichen Antwortzeichen begrenzt und erneut typgeprüft/exportiert.

## Inhalt und offene Freigabepunkte

Mitgeliefert: 7.502 Vokabeln (th/en/de je 2.000, es 1.502), 28 Dialogsituationen, 15.119 Audioeinträge und 78 Bilder. Der Katalogbedarf umfasst noch 4.868 fehlende Audioeinträge, 3.745 Bilder und 996 Situationen. Das sind Lücken des gesamten Ausbauplans; Integrität und vollständiger Ausbau sind getrennte Aussagen. Versandinhalt: 431.027.734 Byte (etwa 411 MiB, unter 512 MiB).

- Für die B1-Vertiefungen fehlen geprüfte gebündelte Hörclips; Lesen ist verfügbar, Systemstimme optional. Texte benötigen eine unabhängige Sprachprüfung.
- 2.010 ausgelieferte Thai-Audioeinträge haben den Tonstatus „unchecked“. Wiedergabe ist kein Nachweis einer geprüften Tonreferenz.
- Bekannte Altfälle bleiben laut AGENTS/CHANGELOG offen, darunter alternative Hilfsverben in Stammformen, einzelne arabische Texte und Studio-Medienverwaltung.
- Bestehende ESLint- und moderate Audit-Befunde sind dokumentierte technische Restarbeit.
- Native iOS-Kompilierung, Apple-Signierung, tatsächliche Geräteprüfung und Store-Metadaten/Datenschutzangaben sind noch nicht abgenommen.

## Auf einem Mac zum iPhone-Test

Das lokale Archiv `build-verification/rc-2026-09-30/ThaiSpeaker-iPhone-RC-source.zip` enthält die versionierten Quellen und Medien ohne lokale Umgebungsdateien, Schlüssel, node_modules oder Generator-Laufprotokolle. `rc-manifest.json` enthält Quellcommit und SHA-256.

1. Archiv auf einem Mac entpacken; die zu SDK 57 passenden Xcode-/Node-Versionen installieren und das iPhone verbinden.
2. Im Projekt `npm ci` ausführen. In Xcode ein eigenes Apple-Team für `com.thailernbegleiter.app` wählen.
3. Lokal `npx expo run:ios --device --configuration Release` ausführen. Dies wurde auf dem Windows-Arbeitsplatz nicht ausgeführt.
4. App auf dem iPhone zuerst online installieren, danach im Flugmodus neu starten. Alle vier Lernziele, Dialogclips, Karteikarten, Fortschritt nach Neustart und Thai→Deutsch prüfen.
5. Mikrofonberechtigung, Aufnahme/Stopp, lokale Wiedergabe, Shadowing mit gleichzeitigem Hörclip, Unterbrechungen und Rückkehr aus dem Hintergrund prüfen. Besonderes Augenmerk auf den Wechsel der Audiokategorie während Aufnahme (`audio-mode.ts`).
6. Erst nach dokumentierter Geräteabnahme die Archivierung/Signierung für App Store Connect und die Store-Unterlagen abschließen.

Das vorhandene EAS-Profil `rc-ios` ist ebenfalls für ein echtes Gerät konfiguriert; Cloud-Anmeldung, Projektzuordnung und Apple-Zertifikate wurden hier nicht eingerichtet. Keine Zugangsdaten gehören in dieses Archiv.
