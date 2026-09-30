import { compareDialogue } from './dialogue-compare';

test('German introductions accept the supplied equivalent without changing names', () => {
  const model = 'Hallo Lukas! Ich heiße Anna. Freut mich!';
  expect(compareDialogue('Hallo Lukas! Mein Name ist Anna. Freut mich!', model, 'de').bewertung).toBe('exact');
  expect(compareDialogue('Hallo Lukas! Mein Name ist Maria. Freut mich!', model, 'de').bewertung).toBe('wrong');
});
test('English introductions accept the short yes variant but retain information', () => {
  const model = 'Yes, I am. My name is Alex.';
  expect(compareDialogue('Yes, my name is Alex.', model, 'en').bewertung).toBe('exact');
  expect(compareDialogue('No, my name is Alex.', model, 'en').bewertung).toBe('wrong');
  expect(compareDialogue('Yes, my name is Anna.', model, 'en').bewertung).toBe('wrong');
});
