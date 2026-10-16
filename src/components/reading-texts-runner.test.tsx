import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ReadingTextsRunner } from './reading-texts-runner';
import { type ConversationSituation } from '@/lib/conversation/types';
import { dictionaries, type TranslationKey } from '@/lib/i18n';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
// Diese UI-Tests wählen Deutsch ausdrücklich; der Produkt-Default bleibt Englisch.
jest.mock('@/lib/i18n', () => {
  const actual = jest.requireActual('@/lib/i18n') as typeof import('@/lib/i18n');
  return { ...actual, useLocale: () => ({
    ...actual.useLocale(), uiLanguage: 'de',
    t: (key: import('@/lib/i18n').TranslationKey, params?: import('@/lib/i18n/types').TParams) => actual.translate('de', key, params),
    languageName: (code: import('@/lib/i18n').UiLanguage) => actual.languageDisplayName(code, 'de'),
  }) };
});



/** Beschriftung eines Keys in der Referenzsprache Deutsch. */
const d = (key: TranslationKey) => dictionaries.de[key]!;

const mockSzene: ConversationSituation = {
  id: 'lese-szene',
  level: 'A1',
  topic: 'greeting',
  direction: 'de_to_th',
  title: 'Leseszene',
  setting: 'Zwei Personen treffen sich.',
  scriptTurns: [
    { speaker: 'partner', thai: 'สวัสดีครับ', roman: 'sà-wàt-dii kráp', german: 'Hallo!' },
    { speaker: 'learner', thai: 'สวัสดีค่ะ ผมชอบกาแฟ', roman: '', german: 'Hallo, ich mag Kaffee.' },
    { speaker: 'partner', thai: 'อาหาร ดี', roman: '', german: 'Das Essen ist gut.' },
    { speaker: 'learner', thai: 'ขอบคุณครับ', roman: '', german: 'Danke.' },
  ],
  corrections: [],
  generatedAt: Date.UTC(2026, 8, 13),
  modelUsed: 'test',
};

const mockKarten = () => VOCABULARY_TH.map((entry) => ({ vocabId: entry.id, state: 'review' }));
jest.mock('@/lib/repository', () => ({
  loadSituations: async () => [mockSzene, {
    ...mockSzene, id: 'latin-scene', direction: 'th_to_de', title: 'Latin scene',
    scriptTurns: mockSzene.scriptTurns.map((turn, i) => ({ ...turn, german: ['Hallo', 'Mein Name ist Alex', 'Ich mag Kaffee', 'Danke'][i], roman: 'legacy-roman-' + i })),
  }],
  loadCardStatesForDirection: async () => mockKarten(),
}));
jest.mock('@/lib/audio', () => ({
  playPronunciationWithStatus: async () => ({ kind: 'tts', label: '' }),
  stopPronunciation: async () => {},
  isLanguageAvailable: async () => true,
  hasPronunciationClip: async () => false,
}));

async function rendere(element: ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer;
}

function textVon(renderer: ReactTestRenderer): string {
  const knoten: string[] = [];
  renderer.root.findAll((n) => typeof n.props.children === 'string' || Array.isArray(n.props.children)).forEach((n) => {
    const kinder = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
    kinder.forEach((kind: unknown) => {
      if (typeof kind === 'string') knoten.push(kind);
    });
  });
  return knoten.join('\n');
}

describe('ReadingTextsRunner — der ganze Weg', () => {
  it('listet die offene Szene mit ihrem Wortschatzstand', async () => {
    const renderer = await rendere(<ReadingTextsRunner direction="de_to_th" onExit={() => {}} />);
    const text = textVon(renderer);
    expect(text).toContain('Leseszene');
    // Interpoliert, samt Pluralform: kein Platzhalter darf übrig bleiben.
    expect(text).toMatch(/\d+ Wörter? aus deinem Bestand, \d+ begonnen/);
    expect(text).not.toContain('{{');
  });

  it('zeigt den Text mit Antipp-Wörtern und Verständnisfragen', async () => {
    const renderer = await rendere(<ReadingTextsRunner direction="de_to_th" onExit={() => {}} />);
    // Szene öffnen: der eine offene Knopf der Liste.
    const knoepfe = renderer.root.findAll((n) => n.props.accessibilityRole === 'button');
    const szeneKopf = knoepfe.find((n) => JSON.stringify(n.props.accessibilityLabel ?? '').includes('Leseszene'));
    expect(szeneKopf).toBeTruthy();
    await act(async () => {
      szeneKopf!.props.onPress();
    });
    const text = textVon(renderer);
    // Zeilen der Szene sind als Token da — Bestandswörter tippbar, Rest plain.
    expect(text).toContain('สวัสดี');
    expect(text).toContain(d('conversation.you'));
    expect(text).toContain(d('texts.showTranslation'));
    // Und die Fragen stehen am Ende bereit.
    expect(text).toContain(d('texts.questionsTitle'));
  });

  it('setzt die Auswahl vor jeder neuen Verständnisfrage zurück', async () => {
    const renderer = await rendere(<ReadingTextsRunner direction="de_to_th" onExit={() => {}} />);
    const press = async (label: string) => {
      const button = renderer.root.findAll((n) => n.props.accessibilityRole === 'button')
        .find((n) => n.props.accessibilityLabel === label ||
          n.findAll((child) => child.props.children === label).length > 0);
      expect(button).toBeTruthy();
      await act(async () => button!.props.onPress());
    };
    const sceneButton = renderer.root.findAll((n) => n.props.accessibilityRole === 'button')
      .find((n) => JSON.stringify(n.props.accessibilityLabel ?? '').includes('Leseszene'))!;
    await act(async () => sceneButton.props.onPress());
    await press(d('texts.questionsTitle'));
    const firstOption = renderer.root.findAll((n) => n.props.accessibilityRole === 'button' &&
      n.props.disabled === false && n.props.onPress &&
      n.findAll((child) => child.props.type === 'small').length > 0)[0];
    await act(async () => firstOption.props.onPress());
    await press(d('common.next'));
    expect(renderer.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.disabled === true)).toHaveLength(0);
    expect(textVon(renderer)).not.toContain(d('sentence.correct'));
    expect(textVon(renderer)).not.toContain(d('drill.wrong'));
  });
  it('hides legacy Roman text in both Latin quiz options and speaker prompts', async () => {
    const renderer = await rendere(<ReadingTextsRunner direction="th_to_de" onExit={() => {}} />);
    const press = async (label: string) => {
      const button = renderer.root.findAll(n => n.props.accessibilityRole === 'button')
        .find(n => String(n.props.accessibilityLabel).includes(label) || n.findAll(child => child.props.children === label).length > 0);
      expect(button).toBeTruthy();
      await act(async () => button!.props.onPress());
    };
    await press('Latin scene');
    await press(d('texts.questionsTitle'));
    expect(textVon(renderer)).not.toContain('legacy-roman-');
    const option = renderer.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.disabled === false &&
      n.findAll(child => child.props.type === 'small').length > 0)[0];
    await act(async () => option.props.onPress());
    await press(d('common.next'));
    expect(textVon(renderer)).toContain(d('texts.questionSpeaker'));
    expect(textVon(renderer)).not.toContain('legacy-roman-');
    await act(async () => renderer.unmount());
  });

});
