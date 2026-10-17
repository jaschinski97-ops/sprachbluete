import type { LanguageCode } from '@/lib/languages/types';

export type AdvancedQuestion = {
  prompt: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
  explanation: string;
  roman?: { prompt: string; options: [string, string, string]; explanation: string };
};

export type AdvancedLesson = {
  id: string;
  language: LanguageCode;
  title: string;
  paragraphs: [string, string, string];
  questions: [AdvancedQuestion, AdvancedQuestion, AdvancedQuestion];
  writingPrompt: string;
  speakingPrompt: string;
  modelAnswer: string;
  roman?: {
    title: string;
    paragraphs: [string, string, string];
    writingPrompt: string;
    speakingPrompt: string;
    modelAnswer: string;
  };
};

/** An authored first B1 practice unit per target language, bundled for offline use.
 * The label describes the intended task difficulty, not a certified learner level.
 * Audio is intentionally not bundled; the runner identifies system TTS as such.
 */
export const ADVANCED_LESSONS: Record<LanguageCode, AdvancedLesson> = {
  th: {
    id: 'course-time-th-001', language: 'th', title: 'เปลี่ยนเวลาเรียนภาษา',
    paragraphs: [
      'มินาเรียนภาษาไทยตอนเย็นมาสามเดือนแล้ว เธอชอบครูและเพื่อนร่วมชั้น เพราะทุกคนช่วยกันฝึกพูด แม้บางครั้งจะพูดผิด แต่ช่วงนี้บริษัทของเธอเปลี่ยนเวลาประชุม ทำให้เธอไปถึงห้องเรียนช้าทุกวันอังคาร',
      'สัปดาห์ที่แล้ว มินาพลาดกิจกรรมกลุ่มที่สำคัญ เธอจึงเขียนอีเมลถึงครู อธิบายว่าเธอยังอยากเรียนต่อ และถามว่าจะย้ายไปเรียนกลุ่มวันเสาร์ได้ไหม ถ้าไม่มีที่ว่าง เธออยากได้งานที่เรียนในวันอังคารไปทำที่บ้าน',
      'ครูตอบว่ากลุ่มวันเสาร์ยังมีที่ว่างหนึ่งที่ แต่เริ่มเรียนเร็วกว่ากลุ่มเดิมหนึ่งชั่วโมง มินาต้องตัดสินใจก่อนวันศุกร์ เธอคิดว่าการตื่นเช้าคงไม่ง่าย แต่ดีกว่าการพลาดบทเรียนทุกสัปดาห์',
    ],
    questions: [
      { prompt: 'ทำไมมินาจึงไปเรียนสาย?', options: ['รถไฟหยุดวิ่ง', 'เวลาประชุมที่บริษัทเปลี่ยน', 'ครูเปลี่ยนห้องเรียน'], correctIndex: 1, explanation: 'บริษัทเปลี่ยนเวลาประชุม ทำให้เธอไปถึงห้องเรียนช้า', roman: { prompt: 'tham-mai Mii-naa jʉng bpai rian sǎai?', options: ['rót-fai yùt wîng', 'wee-laa bprà-chum thîi bɔɔ-rí-sàt bplìan', 'khruu bplìan hɔ̂ng-rian'], explanation: 'bɔɔ-rí-sàt bplìan wee-laa bprà-chum tham hâi thəə bpai thʉ̌ng hɔ̂ng-rian cháa' } },
      { prompt: 'มินาขอทางเลือกอะไรถ้าย้ายกลุ่มไม่ได้?', options: ['ขอเงินคืน', 'เรียนกับครูคนใหม่', 'ขอเอางานไปทำที่บ้าน'], correctIndex: 2, explanation: 'เธอของานที่เรียนในวันอังคารไปทำที่บ้าน', roman: { prompt: 'Mii-naa khɔ̌ɔ thaang-lʉ̂ak à-rai thâa yáai glùm mâi dâai?', options: ['khɔ̌ɔ ngən khʉʉn', 'rian gàp khruu khon mài', 'khɔ̌ɔ ao ngaan bpai tham thîi bâan'], explanation: 'thəə khɔ̌ɔ ngaan thîi rian nai wan ang-khaan bpai tham thîi bâan' } },
      { prompt: 'ทำไมมินาจึงคิดจะเรียนวันเสาร์?', options: ['เธอไม่อยากพลาดบทเรียนทุกสัปดาห์', 'เธออยากตื่นเช้า', 'เพื่อนทุกคนย้ายไปแล้ว'], correctIndex: 0, explanation: 'เธอคิดว่าการตื่นเช้าดีกว่าการพลาดบทเรียนทุกสัปดาห์', roman: { prompt: 'tham-mai Mii-naa jʉng khít jà rian wan sǎo?', options: ['thəə mâi yàak phlâat bòt-rian thúk sàp-daa', 'thəə yàak dtʉ̀ʉn cháo', 'phʉ̂an thúk khon yáai bpai lɛ́ɛo'], explanation: 'thəə khít wâa gaan dtʉ̀ʉn cháo dii gwàa gaan phlâat bòt-rian thúk sàp-daa' } },
    ],
    writingPrompt: 'เขียนอีเมลถึงครู: อธิบายปัญหา เสนอทางเลือกหนึ่งอย่าง และบอกว่าทำไมทางเลือกนั้นจึงเหมาะกับคุณ',
    speakingPrompt: 'เล่าให้เพื่อนฟังว่ามินามีปัญหาอะไร และคุณจะตัดสินใจอย่างไร เพราะอะไร',
    modelAnswer: 'เรียนคุณครู ฉันอยากเรียนต่อ แต่มีประชุมที่ทำงานทุกวันอังคาร ทำให้ไปถึงห้องเรียนสาย ฉันขอย้ายไปกลุ่มวันเสาร์ได้ไหมคะ เพราะจะได้เข้าร่วมกิจกรรมตั้งแต่ต้น ขอบคุณค่ะ',
    roman: {
      title: 'bplìan wee-laa rian phaa-sǎa',
      paragraphs: [
        'Mii-naa rian phaa-sǎa thai dtɔɔn yen maa sǎam dʉan lɛ́ɛo. Thəə chɔ̂ɔp khruu lɛ́ phʉ̂an rûam chán, phrɔ́ thúk khon chûai gan fʉ̀k phûut. Mɛ́ɛ baang khráng jà phûut phìt, dtɛ̀ɛ chûang níi bɔɔ-rí-sàt khɔ̌ɔng thəə bplìan wee-laa bprà-chum, tham hâi thəə bpai thʉ̌ng hɔ̂ng-rian cháa thúk wan ang-khaan.',
        'Sàp-daa thîi lɛ́ɛo Mii-naa phlâat gìt-jà-gam glùm thîi sǎm-khan. Thəə jʉng khǐan ii-meel thʉ̌ng khruu, à-thí-baai wâa thəə yang yàak rian dtɔ̀ɔ, lɛ́ thǎam wâa jà yáai bpai rian glùm wan sǎo dâai mái. Thâa mâi mii thîi wâang, thəə yàak dâai ngaan thîi rian nai wan ang-khaan bpai tham thîi bâan.',
        'Khruu dtɔ̀ɔp wâa glùm wan sǎo yang mii thîi wâang nʉ̀ng thîi, dtɛ̀ɛ rə̂əm rian reo gwàa glùm dəəm nʉ̀ng chûa-moong. Mii-naa dtɔ̂ng dtàt-sǐn-jai gɔ̀ɔn wan sùk. Thəə khít wâa gaan dtʉ̀ʉn cháo khong mâi ngâai, dtɛ̀ɛ dii gwàa gaan phlâat bòt-rian thúk sàp-daa.',
      ],
      writingPrompt: 'khǐan ii-meel thʉ̌ng khruu: à-thí-baai bpan-hǎa, sà-nə̌ə thaang-lʉ̂ak nʉ̀ng yàang, lɛ́ bɔ̀ɔk wâa tham-mai thaang-lʉ̂ak nán jʉng mɔ̌ɔ gàp khun',
      speakingPrompt: 'lâo hâi phʉ̂an fang wâa Mii-naa mii bpan-hǎa à-rai, lɛ́ khun jà dtàt-sǐn-jai yàang-rai, phrɔ́ à-rai',
      modelAnswer: 'Rian khun khruu, chǎn yàak rian dtɔ̀ɔ, dtɛ̀ɛ mii bprà-chum thîi tham-ngaan thúk wan ang-khaan, tham hâi bpai thʉ̌ng hɔ̂ng-rian sǎai. Chǎn khɔ̌ɔ yáai bpai glùm wan sǎo dâai mái khá? Phrɔ́ jà dâai khâo rûam gìt-jà-gam dtâng-dtɛ̀ɛ dtôn. Khɔ̀ɔp-khun khâ.',
    },
  },
  en: {
    id: 'course-time-en-001', language: 'en', title: 'Changing the time of a language course',
    paragraphs: [
      'Mina has attended an evening language course for three months. She enjoys working with the teacher and the other students because everyone helps one another practise. Recently, however, her company changed the time of its weekly meeting. As a result, she arrives late every Tuesday.',
      'Last week she missed an important group activity. Mina wrote to the teacher to explain that she still wanted to continue the course. She asked whether she could move to the Saturday group. If there was no place, she hoped the teacher could send her the Tuesday exercises to complete at home.',
      'The teacher replied that one place was available on Saturday, but that class started an hour earlier than the Tuesday class. Mina has to decide before Friday. Getting up early will be difficult, yet she thinks it is better than missing part of the lesson every week.',
    ],
    questions: [
      { prompt: 'Why does Mina arrive late on Tuesdays?', options: ['The trains have stopped.', 'Her company changed its meeting time.', 'The teacher moved the class.'], correctIndex: 1, explanation: 'Her company changed the time of its weekly meeting.' },
      { prompt: 'What does Mina ask for if she cannot change groups?', options: ['A refund', 'A different teacher', 'Exercises to do at home'], correctIndex: 2, explanation: 'She hopes to receive the Tuesday exercises to complete at home.' },
      { prompt: 'Why is Mina considering the Saturday class?', options: ['She would stop missing part of each lesson.', 'She enjoys getting up early.', 'All her friends have moved there.'], correctIndex: 0, explanation: 'She thinks an early start is better than missing part of the lesson each week.' },
    ],
    writingPrompt: 'Write an email to the teacher. Explain your problem, suggest one solution and give a reason why it would work for you.',
    speakingPrompt: 'Explain Mina’s problem to a friend. What would you decide, and why?',
    modelAnswer: 'Dear teacher, I would like to continue the course, but a meeting at work makes me late on Tuesdays. Could I join the Saturday group instead? I could then take part in the whole lesson. Thank you for considering my request.',
  },
  es: {
    id: 'course-time-es-001', language: 'es', title: 'Cambiar el horario de un curso de idiomas',
    paragraphs: [
      'Mina lleva tres meses asistiendo a un curso de idiomas por la tarde. Le gusta trabajar con la profesora y con sus compañeros porque todos se ayudan a practicar. Sin embargo, su empresa ha cambiado la hora de una reunión semanal. Por eso, llega tarde a clase todos los martes.',
      'La semana pasada se perdió una actividad importante en grupo. Mina escribió a la profesora para explicar que todavía quería continuar el curso. Le preguntó si podía cambiarse al grupo del sábado. Si no hubiera plazas, le gustaría recibir los ejercicios del martes para hacerlos en casa.',
      'La profesora respondió que quedaba una plaza los sábados, pero que esa clase empezaba una hora antes que la del martes. Mina tiene que decidirlo antes del viernes. Sabe que madrugar no será fácil, aunque le parece mejor que perderse una parte de la clase cada semana.',
    ],
    questions: [
      { prompt: '¿Por qué llega tarde Mina los martes?', options: ['Los trenes no funcionan.', 'Su empresa cambió la hora de una reunión.', 'La profesora cambió el aula.'], correctIndex: 1, explanation: 'Su empresa cambió la hora de una reunión semanal.' },
      { prompt: '¿Qué pide Mina si no puede cambiar de grupo?', options: ['La devolución del dinero', 'Otra profesora', 'Ejercicios para hacer en casa'], correctIndex: 2, explanation: 'Quiere recibir los ejercicios del martes para hacerlos en casa.' },
      { prompt: '¿Por qué considera Mina la clase del sábado?', options: ['No se perdería parte de la clase cada semana.', 'Le encanta madrugar.', 'Todos sus amigos ya se cambiaron.'], correctIndex: 0, explanation: 'Prefiere madrugar a perderse una parte de la clase cada semana.' },
    ],
    writingPrompt: 'Escribe un correo a la profesora. Explica tu problema, propone una solución y di por qué te conviene.',
    speakingPrompt: 'Explícale a un amigo el problema de Mina. ¿Qué decidirías tú y por qué?',
    modelAnswer: 'Estimada profesora: Me gustaría continuar el curso, pero una reunión de trabajo hace que llegue tarde los martes. ¿Podría pasar al grupo del sábado? Así podría participar en toda la clase. Muchas gracias por su ayuda.',
  },
  de: {
    id: 'course-time-de-001', language: 'de', title: 'Einen Sprachkurs anders organisieren',
    paragraphs: [
      'Mina besucht seit drei Monaten einen Sprachkurs am Abend. Sie arbeitet gern mit der Lehrerin und den anderen Teilnehmenden zusammen, weil sie sich gegenseitig beim Sprechen helfen. Seit Kurzem hat ihre Firma jedoch den Termin einer wöchentlichen Besprechung geändert. Deshalb kommt Mina dienstags regelmäßig zu spät.',
      'Letzte Woche hat sie eine wichtige Gruppenaufgabe verpasst. Mina schreibt der Lehrerin, dass sie den Kurs unbedingt fortsetzen möchte. Sie fragt, ob sie in die Samstagsgruppe wechseln kann. Falls dort kein Platz frei ist, würde sie die Aufgaben vom Dienstag gern zu Hause bearbeiten.',
      'Die Lehrerin antwortet, dass samstags noch ein Platz frei ist. Der Kurs beginnt allerdings eine Stunde früher als der Kurs am Dienstag. Mina muss sich bis Freitag entscheiden. Frühes Aufstehen fällt ihr schwer, aber es erscheint ihr besser, als jede Woche einen Teil des Unterrichts zu verpassen.',
    ],
    questions: [
      { prompt: 'Warum kommt Mina dienstags zu spät?', options: ['Die Züge fahren nicht.', 'Ihre Firma hat eine Besprechung verschoben.', 'Die Lehrerin hat den Raum gewechselt.'], correctIndex: 1, explanation: 'Ihre Firma hat den Termin einer wöchentlichen Besprechung geändert.' },
      { prompt: 'Was möchte Mina, falls sie die Gruppe nicht wechseln kann?', options: ['Ihr Geld zurück', 'Eine andere Lehrerin', 'Die Aufgaben zu Hause bearbeiten'], correctIndex: 2, explanation: 'Sie würde die Aufgaben vom Dienstag gern zu Hause bearbeiten.' },
      { prompt: 'Warum überlegt Mina, samstags zu lernen?', options: ['Dann verpasst sie nicht jede Woche einen Teil des Unterrichts.', 'Sie steht gern früh auf.', 'Alle ihre Freunde sind dort.'], correctIndex: 0, explanation: 'Frühes Aufstehen ist für sie besser, als wöchentlich Unterricht zu verpassen.' },
    ],
    writingPrompt: 'Schreibe der Lehrerin eine E-Mail. Erkläre dein Problem, schlage eine Lösung vor und begründe, warum sie für dich passt.',
    speakingPrompt: 'Erkläre einer anderen Person Minas Problem. Wie würdest du dich entscheiden und warum?',
    modelAnswer: 'Liebe Frau Berger, ich möchte den Kurs gern fortsetzen. Wegen einer Besprechung bei der Arbeit komme ich dienstags jedoch zu spät. Könnte ich in die Samstagsgruppe wechseln? Dann könnte ich wieder am ganzen Unterricht teilnehmen. Vielen Dank für Ihre Hilfe.',
  },
};
