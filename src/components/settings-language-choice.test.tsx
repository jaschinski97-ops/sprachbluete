import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AppLanguageSection } from './settings-sections';

test('Sprachwahl zeigt native und englische Namen in den auswählbaren Zeilen', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<AppLanguageSection />); });
  const view = JSON.stringify(tree.toJSON());
  expect(view).toContain('العربية · Arabic');
  expect(view).toContain('ภาษาไทย · Thai');
  expect(view).toContain('Deutsch · German');
  await act(async () => tree.unmount());
});
