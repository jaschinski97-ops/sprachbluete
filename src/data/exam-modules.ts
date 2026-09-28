import { TargetDirection } from '@/lib/languages/types';

import { ExamModule } from '@/lib/exam/types';

/**
 * Mitgelieferte Prüfungsaufgaben (Phase 7).
 *
 * HERKUNFT UND GRENZEN — bitte genau lesen, bevor jemand diese Aufgaben für
 * Originalmaterial hält:
 *
 * - Die **Struktur** (welche Fertigkeiten, welche Textsorten, welche Dauern)
 *   stammt von den Seiten des Goethe-Instituts, abgerufen am 2026-08-31; die
 *   Belege stehen an den Zertifikaten in `lib/exam/types.ts`.
 * - Die **Aufgabenformate** (Auswahl A/B/C, Richtig/Falsch, Zuordnung,
 *   Lückentext) stammen aus dem Einstufungstest des Goethe-Instituts, Aufgabe
 *   für Aufgabe durchgeklickt.
 * - Die **Inhalte** hier sind dagegen selbst geschrieben. Es sind **keine**
 *   Originalaufgaben und keine Modellsätze des Goethe-Instituts. Wer echte
 *   Modellsätze will, findet sie beim Goethe-Institut selbst; die App
 *   verlinkt darauf.
 *
 * WORTSCHATZ: Die Texte sind aus dem deutschen Teil des geprüften
 * Vokabel-Grundstocks zusammengesetzt, ergänzt um elementare Funktionswörter
 * (Artikel, Präpositionen, Zahlen, Uhrzeiten, Eigennamen) und um die wenigen
 * Wörter, ohne die eine Anzeige oder Durchsage nicht als solche erkennbar
 * wäre. Das ist dieselbe Ehrlichkeit wie bei den Beispielsätzen aus Phase 2:
 * die einzelnen Wörter sind gedeckt, die Sätze als Ganzes sind nicht einzeln
 * gegen eine Quelle geprüft.
 *
 * SEIT ROADMAP v2 (Phase 4) DREI WEITERE BLÖCKE, alle mit dem Label
 * „Prüfungssimulation nach dem Format des Goethe-Zertifikats":
 *  - B1 · th→de: zehn Module am recherchierten gzb1.
 *  - A1 · en→de: sechs Module, zweisprachige Arbeitsanweisungen als
 *    englische Brücke.
 *  - A1 · de→th: acht Module nach dem Goethe-Skelett, mit Ankern an die
 *    bestehenden Thai-Clips des Katalogs (keine neuen Audio-Bedarfe).
 * Für B2 und für en/es/fr als ZIELsprache gibt es bewusst keine Aufgaben —
 * der Stand steht in `EXAM_OFFER_BY_TARGET` unten.
 */

export const BUILTIN_EXAM_MODULES: ExamModule[] = [
  /* ---------- A1 · Lesen · Auswahl ---------- */
  {
    id: 'a1-lesen-anzeige',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'Kleinanzeige: Markt',
    instruction: 'Lesen Sie die Anzeige. Klicken Sie an.',
    minutes: 6,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'MARKT AM BAHNHOF',
      body:
        'Jeden Samstag von 7 bis 13 Uhr.\n' +
        'Obst und Gemüse direkt vom Bauern.\n' +
        'Fisch nur am Vormittag.\n' +
        'Kaffee und Tee gibt es im kleinen Laden neben der Schule.',
    },
    items: [
      {
        id: 'a1-lesen-anzeige-1',
        prompt: 'Wann ist der Markt?',
        options: ['Jeden Tag.', 'Nur am Samstag.', 'Nur am Sonntag.'],
        correctIndex: 1,
        explanation: 'In der Anzeige steht „Jeden Samstag von 7 bis 13 Uhr".',
      },
      {
        id: 'a1-lesen-anzeige-2',
        prompt: 'Wo bekommen Sie Kaffee?',
        options: ['Auf dem Markt.', 'Am Bahnhof.', 'Im Laden neben der Schule.'],
        correctIndex: 2,
        explanation: 'Kaffee und Tee gibt es „im kleinen Laden neben der Schule".',
      },
      {
        id: 'a1-lesen-anzeige-3',
        prompt: 'Sie möchten Fisch kaufen. Wann kommen Sie?',
        options: ['Um 9 Uhr.', 'Um 12 Uhr.', 'Um 14 Uhr.'],
        correctIndex: 0,
        explanation:
          'Fisch gibt es nur am Vormittag, und der Markt ist von 7 bis 13 Uhr offen — 9 Uhr passt.',
      },
    ],
  },

  /* ---------- A1 · Hören · Richtig/Falsch ---------- */
  {
    id: 'a1-hoeren-nachricht',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'hoeren',
    direction: 'th_to_de',
    taskType: 'trueFalse',
    title: 'Nachricht auf dem Telefon',
    instruction: 'Sie hören eine Nachricht auf dem Telefon. Richtig oder falsch?',
    minutes: 5,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Hallo, hier ist Anna. Ich komme heute später. ' +
        'Mein Auto ist kaputt. Ich gehe zu Fuß zur Schule. ' +
        'Bitte kauf du das Obst für heute Abend. Danke!',
    },
    items: [
      {
        id: 'a1-hoeren-nachricht-1',
        prompt: 'Anna kommt später.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: 'Sie sagt: „Ich komme heute später."',
      },
      {
        id: 'a1-hoeren-nachricht-2',
        prompt: 'Anna kommt mit dem Auto.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'Ihr Auto ist kaputt, sie geht zu Fuß.',
      },
      {
        id: 'a1-hoeren-nachricht-3',
        prompt: 'Sie sollen Obst kaufen.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: 'Sie bittet: „Bitte kauf du das Obst für heute Abend."',
      },
    ],
  },

  /* ---------- A1 · Lesen · Zuordnung ---------- */
  {
    id: 'a1-lesen-zuordnung',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'matching',
    title: 'Wohin gehen Sie?',
    instruction: 'Lesen Sie die Situationen. Wohin gehen Sie? Klicken Sie an.',
    minutes: 6,
    source: 'builtin',
    stimulus: {
      kind: 'listing',
      title: 'IM ORT',
      body: 'Diese vier Orte gibt es in der Nähe.',
      entries: [
        'A — Markt: Obst, Gemüse, Fisch. Samstag 7–13 Uhr.',
        'B — Schule: Deutschkurse für Erwachsene. Montag bis Freitag.',
        'C — Laden: Kaffee, Tee, Brot. Täglich 8–20 Uhr.',
        'D — Arzt: Termine nach Vereinbarung.',
      ],
    },
    items: [
      {
        id: 'a1-lesen-zuordnung-1',
        prompt: 'Sie möchten am Sonntag Tee kaufen.',
        options: ['A — Markt', 'B — Schule', 'C — Laden', 'D — Arzt'],
        correctIndex: 2,
        explanation: 'Der Laden hat täglich offen, der Markt nur samstags.',
      },
      {
        id: 'a1-lesen-zuordnung-2',
        prompt: 'Sie möchten Deutsch lernen.',
        options: ['A — Markt', 'B — Schule', 'C — Laden', 'D — Arzt'],
        correctIndex: 1,
        explanation: 'Die Schule bietet Deutschkurse für Erwachsene an.',
      },
      {
        id: 'a1-lesen-zuordnung-3',
        prompt: 'Sie sind krank.',
        options: ['A — Markt', 'B — Schule', 'C — Laden', 'D — Arzt'],
        correctIndex: 3,
        explanation: 'Zum Arzt, Termine nach Vereinbarung.',
      },
    ],
  },

  /* ---------- A1 · Schreiben · Formular ---------- */
  {
    id: 'a1-schreiben-formular',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'schreiben',
    direction: 'th_to_de',
    taskType: 'gapFill',
    title: 'Formular für den Deutschkurs',
    instruction:
      'Lesen Sie den Text. Füllen Sie das Formular aus: Was gehört in die Lücke?',
    minutes: 8,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'DAS SCHREIBT SOMCHAI',
      body:
        'Ich heiße Somchai Wongsa. Ich komme aus Thailand und wohne seit einem Jahr ' +
        'in München, in der Bahnhofstraße 12. Ich bin 24 Jahre alt und arbeite als ' +
        'Lehrer. Ich möchte einen Deutschkurs am Abend machen.',
    },
    items: [
      {
        id: 'a1-schreiben-formular-1',
        prompt: 'Familienname: ______',
        options: ['Somchai', 'Wongsa', 'München'],
        correctIndex: 1,
        explanation:
          'Im Deutschen steht der Familienname hinten: „Somchai Wongsa" — Vorname Somchai, Familienname Wongsa.',
      },
      {
        id: 'a1-schreiben-formular-2',
        prompt: 'Straße und Hausnummer: ______',
        options: ['Bahnhofstraße 12', 'München 24', 'Thailand 12'],
        correctIndex: 0,
        explanation: 'Er wohnt „in der Bahnhofstraße 12".',
      },
      {
        id: 'a1-schreiben-formular-3',
        prompt: 'Beruf: ______',
        options: ['Arzt', 'Lehrer', 'Schüler'],
        correctIndex: 1,
        explanation: 'Er „arbeitet als Lehrer".',
      },
      {
        id: 'a1-schreiben-formular-4',
        prompt: 'Kurszeit: ______',
        options: ['am Morgen', 'am Nachmittag', 'am Abend'],
        correctIndex: 2,
        explanation: 'Er möchte einen Deutschkurs „am Abend" machen.',
      },
    ],
  },

  /* ---------- A1 · Schreiben · freier Text ---------- */
  {
    id: 'a1-schreiben-text',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'schreiben',
    direction: 'th_to_de',
    taskType: 'production',
    title: 'Kurze Nachricht an den Lehrer',
    instruction:
      'Schreiben Sie eine kurze Nachricht (etwa 30 Wörter). Schreiben Sie zu allen drei Punkten.',
    minutes: 12,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'Sie können heute nicht zum Deutschkurs kommen. Schreiben Sie Ihrem Lehrer, Herrn Meier, eine Nachricht.',
      bullets: [
        'Warum können Sie nicht kommen?',
        'Wann kommen Sie wieder?',
        'Was möchten Sie von Herrn Meier?',
      ],
      modelAnswer:
        'Sehr geehrter Herr Meier,\n\n' +
        'ich kann heute leider nicht zum Kurs kommen. Ich bin krank und gehe zum Arzt. ' +
        'Am Montag bin ich wieder da. Können Sie mir bitte die Hausaufgaben schicken?\n\n' +
        'Vielen Dank und viele Grüße\nSomchai',
      checklist: [
        'Steht am Anfang eine Anrede und am Ende ein Gruß?',
        'Sind alle drei Punkte beantwortet?',
        'Steht das Verb im Hauptsatz an zweiter Stelle?',
        'Haben alle Substantive den richtigen Artikel?',
      ],
      speakModelAnswer: false,
    },
  },

  /* ---------- A1 · Sprechen · freie Produktion ---------- */
  {
    id: 'a1-sprechen-vorstellen',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'sprechen',
    direction: 'th_to_de',
    taskType: 'production',
    title: 'Sich vorstellen',
    instruction:
      'Stellen Sie sich vor. Sprechen Sie laut — zu jedem Stichwort einen Satz.',
    minutes: 5,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'In der Prüfung stellen Sie sich in der Gruppe vor. Sie bekommen Stichwörter und sagen zu jedem einen Satz.',
      bullets: ['Name?', 'Alter?', 'Land?', 'Wohnort?', 'Beruf?', 'Sprachen?'],
      modelAnswer:
        'Ich heiße Somchai Wongsa. Ich bin vierundzwanzig Jahre alt. ' +
        'Ich komme aus Thailand. Ich wohne in München. ' +
        'Ich bin Lehrer. Ich spreche Thai, Englisch und ein bisschen Deutsch.',
      checklist: [
        'Haben Sie zu jedem Stichwort etwas gesagt?',
        'Haben Sie ganze Sätze gesprochen, nicht nur einzelne Wörter?',
        'Steht das Verb an zweiter Stelle („Ich komme aus …")?',
        'Haben Sie laut und langsam genug gesprochen?',
      ],
      speakModelAnswer: true,
    },
  },

  /* ---------- A2 · Lesen · Auswahl ---------- */
  {
    id: 'a2-lesen-email',
    certificate: 'gzsd2',
    level: 'A2',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'E-Mail von einem Freund',
    instruction: 'Lesen Sie die E-Mail. Klicken Sie an.',
    minutes: 8,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'VON: NIRAN — BETREFF: SAMSTAG',
      body:
        'Hallo,\n\n' +
        'am Samstag habe ich Zeit. Wollen wir zusammen auf den Markt gehen? ' +
        'Ich möchte Fisch und Gemüse kaufen, das ist dort billiger als im Laden. ' +
        'Danach können wir einen Kaffee trinken.\n\n' +
        'Ich hole dich um halb acht ab. Mein Auto ist leider in der Werkstatt, ' +
        'wir fahren also mit dem Bus. Schreib mir bitte bis Freitag.\n\n' +
        'Viele Grüße\nNiran',
    },
    items: [
      {
        id: 'a2-lesen-email-1',
        prompt: 'Was möchte Niran am Samstag machen?',
        options: [
          'Auf den Markt gehen.',
          'Ein Auto kaufen.',
          'Zu Hause bleiben.',
        ],
        correctIndex: 0,
        explanation: 'Er fragt: „Wollen wir zusammen auf den Markt gehen?"',
      },
      {
        id: 'a2-lesen-email-2',
        prompt: 'Warum kauft Niran auf dem Markt?',
        options: [
          'Der Markt ist näher.',
          'Es ist dort billiger als im Laden.',
          'Der Laden hat am Samstag zu.',
        ],
        correctIndex: 1,
        explanation: '„… das ist dort billiger als im Laden."',
      },
      {
        id: 'a2-lesen-email-3',
        prompt: 'Wie kommen die beiden zum Markt?',
        options: ['Mit dem Auto.', 'Mit dem Bus.', 'Zu Fuß.'],
        correctIndex: 1,
        explanation: 'Sein Auto ist in der Werkstatt: „wir fahren also mit dem Bus".',
      },
      {
        id: 'a2-lesen-email-4',
        prompt: 'Bis wann soll die Antwort kommen?',
        options: ['Bis Donnerstag.', 'Bis Freitag.', 'Bis Samstag.'],
        correctIndex: 1,
        explanation: '„Schreib mir bitte bis Freitag."',
      },
    ],
  },

  /* ---------- A2 · Hören · Auswahl ---------- */
  {
    id: 'a2-hoeren-durchsage',
    certificate: 'gzsd2',
    level: 'A2',
    skill: 'hoeren',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'Durchsage im Kaufhaus',
    instruction: 'Sie hören eine öffentliche Durchsage. Klicken Sie an.',
    minutes: 6,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Liebe Kundinnen und Kunden, wir schließen heute schon um achtzehn Uhr. ' +
        'Im ersten Stock finden Sie heute Obst und Gemüse zum halben Preis. ' +
        'Bitte kommen Sie mit Ihrem Einkauf bis Viertel vor sechs zur Kasse. Vielen Dank.',
    },
    items: [
      {
        id: 'a2-hoeren-durchsage-1',
        prompt: 'Wann schließt das Kaufhaus heute?',
        options: ['Um 17 Uhr.', 'Um 18 Uhr.', 'Um 20 Uhr.'],
        correctIndex: 1,
        explanation: '„… wir schließen heute schon um achtzehn Uhr."',
      },
      {
        id: 'a2-hoeren-durchsage-2',
        prompt: 'Was ist heute billiger?',
        options: ['Obst und Gemüse.', 'Kaffee und Tee.', 'Fisch und Fleisch.'],
        correctIndex: 0,
        explanation: 'Im ersten Stock gibt es Obst und Gemüse zum halben Preis.',
      },
      {
        id: 'a2-hoeren-durchsage-3',
        prompt: 'Wann sollen Sie an der Kasse sein?',
        options: ['Bis 17:45 Uhr.', 'Bis 18:15 Uhr.', 'Bis 18:45 Uhr.'],
        correctIndex: 0,
        explanation: '„Viertel vor sechs" ist 17:45 Uhr.',
      },
    ],
  },

  /* =====================================================================
   * B1 · th→de (Roadmap v2, Phase 4). Erstes echtes Übungspaket auf B1:
   * Lesen (Anzeigen, Wegbeschreibung, Blog, Lückentext mit Wortbox),
   * Hören (Durchsage, Gespräch, Ankündigung), Schreiben (E-Mail mit
   * Lücken, Forumsbeitrag), Sprechen (Thema mit Partner). Struktur nach
   * dem recherchierten gzb1 (siehe lib/exam/types.ts), Inhalte selbst
   * geschrieben — Prüfungssimulation nach dem Format des Goethe-
   * Zertifikats, keine offizielle Zertifizierung.
   * =================================================================== */

  /* ---------- B1 · Lesen · Zuordnung ---------- */
  {
    id: 'b1-lesen-anzeigen',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'matching',
    title: 'Kurze Anzeigen',
    instruction:
      'Lesen Sie die vier Anzeigen. Welche Anzeige passt zu welcher Situation?',
    minutes: 14,
    source: 'builtin',
    stimulus: {
      kind: 'listing',
      title: 'AUS DER STADTZEITUNG',
      body: 'Diese vier Anzeigen stehen diese Woche in der Stadtzeitung.',
      entries: [
        'A — „Zimmer frei": Helles Zimmer (16 m²) in 3er-WG, 380 € warm, ab 1. März. ' +
          'Wir suchen eine ruhige Person, Nichtrauchen erwünscht. Melden Sie sich unter wohnen@stadt-post.de.',
        'B — „Suche Nachhilfe": Meine Tochter (14) braucht Hilfe in Mathematik, zweimal pro Woche, ' +
          'nachmittags bei uns zu Hause. Bezahlung nach Vereinbarung, bitte telefonisch: 0176 555 019.',
        'C — „Verkaufe Damenfahrrad": Sieben Jahre alt, aber gut erhalten, neue Bremsen, ' +
          'zwei Lichter und ein Fahrradschloss gehören dazu. Nur 90 €, wegen Umzugs günstig abzugeben.',
        'D — „Aushilfe gesucht": Kleines Café am Rathaus sucht eine Aushilfe für die Nachmittage ' +
          'von Donnerstag bis Sonntag. Erfahrung im Umgang mit Gästen ist nützlich, aber nicht nötig.',
      ],
    },
    items: [
      {
        id: 'b1-lesen-anzeigen-1',
        prompt:
          'Sie ziehen im Frühjahr in eine andere Stadt und möchten nicht allein wohnen.',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation:
          'Anzeige A bietet ein Zimmer in einer 3er-WG — man wohnt also mit anderen zusammen.',
      },
      {
        id: 'b1-lesen-anzeigen-2',
        prompt: 'Sie hatten früher selbst Schwierigkeiten mit Mathematik und verdienen etwas Geld dazu.',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        explanation: 'Anzeige B sucht Nachhilfe in Mathematik und zahlt nach Vereinbarung.',
      },
      {
        id: 'b1-lesen-anzeigen-3',
        prompt: 'Sie ziehen weit weg und brauchen Ihr Fahrrad dort nicht mehr.',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 2,
        explanation: 'Anzeige C verkauft ein Fahrrad „wegen Umzugs".',
      },
      {
        id: 'b1-lesen-anzeigen-4',
        prompt: 'Sie studieren und haben nur am Wochenende Zeit für einen Nebenjob.',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 3,
        explanation:
          'Anzeige D sucht eine Aushilfe von Donnerstag bis Sonntag — das Wochenende ist eingeschlossen.',
      },
    ],
  },

  /* ---------- B1 · Lesen · Auswahl ---------- */
  {
    id: 'b1-lesen-wegbeschreibung',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'Wegbeschreibung per E-Mail',
    instruction: 'Lesen Sie die E-Mail. Klicken Sie an.',
    minutes: 15,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'VON: MALIN — BETREFF: WIE DU ZUM KURS KOMMST',
      body:
        'Hallo Somchai,\n\n' +
        'du willst also am Dienstag zum Konversationskurs ins Kulturzentrum. Das ist einfacher, ' +
        'als du denkst. Nimm nicht den Bus — der fährt zwar direkt dorthin, steht aber am Abend ' +
        'im Stau. Fährst du mit dem Rad, bist du in einer Viertelstunde da.\n\n' +
        'Am Kulturzentrum vorbei, dann links in die Gartenstraße. Der Eingang zum Kursraum ist ' +
        'nicht vorne, sondern im Innenhof — man sieht ihn leicht nicht, das Schild hängt erst ' +
        'seit letzter Woche. Frag am besten an der Theke im Erdgeschoss nach Frau Berger, ' +
        'sie leitet den Kurs und weiß, dass du kommst.\n\n' +
        'Bring bitte deinen Sprachpass mit, den möchten sie dort kopieren. Und: Der Kurs beginnt ' +
        'erst um Viertel nach sieben, du musst also nicht rennen.\n\n' +
        'Viele Grüße\nMalin',
    },
    items: [
      {
        id: 'b1-lesen-wegbeschreibung-1',
        prompt: 'Warum rät Malin vom Bus ab?',
        options: [
          'Er fährt nicht zum Kulturzentrum.',
          'Er hat am Abend viel Verkehr.',
          'Er ist zu teuer.',
        ],
        correctIndex: 1,
        explanation: '„… der fährt zwar direkt dorthin, steht aber am Abend im Stau."',
      },
      {
        id: 'b1-lesen-wegbeschreibung-2',
        prompt: 'Wo liegt der Eingang zum Kursraum?',
        options: [
          'Vorne am Kulturzentrum.',
          'In der Gartenstraße an der Ecke.',
          'Im Innenhof.',
        ],
        correctIndex: 2,
        explanation: '„Der Eingang zum Kursraum ist nicht vorne, sondern im Innenhof."',
      },
      {
        id: 'b1-lesen-wegbeschreibung-3',
        prompt: 'Was soll Somchai mitbringen?',
        options: ['Ein Foto.', 'Seinen Sprachpass.', 'Ein Schild.'],
        correctIndex: 1,
        explanation: '„Bring bitte deinen Sprachpass mit, den möchten sie dort kopieren."',
      },
      {
        id: 'b1-lesen-wegbeschreibung-4',
        prompt: 'Wann beginnt der Kurs?',
        options: ['Um 7 Uhr.', 'Um 7:15 Uhr.', 'Um 7:45 Uhr.'],
        correctIndex: 1,
        explanation: '„Der Kurs beginnt erst um Viertel nach sieben" — also um 7:15 Uhr.',
      },
    ],
  },

  /* ---------- B1 · Lesen · Richtig/Falsch ---------- */
  {
    id: 'b1-lesen-blog',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'trueFalse',
    title: 'Blog-Beitrag: Ein Jahr in Deutschland',
    instruction: 'Lesen Sie den Blog-Beitrag. Richtig oder falsch?',
    minutes: 14,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'BLOG „SOMCHAI IN DEUTSCHLAND" — APRIL',
      body:
        'Letzte Woche hatte ich ein Erlebnis, das ich gern weitererzähle. Ich stand beim Bäcker ' +
        'und wollte Brötchen für das Wochenende kaufen. Hinter mir wurde eine ältere Dame ' +
        'unruhig, weil die Schlange so lang war. Ich habe ihr spontan meinen Platz angeboten. ' +
        'Sie hat sich sehr gefreut und mir zum Dank ein kleines Rezept für einen Kuchen ' +
        'aufgeschrieben.\n\n' +
        'Als ich nach Deutschland kam, hatte ich Angst, Fehler zu machen. Heute weiß ich: ' +
        'Die meisten Menschen verzeihen Fehler gern, wenn man es versucht. Mein Deutsch ist ' +
        'natürlich noch nicht perfekt — am Telefon fällt es mir noch schwer, weil ich die ' +
        'Person nicht sehe. Aber im Geschäft, in der S-Bahn und jetzt auch beim Bäcker traue ' +
        'ich mich immer mehr.\n\n' +
        'Im Sommer möchte ich einen Ausflug an die Nordsee machen. Kennt jemand eine günstige ' +
        'Unterkunft? Schreibt mir in die Kommentare!',
    },
    items: [
      {
        id: 'b1-lesen-blog-1',
        prompt: 'Somchai hat der Dame seinen Platz in der Schlange angeboten.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„Ich habe ihr spontan meinen Platz angeboten."',
      },
      {
        id: 'b1-lesen-blog-2',
        prompt: 'Die Dame hat ihm für den Kuchen bezahlt.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'Sie hat ihm ein Rezept aufgeschrieben — von Geld steht nichts.',
      },
      {
        id: 'b1-lesen-blog-3',
        prompt: 'Am Telefon fällt Somchai das Sprechen noch schwer.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„… am Telefon fällt es mir noch schwer, weil ich die Person nicht sehe."',
      },
      {
        id: 'b1-lesen-blog-4',
        prompt: 'Er hat die Reise an die Nordsee schon gebucht.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'Er möchte im Sommer fahren und fragt nach einer günstigen Unterkunft — gebucht hat er noch nichts.',
      },
    ],
  },

  /* ---------- B1 · Lesen · Lückentext mit Wortbox ---------- */
  {
    id: 'b1-lesen-lueckentext',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'lesen',
    direction: 'th_to_de',
    taskType: 'gapFill',
    title: 'Lückentext: Hinweis im Wohnheim',
    instruction:
      'Lesen Sie den Text. Setzen Sie die Lücken mit Wörtern aus der Wortbox.',
    minutes: 12,
    source: 'builtin',
    stimulus: {
      kind: 'listing',
      title: 'AM SCHWARZEN BRETT',
      body:
        'Liebe Bewohnerinnen und Bewohner,\n\n' +
        'ab Montag (1) ______ das Warmwasser in den Zimmern 3 bis 7 wegen Arbeiten im Keller. ' +
        'Die Arbeiten dauern voraussichtlich drei Tage. Duschen können Sie in dieser Zeit im ' +
        'Erdgeschoss, der Raum ist dort (2) ______. ' +
        'Die Küche im Erdgeschoss können Sie natürlich (3) ______ — das Warmwasser dort bleibt, ' +
        'die Leitungen sind aber laut Handwerker (4) ______ geschaltet.\n\n' +
        'Bei Fragen melden Sie sich bei Herrn Schulz im Büro.',
      entries: [
        'Wortbox: wird abgestellt · von fünf bis zehn Uhr geöffnet · benutzen · vom Netz',
      ],
    },
    items: [
      {
        id: 'b1-lesen-lueckentext-1',
        prompt: 'Lücke (1): ______ das Warmwasser …',
        options: ['wird abgestellt', 'abgestellt wird', 'abgestellt werden'],
        correctIndex: 0,
        explanation:
          'Das Passiv im Hauptsatz: „das Warmwasser wird abgestellt". Das Verb steht an zweiter Stelle.',
      },
      {
        id: 'b1-lesen-lueckentext-2',
        prompt: 'Lücke (2): der Raum ist dort ______.',
        options: ['von fünf bis zehn Uhr geöffnet', 'geöffnet von fünf bis zehn Uhr', 'öffnet von fünf bis zehn Uhr'],
        correctIndex: 0,
        explanation:
          'Nach „ist" steht das Partizip „geöffnet" am Satzende; die Zeitangabe davor: „von fünf bis zehn Uhr geöffnet".',
      },
      {
        id: 'b1-lesen-lueckentext-3',
        prompt: 'Lücke (3): Die Küche … können Sie natürlich ______.',
        options: ['benutzen', 'benutzt', 'zu benutzen'],
        correctIndex: 0,
        explanation:
          'Nach „können" steht der Infinitiv am Satzende: „Sie können die Küche benutzen".',
      },
      {
        id: 'b1-lesen-lueckentext-4',
        prompt: 'Lücke (4): die Leitungen sind ______ geschaltet.',
        options: ['vom Netz', 'vom Netze', 'aus Netz'],
        correctIndex: 0,
        explanation: 'Feste Wendung: „vom Netz (getrennt) geschaltet" — mit Dativ „vom".',
      },
    ],
  },

  /* ---------- B1 · Hören · Auswahl ---------- */
  {
    id: 'b1-hoeren-bahndurchsage',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'hoeren',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'Durchsage am Bahnhof',
    instruction: 'Sie hören eine Durchsage am Bahnhof. Klicken Sie an.',
    minutes: 10,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Meine Damen und Herren, eine Information für Reisende nach Hamburg: Der Intercity ' +
        '1034 von Gleis 7 fährt heute wegen Bauarbeiten erst von Gleis 11 ab, Verspätung ' +
        'etwa zehn Minuten. Reisende nach Kiel bitten wir, im vorderen Teil des Zuges zu ' +
        'fahren, dort wird der Wagen in Elmshorn getrennt. Bitte beachten Sie die ' +
        'Anzeigen an den Gleisen.',
    },
    items: [
      {
        id: 'b1-hoeren-bahndurchsage-1',
        prompt: 'Von welchem Gleis fährt der Zug nach Hamburg heute?',
        options: ['Von Gleis 7.', 'Von Gleis 11.', 'Von Gleis 4.'],
        correctIndex: 1,
        explanation: '„… fährt heute wegen Bauarbeiten erst von Gleis 11 ab."',
      },
      {
        id: 'b1-hoeren-bahndurchsage-2',
        prompt: 'Wie spät ist der Zug ungefähr?',
        options: ['Etwa zehn Minuten.', 'Etwa vierzig Minuten.', 'Der Zug fällt aus.'],
        correctIndex: 0,
        explanation: '„Verspätung etwa zehn Minuten."',
      },
      {
        id: 'b1-hoeren-bahndurchsage-3',
        prompt: 'Was wird Reisenden nach Kiel geraten?',
        options: [
          'Umzusteigen in Hamburg.',
          'Vorne im Zug zu sitzen.',
          'Einen anderen Tag zu fahren.',
        ],
        correctIndex: 1,
        explanation: '„… bitten wir, im vorderen Teil des Zuges zu fahren" — der Wagen wird in Elmshorn getrennt.',
      },
    ],
  },

  /* ---------- B1 · Hören · Auswahl ---------- */
  {
    id: 'b1-hoeren-gespraech-praktikum',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'hoeren',
    direction: 'th_to_de',
    taskType: 'multipleChoice',
    title: 'Telefonat über ein Praktikum',
    instruction: 'Sie hören ein kurzes Telefonat. Klicken Sie an.',
    minutes: 11,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Frau Berger, hier ist Somchai. Sie hatten angeboten, dass ich im Mai im Kindergarten ' +
        'mitmachen darf. Ich wollte fragen: Kann ich zwei Wochen früher anfangen, also schon ' +
        'in den Osterferien? Da hätte ich mehr Zeit. — Herr Somchai, das geht leider nicht, ' +
        'in den Ferien ist das Haus geschlossen. Aber Sie können gern eine Woche dranhängen, ' +
        'dann sind Sie insgesamt vier Wochen da. — Das klingt gut. Und was brauche ich für ' +
        'die Gesundheit? Ein Zeugnis vom Arzt? — Nur eine Impfbescheinigung, den Rest machen ' +
        'wir mit Ihnen zusammen am ersten Tag.',
    },
    items: [
      {
        id: 'b1-hoeren-gespraech-praktikum-1',
        prompt: 'Was möchte Somchai eigentlich?',
        options: [
          'Zwei Wochen früher anfangen.',
          'Eine Woche kürzen.',
          'Im Juni anfangen.',
        ],
        correctIndex: 0,
        explanation: 'Er fragt, ob er schon in den Osterferien — zwei Wochen früher — anfangen kann.',
      },
      {
        id: 'b1-hoeren-gespraech-praktikum-2',
        prompt: 'Was wird vereinbart?',
        options: [
          'Start in den Ferien.',
          'Vier Wochen insgesamt.',
          'Abbruch nach drei Wochen.',
        ],
        correctIndex: 1,
        explanation: '„Sie können gern eine Woche dranhängen, dann sind Sie insgesamt vier Wochen da."',
      },
      {
        id: 'b1-hoeren-gespraech-praktikum-3',
        prompt: 'Was muss Somchai mitbringen?',
        options: ['Ein ärztliches Zeugnis.', 'Eine Impfbescheinigung.', 'Nichts.'],
        correctIndex: 1,
        explanation: '„Nur eine Impfbescheinigung" — ein ärztliches Zeugnis ist nicht nötig.',
      },
    ],
  },

  /* ---------- B1 · Hören · Richtig/Falsch ---------- */
  {
    id: 'b1-hoeren-kursankuendigung',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'hoeren',
    direction: 'th_to_de',
    taskType: 'trueFalse',
    title: 'Ankündigung im Deutschkurs',
    instruction: 'Sie hören eine Ankündigung Ihrer Kursleiterin. Richtig oder falsch?',
    minutes: 9,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Liebe Kursgruppe, am kommenden Donnerstag, dem vierzehnten, treffen wir uns nicht im ' +
        'Kursraum, sondern in der Stadtbücherei. Wir lesen dort kurze Zeitungstexte und ' +
        'sprechen darüber. Bitte bringen Sie Ihren Ausweis mit, sonst dürfen Sie nicht in ' +
        'den Lesesaal. Der Kurs am Donnerstag danach fällt aus, weil ich auf einer Tagung ' +
        'bin — Sie bekommen von mir Übungsaufgaben per E-Mail.',
    },
    items: [
      {
        id: 'b1-hoeren-kursankuendigung-1',
        prompt: 'Am vierzehnten trifft sich der Kurs in der Bücherei.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„… treffen wir uns nicht im Kursraum, sondern in der Stadtbücherei."',
      },
      {
        id: 'b1-hoeren-kursankuendigung-2',
        prompt: 'Ohne Ausweis kommt man in den Lesesaal.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: '„Bitte bringen Sie Ihren Ausweis mit, sonst dürfen Sie nicht in den Lesesaal."',
      },
      {
        id: 'b1-hoeren-kursankuendigung-3',
        prompt: 'Der Kurs am Tag nach dem Büchereibesuch fällt aus.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„Der Kurs am Donnerstag danach fällt aus" — die Leiterin ist auf einer Tagung.',
      },
    ],
  },

  /* ---------- B1 · Schreiben · E-Mail mit Lücken ---------- */
  {
    id: 'b1-schreiben-email-luecken',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'schreiben',
    direction: 'th_to_de',
    taskType: 'gapFill',
    title: 'E-Mail an die Vermieterin',
    instruction:
      'Lesen Sie die E-Mail. Setzen Sie die Lücken mit Wörtern aus der Wortbox.',
    minutes: 14,
    source: 'builtin',
    stimulus: {
      kind: 'listing',
      title: 'ENTWURF: E-MAIL AN FRAU WAGNER',
      body:
        'Sehr geehrte Frau Wagner,\n\n' +
        'ich schreibe Ihnen wegen der Heizung in meinem Zimmer. Seit drei Tagen ist der ' +
        'Heizkörper kalt, obwohl ich das Ventil ganz aufgedreht (1) ______. ' +
        'In der Nacht höre ich außerdem ein seltsames Geräusch aus der Leitung.\n\n' +
        'Könnten Sie bitte (2) ______, dass sich jemand um die Heizung kümmert? ' +
        'Ich bin untertags im Büro, nachmittags ab sechs Uhr aber zu (3) ______. ' +
        'Sollte der Handwerker kommen, während ich nicht da (4) ______, ' +
        'gibt meine Nachbarin ihm gern die Tür auf.\n\n' +
        'Vielen Dank im Voraus und freundliche Grüße\nSomchai Wongsa, Zimmer 12',
      entries: [
        'Wortbox: habe · dafür sorgen · bin · Haus',
      ],
    },
    items: [
      {
        id: 'b1-schreiben-email-luecken-1',
        prompt: 'Lücke (1): … obwohl ich das Ventil ganz aufgedreht ______.',
        options: ['habe', 'bin', 'hatte'],
        correctIndex: 0,
        explanation: 'Perfekt mit „haben": „ich habe aufgedreht".',
      },
      {
        id: 'b1-schreiben-email-luecken-2',
        prompt: 'Lücke (2): Könnten Sie bitte ______, dass …',
        options: ['dafür sorgen', 'sorgen dafür', 'für sorgen'],
        correctIndex: 0,
        explanation:
          'Feste Wendung mit „dass": „(dafür) sorgen, dass …". Vor „dass" steht der Infinitivteil: „dafür sorgen".',
      },
      {
        id: 'b1-schreiben-email-luecken-3',
        prompt: 'Lücke (3): nachmittags ab sechs Uhr aber zu ______.',
        options: ['Haus', 'hause', 'Wohnung'],
        correctIndex: 0,
        explanation: 'Feste Wendung: „zu Hause sein" — mit „hause" wäre es „nach Hause", das passt hier nicht.',
      },
      {
        id: 'b1-schreiben-email-luecken-4',
        prompt: 'Lücke (4): … während ich nicht da ______.',
        options: ['bin', 'sein', 'war'],
        correctIndex: 0,
        explanation: 'Im Nebensatz mit „während" steht die Gegenwart: „während ich nicht da bin".',
      },
    ],
  },

  /* ---------- B1 · Schreiben · Forumsbeitrag ---------- */
  {
    id: 'b1-schreiben-forum',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'schreiben',
    direction: 'th_to_de',
    taskType: 'production',
    title: 'Forumsbeitrag: Meinung schreiben',
    instruction:
      'Schreiben Sie einen Beitrag für ein Internetforum (etwa 80 Wörter). Gehen Sie auf alle drei Punkte ein.',
    minutes: 25,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'Im Forum „Leben in der Stadt" diskutieren Menschen über die Frage: Sollte die Innenstadt ' +
        'an Samstagen autofrei sein? Schreiben Sie Ihren Beitrag.',
      bullets: [
        'Wie ist die Situation in Ihrer Stadt?',
        'Welche Vorteile hätte eine autofreie Innenstadt — für wen?',
        'Wo sehen Sie ein Problem? Wie könnte man es lösen?',
      ],
      modelAnswer:
        'Hallo zusammen,\n\n' +
        'ich wohne in einer Stadt mit 200 000 Einwohnern. An den Samstagen fahren sehr viele Autos ' +
        'in die Innenstadt, und die Luft ist dann schlecht. Ich finde eine autofreie Innenstadt gut. ' +
        'Vorteile hätte das vor allem für Familien mit Kindern und für ältere Menschen: weniger Lärm, ' +
        'mehr Platz, und man kann sicher über die Straße gehen. Die Geschäfte hätten sicher auch mehr ' +
        'Gäste, weil ein Stadtbummel ohne Autos Spaß macht.\n\n' +
        'Ein Problem sehe ich für Menschen, die weit draußen wohnen. Sie brauchen das Auto, um ' +
        'einkaufen zu fahren. Meine Idee: Die Stadt sollte an den Rändern billige Parkplätze bauen ' +
        'und einen kostenlosen Bus in die Innenstadt fahren lassen. So käme jeder rein — ohne Auto.\n\n' +
        'Was denkt ihr?\nSomchai',
      checklist: [
        'Gibt es eine klare Anrede und einen Schluss?',
        'Sind alle drei Punkte beantwortet?',
        'Haben Sie Ihre Meinung mit „ich finde / ich bin der Meinung" gesagt?',
        'Sind die Sätze verbunden (weil, deshalb, obwohl)?',
      ],
      speakModelAnswer: true,
    },
  },

  /* ---------- B1 · Sprechen · Thema mit Partner ---------- */
  {
    id: 'b1-sprechen-thema',
    certificate: 'gzb1',
    level: 'B1',
    skill: 'sprechen',
    direction: 'th_to_de',
    taskType: 'production',
    title: 'Gemeinsam planen: Ausflug',
    instruction:
      'Sprechen Sie mit einer zweiten Person über das Thema. Planen Sie gemeinsam und äußern Sie Ihre Meinung.',
    minutes: 15,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'Ihr Sprachkurs möchte im Sommer einen Tagesausflug machen. Sprechen Sie mit Ihrem Partner ' +
        'oder Ihrer Partnerin: Wohin soll die Fahrt gehen, was kostet sie, wer organisiert was?',
      bullets: [
        'Ziel: See, alte Stadt oder Bergwanderung?',
        'Fahrt: Bus, Bahn oder Fahrräder?',
        'Essen: Picknick oder Restaurant?',
        'Wer fragt bei der Kursleitung nach und wer sammelt das Geld?',
      ],
      modelAnswer:
        'Ich würde gern an den See fahren. Im Sommer ist es dort schön, und wir können schwimmen ' +
        'und grillen. Mit dem Bus wären wir in einer Stunde dort, das ist billiger als die Bahn, ' +
        'weil wir eine Gruppe sind. Ich schlage vor, jeder bringt etwas zum Picknick mit — dann ' +
        'kostet es fast nichts. Ich kann bei der Kursleitung nachfragen, ob wir einen Bus ' +
        'bestellen können. Kannst du das Geld sammeln und eine Liste mit den Namen machen?',
      checklist: [
        'Haben Sie Vorschläge gemacht („ich schlage vor …", „wir könnten …")?',
        'Haben Sie auf die Meinung der anderen Person reagiert?',
        'Waren Sie sich am Ende über alle vier Punkte einig?',
        'Haben Sie Fragen gestellt, nicht nur Antworten gegeben?',
      ],
      speakModelAnswer: true,
    },
  },

  /* =====================================================================
   * A1 · en→de (Roadmap v2: Englisch als Brückensprache). Erster Start
   * für Menschen, die über Englisch Deutsch lernen: dieselbe Struktur wie
   * das th→de-A1-Paket (gzsd1), aber die Arbeitsanweisungen und Hilfen
   * sind zweisprachig Englisch/Deutsch. Prüfungssimulation nach dem
   * Format des Goethe-Zertifikats — keine offizielle Zertifizierung.
   * =================================================================== */

  /* ---------- A1 (en→de) · Lesen · Auswahl ---------- */
  {
    id: 'a1-en-lesen-bibliothek',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'en_to_de',
    taskType: 'multipleChoice',
    title: 'Notice at the library / Anzeige in der Bücherei',
    instruction: 'Lesen Sie die Anzeige. Klicken Sie an. / Read the notice.',
    minutes: 6,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'STADTBÜCHEREI — INFORMATION',
      // Der Prüfungstext ist deutsch wie in der echten Prüfung (Testrunde
      // 26.09.: vorher zweisprachig mit Englisch zuerst und englischen
      // Antworten — man konnte alles auf Englisch lösen).
      body:
        'Montag bis Freitag: 9–20 Uhr\n' +
        'Samstag: 9–13 Uhr\n' +
        'Sonntag: geschlossen\n\n' +
        'Bücher sind kostenlos. Kopien kosten 10 Cent.\n' +
        'Zum Anmelden bringen Sie bitte Ihren Pass mit.',
    },
    items: [
      {
        id: 'a1-en-lesen-bibliothek-1',
        prompt: 'Wann ist die Bücherei geschlossen? / When is the library closed?',
        options: ['Am Samstag.', 'Am Sonntag.', 'Am Montag.'],
        correctIndex: 1,
        explanation: '„Sonntag: geschlossen" — on Sunday the library is closed.',
      },
      {
        id: 'a1-en-lesen-bibliothek-2',
        prompt: 'Was kostet Geld? / What costs money?',
        options: ['Die Bücher.', 'Die Kopien.', 'Der Pass.'],
        correctIndex: 1,
        explanation: '„Kopien kosten 10 Cent" — books are free, copies cost money.',
      },
      {
        id: 'a1-en-lesen-bibliothek-3',
        prompt: 'Sie möchten sich anmelden. Was brauchen Sie? / You want to register. What do you need?',
        options: ['Einen Pass.', 'Ein Buch.', '10 Cent.'],
        correctIndex: 0,
        explanation: '„Zum Anmelden bringen Sie bitte Ihren Pass mit" — bring your passport to register.',
      },
    ],
  },

  /* ---------- A1 (en→de) · Hören · Richtig/Falsch ---------- */
  {
    id: 'a1-en-hoeren-anruf',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'hoeren',
    direction: 'en_to_de',
    taskType: 'trueFalse',
    title: 'Voicemail from the language school / Nachricht von der Sprachschule',
    instruction:
      'Sie hören eine Nachricht. Richtig oder falsch? / Listen to the message. True or false?',
    minutes: 5,
    source: 'builtin',
    stimulus: {
      kind: 'audio',
      body:
        'Guten Tag, hier ist die Sprachschule Lindenhof. Ihr Deutschkurs beginnt am Montag, ' +
        'den dritten Oktober, um neun Uhr. Bitte bringen Sie am ersten Tag Ihren Pass und ' +
        'einen Stift mit. Das Buch bekommen Sie bei uns im Büro. Bis Montag!',
    },
    items: [
      {
        id: 'a1-en-hoeren-anruf-1',
        prompt: 'Der Kurs beginnt am Morgen. / The course starts in the morning.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„… um neun Uhr" — neun Uhr ist am Morgen.',
      },
      {
        id: 'a1-en-hoeren-anruf-2',
        prompt: 'Sie müssen ein Buch mitbringen. / You must bring a book.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: '„Das Buch bekommen Sie bei uns im Büro" — das Buch gibt es dort, mitbringen Sie Pass und Stift.',
      },
      {
        id: 'a1-en-hoeren-anruf-3',
        prompt: 'Der Kurs beginnt am dritten Oktober. / The course starts on the third of October.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: '„Ihr Deutschkurs beginnt am Montag, den dritten Oktober".',
      },
    ],
  },

  /* ---------- A1 (en→de) · Lesen · Zuordnung ---------- */
  {
    id: 'a1-en-lesen-strasse',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'en_to_de',
    taskType: 'matching',
    title: 'On the street / Unterwegs in der Stadt',
    instruction:
      'Lesen Sie die Situationen. Wohin gehen Sie? / Read the situations. Where do you go?',
    minutes: 6,
    source: 'builtin',
    stimulus: {
      kind: 'listing',
      title: 'IN DER STADT',
      body: 'Diese vier Orte gibt es hier.',
      entries: [
        'A — Apotheke: Medikamente, Beratung. Mo–Fr 8–18 Uhr.',
        'B — Post: Briefe, Pakete, Briefmarken. Mo–Sa 9–12 und 14–17 Uhr.',
        'C — Bäckerei: Brot, Brötchen, Kuchen. Täglich 7–17 Uhr.',
        'D — Sparkasse: Geld, Konto, Rechnungen. Mo–Fr 9–16 Uhr.',
      ],
    },
    items: [
      {
        id: 'a1-en-lesen-strasse-1',
        prompt: 'Sie haben Kopfschmerzen. / You have a headache.',
        options: ['A — Apotheke', 'B — Post', 'C — Bäckerei', 'D — Sparkasse'],
        correctIndex: 0,
        explanation: 'Medikamente gibt es in der Apotheke. / Medicine comes from the pharmacy.',
      },
      {
        id: 'a1-en-lesen-strasse-2',
        prompt: 'Sie möchten ein Paket nach Bangkok schicken. / You want to send a parcel to Bangkok.',
        options: ['A — Apotheke', 'B — Post', 'C — Bäckerei', 'D — Sparkasse'],
        correctIndex: 1,
        explanation: 'Pakete gehen über die Post. / Parcels go via the post office.',
      },
      {
        id: 'a1-en-lesen-strasse-3',
        prompt: 'Es ist Sonntag, und Sie möchten frisches Brot. / It is Sunday and you want fresh bread.',
        options: ['A — Apotheke', 'B — Post', 'C — Bäckerei', 'D — Sparkasse'],
        correctIndex: 2,
        explanation:
          'Die Bäckerei hat täglich offen, auch sonntags. / The bakery is open every day, also on Sundays.',
      },
    ],
  },

  /* ---------- A1 (en→de) · Schreiben · Formular ---------- */
  {
    id: 'a1-en-schreiben-formular',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'schreiben',
    direction: 'en_to_de',
    taskType: 'gapFill',
    title: 'Fill in the form / Das Formular ausfüllen',
    instruction:
      'Lesen Sie den Text. Füllen Sie das Formular aus. / Read the text. Fill in the form.',
    minutes: 8,
    source: 'builtin',
    stimulus: {
      kind: 'text',
      title: 'DAS SCHREIBT EMILY',
      body:
        'Ich heiße Emily Carter. Ich bin 29 Jahre alt und komme aus Manchester. Jetzt wohne ' +
        'ich in Leipzig, in der Lindenstraße 5. Ich bin Krankenpflegerin und arbeite im ' +
        'Krankenhaus. Abends möchte ich einen Deutschkurs machen.',
    },
    items: [
      {
        id: 'a1-en-schreiben-formular-1',
        prompt: 'Familienname / Family name: ______',
        options: ['Emily', 'Carter', 'Leipzig'],
        correctIndex: 1,
        explanation:
          'In German the family name comes last: „Emily Carter" — Emily is the first name, Carter the family name.',
      },
      {
        id: 'a1-en-schreiben-formular-2',
        prompt: 'Straße und Hausnummer / Street and number: ______',
        options: ['Lindenstraße 5', 'Leipzig 29', 'Manchester 5'],
        correctIndex: 0,
        explanation: '„… wohne ich in Leipzig, in der Lindenstraße 5."',
      },
      {
        id: 'a1-en-schreiben-formular-3',
        prompt: 'Beruf / Profession: ______',
        options: ['Lehrerin', 'Ärztin', 'Krankenpflegerin'],
        correctIndex: 2,
        explanation: '„Ich bin Krankenpflegerin" — a nurse works at the hospital (im Krankenhaus).',
      },
      {
        id: 'a1-en-schreiben-formular-4',
        prompt: 'Wann möchte sie lernen? / When does she want to learn?',
        options: ['am Morgen', 'am Mittag', 'am Abend'],
        correctIndex: 2,
        explanation: '„Abends möchte ich einen Deutschkurs machen" — in the evening.',
      },
    ],
  },

  /* ---------- A1 (en→de) · Schreiben · freier Text ---------- */
  {
    id: 'a1-en-schreiben-nachricht',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'schreiben',
    direction: 'en_to_de',
    taskType: 'production',
    title: 'Short message to your neighbour / Kurze Nachricht an die Nachbarin',
    instruction:
      'Write a short message (about 30 words). Cover all three points. / Schreiben Sie eine kurze Nachricht (etwa 30 Wörter). Schreiben Sie zu allen drei Punkten.',
    minutes: 12,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'Sie machen nächsten Samstag eine Party in Ihrer Wohnung. Schreiben Sie Ihrer Nachbarin, ' +
        'Frau Krause, eine Nachricht. / You are having a party next Saturday. Write a short message to your neighbour.',
      bullets: [
        'Why do you write? / Warum schreiben Sie?',
        'When is the party? / Wann ist die Party?',
        'Say sorry for the noise. / Entschuldigen Sie sich für den Lärm.',
      ],
      modelAnswer:
        'Liebe Frau Krause,\n\n' +
        'ich habe nächsten Samstag eine kleine Party in meiner Wohnung. Die Party beginnt um ' +
        'sieben Uhr abends. Es wird leider etwas lauter, das tut mir leid. Sie sind natürlich ' +
        'auch herzlich eingeladen!\n\n' +
        'Viele Grüße\nEmily',
      checklist: [
        'Is there a greeting at the start and a closing at the end? / Steht am Anfang eine Anrede und am Ende ein Gruß?',
        'Are all three points answered? / Sind alle drei Punkte beantwortet?',
        'Is the verb in second place? / Steht das Verb im Hauptsatz an zweiter Stelle?',
      ],
      speakModelAnswer: false,
    },
  },

  /* ---------- A1 (en→de) · Sprechen · freie Produktion ---------- */
  {
    id: 'a1-en-sprechen-vorstellen',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'sprechen',
    direction: 'en_to_de',
    taskType: 'production',
    title: 'Introduce yourself / Sich vorstellen',
    instruction:
      'Introduce yourself. Say one sentence for each keyword. / Stellen Sie sich vor. Sprechen Sie zu jedem Stichwort einen Satz.',
    minutes: 5,
    source: 'builtin',
    stimulus: null,
    production: {
      task:
        'In der Prüfung stellen Sie sich in der Gruppe vor. Sie bekommen Stichwörter und sagen ' +
        'zu jedem einen Satz. / In the exam you introduce yourself in the group, one sentence per keyword.',
      bullets: [
        'Name? / Wie heißen Sie?',
        'Age? / Wie alt sind Sie?',
        'Where do you come from? / Woher kommen Sie?',
        'Where do you live? / Wo wohnen Sie?',
        'Job? / Was sind Sie von Beruf?',
      ],
      modelAnswer:
        'Ich heiße Emily Carter. Ich bin neunundzwanzig Jahre alt. Ich komme aus England, ' +
        'aus Manchester. Jetzt wohne ich in Leipzig. Ich bin Krankenpflegerin und arbeite ' +
        'im Krankenhaus.',
      checklist: [
        'Did you say a full sentence for every keyword? / Haben Sie zu jedem Stichwort einen ganzen Satz gesagt?',
        'Is the verb in second place („Ich komme aus …")? / Steht das Verb an zweiter Stelle?',
        'Did you speak loudly and slowly? / Haben Sie laut und langsam genug gesprochen?',
      ],
      speakModelAnswer: true,
    },
  },

  /* =====================================================================
   * A1 · de→th (Roadmap v2: „Thai-Format nach Goethe-Skelett"). Erste
   * Prüfungssimulation für die Gegenrichtung: das Goethe-Gerüst (gzsd1),
   * gefüllt mit Thai-Inhalten aus dem BESTAND — die Satzaufgaben und
   * Vokabel-Clips des Katalogs, keine neuen Audio-Bedarfe.
   *
   * ZWEI EHRLICHKEITSSTELLEN, die man kennen muss:
   *  1. Der Abspielknopf des Prüfungs-Screens spricht Hörstimuli über die
   *     DEUTSCHE Sprachausgabe (exam-runner, language:'de'). Der echte
   *     Thai-Clip liegt in „Sätze üben" bzw. den Gesprächen; jedes
   *     Hören-Modul nennt seine Quelle im Feld `clipAnchor` und in der
   *     Arbeitsanweisung.
   *  2. Es gibt keine offizielle Thai-Prüfung des Goethe-Instituts —
   *     dieses Paket ist eine Übung nach dem Format, keine Zertifizierung.
   * =================================================================== */

  /* ---------- A1 (de→th) · Lesen · Auswahl ---------- */
  {
    id: 'a1-th-lesen-saetze',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'de_to_th',
    taskType: 'multipleChoice',
    title: 'Thailändische Sätze lesen',
    instruction:
      'Lesen Sie die drei Sätze. Was bedeutet jeder Satz? Klicken Sie an. ' +
      '(Die Sätze kennen Sie aus „Sätze üben".)',
    minutes: 6,
    source: 'builtin',
    clipAnchor:
      'Beispielsatz-Clips aus dem Katalog (kind „example") für alle drei Sätze; ' +
      'Satzaufgaben: sentence-chan, sentence-sue, sentence-mai_neg.',
    stimulus: {
      kind: 'text',
      title: 'DREI KURZE SÄTZE',
      body:
        'Satz 1: ฉัน ไป ตลาด (chǎn bpai dtà-làat)\n' +
        'Satz 2: ผม ซื้อ ผลไม้ (pǒm sʉ́ʉ pǒn-lá-máai)\n' +
        'Satz 3: ผม ไม่ กิน หมู (pǒm mâi gin mǔu)',
    },
    items: [
      {
        id: 'a1-th-lesen-saetze-1',
        prompt: 'Was bedeutet Satz 1 — ฉัน ไป ตลาด?',
        options: ['Ich gehe zum Markt.', 'Ich gehe zur Schule.', 'Ich kaufe Obst.'],
        correctIndex: 0,
        explanation:
          'ฉัน = ich, ไป = gehen, ตลาด = Markt. Dieselbe Satzaufgabe („ฉัน ไป ตลาด") kennen Sie aus „Sätze üben".',
      },
      {
        id: 'a1-th-lesen-saetze-2',
        prompt: 'Was bedeutet Satz 2 — ผม ซื้อ ผลไม้?',
        options: ['Ich esse Obst.', 'Ich kaufe Obst.', 'Ich verkaufe Obst.'],
        correctIndex: 1,
        explanation: 'ซื้อ = kaufen (Vokabelkarte sue). Essen wäre กิน, verkaufen ขาย.',
      },
      {
        id: 'a1-th-lesen-saetze-3',
        prompt: 'Was bedeutet Satz 3 — ผม ไม่ กิน หมู?',
        options: [
          'Ich esse Schweinefleisch.',
          'Ich esse kein Schweinefleisch.',
          'Der Hund isst nichts.',
        ],
        correctIndex: 1,
        explanation: 'ไม่ verneint das Verb: ผม ไม่ กิน หมู = Ich esse KEIN Schweinefleisch (Satzaufgabe mai_neg).',
      },
    ],
  },

  /* ---------- A1 (de→th) · Lesen · Zuordnung ---------- */
  {
    id: 'a1-th-lesen-woerter',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'de_to_th',
    taskType: 'matching',
    title: 'Thailändische Wörter zuordnen',
    instruction:
      'Lesen Sie die Situationen. Welches thailändische Wort passt? Klicken Sie an.',
    minutes: 6,
    source: 'builtin',
    clipAnchor:
      'Vokabel-Clips im Katalog für alle vier Wörter: rongrian, talaat, kaafae, maew.',
    stimulus: {
      kind: 'listing',
      title: 'VIER WÖRTER AUS DEM GRUNDSTOCK',
      body: 'Diese vier Wörter stehen auf Ihren Karteikarten.',
      entries: [
        'A — โรงเรียน (róong-rian)',
        'B — ตลาด (dtà-làat)',
        'C — กาแฟ (gaa-fɛɛ)',
        'D — แมว (mɛɛo)',
      ],
    },
    items: [
      {
        id: 'a1-th-lesen-woerter-1',
        prompt: 'Dort lernen Kinder und Jugendliche. Welches Wort passt?',
        options: ['A — โรงเรียน', 'B — ตลาด', 'C — กาแฟ', 'D — แมว'],
        correctIndex: 0,
        explanation: 'โรงเรียน = Schule (Vokabelkarte rongrian).',
      },
      {
        id: 'a1-th-lesen-woerter-2',
        prompt: 'Dort kaufen Sie Obst, Fisch und Gemüse. Welches Wort passt?',
        options: ['A — โรงเรียน', 'B — ตลาด', 'C — กาแฟ', 'D — แมว'],
        correctIndex: 1,
        explanation: 'ตลาด = Markt (Vokabelkarte talaat).',
      },
      {
        id: 'a1-th-lesen-woerter-3',
        prompt: 'Sie trinken ihn morgens heiß oder kalt. Welches Wort passt?',
        options: ['A — โรงเรียน', 'B — ตลาด', 'C — กาแฟ', 'D — แมว'],
        correctIndex: 2,
        explanation: 'กาแฟ = Kaffee (Vokabelkarte kaafae; Beispielsätze กาแฟ ร้อน / กาแฟ เย็น).',
      },
      {
        id: 'a1-th-lesen-woerter-4',
        prompt: 'Dieses Tier sagt „miau". Welches Wort passt?',
        options: ['A — โรงเรียน', 'B — ตลาด', 'C — กาแฟ', 'D — แมว'],
        correctIndex: 3,
        explanation: 'แมว = Katze (Vokabelkarte maew).',
      },
    ],
  },

  /* ---------- A1 (de→th) · Lesen · Richtig/Falsch ---------- */
  {
    id: 'a1-th-lesen-verneinung',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'lesen',
    direction: 'de_to_th',
    taskType: 'trueFalse',
    title: 'Sätze mit ไม่ — Richtig oder falsch?',
    instruction:
      'Lesen Sie die thailändischen Sätze. Passt die deutsche Aussage? Richtig oder falsch?',
    minutes: 6,
    source: 'builtin',
    clipAnchor:
      'Beispielsatz-Clips aus dem Katalog (kind „example"): mai_neg, ruu, khaochai.',
    stimulus: {
      kind: 'text',
      title: 'ไม่ VERNEINT DAS VERB',
      body:
        'Satz 1: ผม ไม่ กิน หมู (pǒm mâi gin mǔu)\n' +
        'Satz 2: ผม ไม่ รู้ (pǒm mâi rúu)\n' +
        'Satz 3: ผม ไม่ เข้าใจ (pǒm mâi kâo-jai)',
    },
    items: [
      {
        id: 'a1-th-lesen-verneinung-1',
        prompt: 'Zu Satz 1: Der Sprecher isst Schweinefleisch.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'ไม่ steht vor กิน (essen) — der Sprecher isst Schweinefleisch gerade NICHT.',
      },
      {
        id: 'a1-th-lesen-verneinung-2',
        prompt: 'Zu Satz 2: Der Sprecher weiß es nicht.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: 'ผม ไม่ รู้ = Ich weiß nicht (Satzaufgabe ruu).',
      },
      {
        id: 'a1-th-lesen-verneinung-3',
        prompt: 'Zu Satz 3: Der Sprecher versteht alles.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'ผม ไม่ เข้าใจ = Ich verstehe NICHT (Satzaufgabe khaochai).',
      },
    ],
  },

  /* ---------- A1 (de→th) · Hören · Auswahl ---------- */
  {
    id: 'a1-th-hoeren-satz',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'hoeren',
    direction: 'de_to_th',
    taskType: 'multipleChoice',
    title: 'Einen Thai-Satz hören',
    instruction:
      'Hören Sie den Satz ผม อยาก กิน ข้าว in „Sätze üben" (Satzaufgabe zu อยาก) — dort liegt ' +
      'der echte Thai-Clip. Der Knopf hier spricht nur die deutsche Sprachausgabe. ' +
      'Klicken Sie an. Das Skript lesen Sie erst nach dem Auswerten.',
    minutes: 5,
    source: 'builtin',
    clipAnchor:
      'sentence-yaak — Beispielsatz-Clip im Katalog (kind „example", Text ผม อยาก กิน ข้าว).',
    stimulus: {
      kind: 'audio',
      body: 'ผม อยาก กิน ข้าว\n(pǒm yàak gin kâao)',
    },
    items: [
      {
        id: 'a1-th-hoeren-satz-1',
        prompt: 'Was möchte der Sprecher?',
        options: ['Reis essen.', 'Reis kochen.', 'Reis verkaufen.'],
        correctIndex: 0,
        explanation: 'อยาก กิน = essen möchten (Satzaufgabe yaak: ผม อยาก กิน ข้าว — Ich möchte Reis essen).',
      },
      {
        id: 'a1-th-hoeren-satz-2',
        prompt: 'Wer spricht?',
        options: ['Ein Mann (ผม).', 'Eine Frau (ดิฉัน).', 'Zwei Personen.'],
        correctIndex: 0,
        explanation: 'ผม ist die Sprecher-Form eines Mannes; eine Frau sagt ดิฉัน (oder ฉัน).',
      },
    ],
  },

  /* ---------- A1 (de→th) · Hören · Richtig/Falsch ---------- */
  {
    id: 'a1-th-hoeren-vorstellung',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'hoeren',
    direction: 'de_to_th',
    taskType: 'trueFalse',
    title: 'Eine Thai-Sprecherin hören',
    instruction:
      'Hören Sie den Satz im Gespräch „Begrüßung" (Thai-Gespräche, A1, Deutsch→Thai) — dort ' +
      'liegt der echte Thai-Clip. Der Knopf hier spricht nur die deutsche Sprachausgabe. ' +
      'Richtig oder falsch?',
    minutes: 5,
    source: 'builtin',
    clipAnchor:
      'greeting-A1-de_to_th-003#3 — Gesprächs-Turn im Katalog (kind „turn", Text ดิฉันชื่อนุกค่ะ ยินดีที่ได้รู้จักค่ะ).',
    stimulus: {
      kind: 'audio',
      body: 'ดิฉันชื่อนุกค่ะ ยินดีที่ได้รู้จักค่ะ\n(dì-chǎn chûe Núk kâ — yin-dii thîi dâi rúu-jàk kâ)',
    },
    items: [
      {
        id: 'a1-th-hoeren-vorstellung-1',
        prompt: 'Die Sprecherin stellt sich vor.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: 'ดิฉัน ชื่อ นุก = Ich heiße Nok — eine Vorstellung.',
      },
      {
        id: 'a1-th-hoeren-vorstellung-2',
        prompt: 'Sie spricht mit der höflichen Endung ค่ะ.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 0,
        explanation: 'Beide Satzteile enden auf ค่ะ — die höfliche Endung einer Sprecherin (Vokabelkarte kha).',
      },
      {
        id: 'a1-th-hoeren-vorstellung-3',
        prompt: 'Sie fragt nach dem Namen der anderen Person.',
        options: ['Richtig', 'Falsch'],
        correctIndex: 1,
        explanation: 'ยินดีที่ได้รู้จัก = „freut mich, Sie kennenzulernen" — eine Frage nach dem Namen ist nicht dabei.',
      },
    ],
  },

  /* ---------- A1 (de→th) · Hören · Auswahl ---------- */
  {
    id: 'a1-th-hoeren-markt',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'hoeren',
    direction: 'de_to_th',
    taskType: 'multipleChoice',
    title: 'Auf dem Thai-Markt hören',
    instruction:
      'Hören Sie den Satz im Gespräch „Markt" (Thai-Gespräche, A1, Deutsch→Thai) — dort liegt ' +
      'der echte Thai-Clip. Der Knopf hier spricht nur die deutsche Sprachausgabe. Klicken Sie an.',
    minutes: 5,
    source: 'builtin',
    clipAnchor:
      'market-A1-de_to_th-012#7 — Gesprächs-Turn im Katalog (kind „turn", Text ห้าสิบบาทค่ะ ขอบคุณค่ะ).',
    stimulus: {
      kind: 'audio',
      body: 'ห้าสิบบาทค่ะ ขอบคุณค่ะ\n(hâa-sìp bàat kâ — khàawp-khun kâ)',
    },
    items: [
      {
        id: 'a1-th-hoeren-markt-1',
        prompt: 'Wie viel kostet es?',
        options: ['50 Baht.', '15 Baht.', '5 Baht.'],
        correctIndex: 0,
        explanation: 'ห้า (fünf) + สิบ (zehn) = ห้าสิบ (fünfzig) — 50 Baht.',
      },
      {
        id: 'a1-th-hoeren-markt-2',
        prompt: 'Wer spricht vermutlich?',
        options: [
          'Eine Verkäuferin auf dem Markt.',
          'Eine Lehrerin in der Schule.',
          'Ein Arzt im Krankenhaus.',
        ],
        correctIndex: 0,
        explanation:
          'Baht als Geld, höfliches ค่ะ und das bedankende ขอบคุณ — das passt zu einer Verkäuferin nach dem Bezahlen.',
      },
    ],
  },

  /* ---------- A1 (de→th) · Schreiben · Lückentext ---------- */
  {
    id: 'a1-th-schreiben-luecken',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'schreiben',
    direction: 'de_to_th',
    taskType: 'gapFill',
    title: 'Thai-Sätze vervollständigen',
    instruction:
      'Lesen Sie die Sätze. Welches thailändische Wort gehört in die Lücke? ' +
      '(Alle vollständigen Sätze haben einen Clip — siehe „Sätze üben".)',
    minutes: 8,
    source: 'builtin',
    clipAnchor:
      'Beispielsatz-Clips für die vollständigen Sätze (kind „example"): kin, chan, khaao, phom.',
    stimulus: {
      kind: 'listing',
      title: 'VIER SÄTZE MIT EINER LÜCKE',
      body:
        '(1) ผม ___ ข้าว (pǒm ___ kâao)\n' +
        '(2) ฉัน ___ ตลาด (chǎn ___ dtà-làat)\n' +
        '(3) ข้าว ___ (kâao ___)\n' +
        '(4) ผม ___ กาแฟ (pǒm ___ gaa-fɛɛ)',
      entries: ['Wortbox: กิน · ไป · อร่อย · ชอบ'],
    },
    items: [
      {
        id: 'a1-th-schreiben-luecken-1',
        prompt: 'Lücke (1): ผม ___ ข้าว — „Ich esse Reis."',
        options: ['กิน', 'ไป', 'แมว'],
        correctIndex: 0,
        explanation: 'กิน = essen (Vokabelkarte kin; Satzaufgabe ผม กิน ข้าว).',
      },
      {
        id: 'a1-th-schreiben-luecken-2',
        prompt: 'Lücke (2): ฉัน ___ ตลาด — „Ich gehe zum Markt."',
        options: ['ไป', 'กิน', 'ใหม่'],
        correctIndex: 0,
        explanation: 'ไป = gehen (Vokabelkarte bpai; Satzaufgabe ฉัน ไป ตลาด).',
      },
      {
        id: 'a1-th-schreiben-luecken-3',
        prompt: 'Lücke (3): ข้าว ___ — „Der Reis ist lecker."',
        options: ['อร่อย', 'ไป', 'น้อย'],
        correctIndex: 0,
        explanation: 'อร่อย = lecker (Satzaufgabe ข้าว อร่อย). Im Thai steht das Prädikat hinten, ohne „ist".',
      },
      {
        id: 'a1-th-schreiben-luecken-4',
        prompt: 'Lücke (4): ผม ___ กาแฟ — „Ich mag Kaffee."',
        options: ['ชอบ', 'ใหญ่', 'ไม่'],
        correctIndex: 0,
        explanation:
          'ชอบ = mögen (Satzaufgabe ผม ชอบ กาแฟ). ไม่ allein passt nicht: es verneint ein Verb, und กาแฟ ist ein Nomen.',
      },
    ],
  },

  /* ---------- A1 (de→th) · Sprechen · Prompt-Karten ---------- */
  {
    id: 'a1-th-sprechen-karten',
    certificate: 'gzsd1',
    level: 'A1',
    skill: 'sprechen',
    direction: 'de_to_th',
    taskType: 'production',
    title: 'Sprechen: Drei Impulskarten',
    instruction:
      'Nehmen Sie sich eine Karte nach der anderen und sprechen Sie laut. Die Musterlösung wird ' +
      'bewusst NICHT vorgelesen — der Vorleseknopf der App spricht nur Deutsch; Thai hören Sie ' +
      'in „Sätze üben" und bei den Vokabelkarten.',
    minutes: 6,
    source: 'builtin',
    clipAnchor:
      'Vokabel-Clips für die Ankerwörter im Katalog: sawatdii, khrap, kha, khoothoot; ' +
      'Satzmuster in den Satzaufgaben (z. B. sentence-chan, sentence-sue).',
    stimulus: null,
    production: {
      task:
        'Drei Impulskarten — zu jeder Karte sagen Sie einen kurzen Thai-Satz:\n' +
        'Karte 1 — Sich vorstellen: สวัสดี ครับ/ค่ะ ผม/ดิฉัน ชื่อ … (sawatdii khráp/khâ — pǒm/dì-chǎn chûe …)\n' +
        'Karte 2 — Etwas bestellen: ขอ … หนึ่ง จาน/แก้ว ครับ/ค่ะ (khǒo … nùeng jaan/gâeo khráp/khâ)\n' +
        'Karte 3 — Nach dem Preis fragen: … เท่าไหร่ ครับ/ค่ะ? (… thâo-rài khráp/khâ?)',
      bullets: [
        'Karte 1: Nennen Sie Ihren Namen mit der richtigen Sprecherform (ผม für Männer, ดิฉัน/ฉัน für Frauen).',
        'Karte 2: Bestellen Sie ein Essen (จาน) oder ein Getränk (แก้ว) höflich mit ครับ/ค่ะ.',
        'Karte 3: Fragen Sie nach dem Preis von etwas auf dem Markt (ตลาด).',
      ],
      modelAnswer:
        'Karte 1: สวัสดีครับ ผมชื่อมาร์คุณครับ (sawatdii khráp — pǒm chûe Maakhun khráp) — Hallo, ich heiße Markus.\n' +
        'Karte 2: ขอข้าวผัดหนึ่งจานครับ (khǒo khâao-phàt nùeng jaan khráp) — einen Teller Gebratenen Reis, bitte.\n' +
        'Karte 3: ผลไม้เท่าไหร่ครับ? (pǒn-lá-máai thâo-rài khráp?) — Wie viel kostet das Obst?',
      checklist: [
        'Haben Sie bei jeder Karte die passende Endung gesagt (ครับ als Mann, ค่ะ als Frau)?',
        'Haben Sie ganze Sätze gesprochen, nicht nur einzelne Wörter?',
        'Kamen die Zahlwörter vor (หนึ่ง = eins bei der Bestellung)?',
        'Haben Sie die Karten zweimal gesprochen — einmal langsam, einmal flüssig?',
      ],
      speakModelAnswer: false,
    },
  },
];

/* ======================================================================
 * Ehrlicher Angebotsstand je ZIELsprache (Registry-Sinn, Roadmap v2).
 *
 * Diese Tabelle behauptet nichts: Was „folgt" sagt, hat die App wirklich
 * nicht, und es werden keine Fake-Inhalte nachgeschoben. Die Oberfläche
 * liest sie (noch) nicht — sie ist der Datenanker, an dem künftige
 * Screens und Tests den Stand ablesen, ohne ihn aus Modulzählern
 * zurückzurechnen.
 * ==================================================================== */

export type ExamOfferState = 'mit-inhalten' | 'geruest-ohne-inhalte' | 'folgt';

export type ExamOffer = {
  state: ExamOfferState;
  /** Richtungen, aus denen mitgelieferte Module vorliegen. */
  directions: TargetDirection[];
  /** Ehrlicher Text zum Stand — keine Werbung. */
  note: string;
};

/** Zielsprachen der Prüfungsangebote; Deutsch ist das Hauptziel (AE-19). */
export type ExamOfferTarget = 'de' | 'th' | 'en' | 'es';

export const EXAM_OFFER_BY_TARGET: Record<ExamOfferTarget, ExamOffer> = {
  de: {
    state: 'mit-inhalten',
    directions: ['th_to_de', 'en_to_de'],
    note:
      'th→de: A1, A2 und B1 haben mitgelieferte Aufgaben; B2 steht nur als Gerüst. ' +
      'en→de: A1-Start. Prüfungssimulation nach dem Format des Goethe-Zertifikats.',
  },
  th: {
    state: 'mit-inhalten',
    directions: ['de_to_th'],
    note:
      'A1-Anfang nach dem Goethe-Skelett mit Ankern an bestehende Thai-Clips. ' +
      'Es gibt keine offizielle Thai-Prüfung des Goethe-Instituts.',
  },
  en: {
    state: 'folgt',
    directions: [],
    note: 'Für Englisch als Zielsprache (de→en) liegen noch keine Prüfungsaufgaben vor.',
  },
  es: {
    state: 'folgt',
    directions: [],
    note: 'Für Spanisch als Zielsprache liegen noch keine Prüfungsaufgaben vor — bewusst leer, statt Scheinaufgaben zu zeigen.',
  },
};
