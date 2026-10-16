/**
 * Enter prüft bei Ein-Satz-Antworten (Diktat, „Sag es“, Rollenspiel), statt
 * eine neue Zeile einzufügen — wie in der Schreibübung (Testlauf 16.10.2026).
 * Mehrzeilig bleiben die Felder nur, damit lange Sätze umbrechen.
 *
 * Nativ entscheidet `submitBehavior`; react-native-web kennt nur
 * `blurOnSubmit`, das nativ von `submitBehavior` überstimmt wird.
 */
export const ENTER_PRUEFT = { submitBehavior: 'submit', blurOnSubmit: true } as const;
