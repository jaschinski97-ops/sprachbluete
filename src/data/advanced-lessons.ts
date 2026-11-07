import type { LanguageCode } from '@/lib/languages/types';

/** Eine Verständnisfrage mit genau drei Antworten; `correctIndex` zeigt auf die richtige in `options`. */
export type AdvancedQuestion = {
  prompt: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
  explanation: string;
  // Umschrift (Thai, Chinesisch) mit denselben Positionen wie `prompt`/`options`/`explanation`.
  roman?: { prompt: string; options: [string, string, string]; explanation: string };
};

/** Eine Einheit: drei Absätze zum Hören/Lesen, drei Fragen, Schreib- und Sprechauftrag samt Musterantwort. */
export type AdvancedLesson = {
  id: string;
  language: LanguageCode;
  title: string;
  paragraphs: [string, string, string];
  questions: [AdvancedQuestion, AdvancedQuestion, AdvancedQuestion];
  writingPrompt: string;
  speakingPrompt: string;
  modelAnswer: string;
  // Umschrift zu allen Texten (Thai, Chinesisch); Absätze stehen an denselben Indizes wie `paragraphs`.
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
  fr: {
    id: 'course-time-fr-001', language: 'fr', title: 'Changer l’horaire d’un cours de langue',
    paragraphs: [
      'Depuis trois mois, Mina suit un cours de langue le soir. Elle aime travailler avec la professeure et avec les autres participants, parce que tout le monde s’entraide pour pratiquer. Mais son entreprise a changé l’heure d’une réunion hebdomadaire. Du coup, elle arrive en retard en cours tous les mardis.',
      'La semaine dernière, elle a manqué une activité de groupe importante. Mina a écrit à la professeure pour lui expliquer qu’elle voulait quand même continuer le cours. Elle lui a demandé si elle pouvait passer dans le groupe du samedi. S’il n’y avait plus de place, elle aimerait recevoir les exercices du mardi pour les faire à la maison.',
      'La professeure a répondu qu’il restait une place le samedi, mais que ce cours commençait une heure plus tôt que celui du mardi. Mina doit se décider avant vendredi. Elle sait que se lever tôt ne sera pas facile, mais cela lui semble mieux que de manquer une partie du cours chaque semaine.',
    ],
    questions: [
      { prompt: 'Pourquoi Mina arrive-t-elle en retard le mardi ?', options: ['Les trains ne circulent pas.', 'Son entreprise a changé l’heure d’une réunion.', 'La professeure a changé de salle.'], correctIndex: 1, explanation: 'Son entreprise a changé l’heure d’une réunion hebdomadaire.' },
      { prompt: 'Que demande Mina si elle ne peut pas changer de groupe ?', options: ['Le remboursement du cours', 'Une autre professeure', 'Des exercices à faire à la maison'], correctIndex: 2, explanation: 'Elle aimerait recevoir les exercices du mardi pour les faire à la maison.' },
      { prompt: 'Pourquoi Mina pense-t-elle au cours du samedi ?', options: ['Elle ne manquerait plus une partie du cours chaque semaine.', 'Elle adore se lever tôt.', 'Tous ses amis ont déjà changé de groupe.'], correctIndex: 0, explanation: 'Elle préfère se lever tôt plutôt que de manquer une partie du cours chaque semaine.' },
    ],
    writingPrompt: 'Écris un e-mail à la professeure. Explique ton problème, propose une solution et dis pourquoi elle te convient.',
    speakingPrompt: 'Explique à quelqu’un le problème de Mina. Que déciderais-tu, et pourquoi ?',
    modelAnswer: 'Bonjour Madame Berger, je voudrais continuer le cours, mais à cause d’une réunion de travail, j’arrive en retard le mardi. Est-ce que je pourrais passer dans le groupe du samedi ? Comme ça, je pourrais suivre tout le cours. Merci beaucoup pour votre aide.',
  },
  pt: {
    id: 'course-time-pt-001', language: 'pt', title: 'Mudar o horário de um curso de idiomas',
    paragraphs: [
      'Há três meses, Mina faz um curso de idiomas à noite. Ela gosta de trabalhar com a professora e com os outros alunos, porque todos se ajudam a praticar a conversação. Mas a empresa dela mudou o horário de uma reunião semanal. Por isso, toda terça-feira ela chega atrasada à aula.',
      'Na semana passada, ela perdeu uma atividade em grupo importante. Mina escreveu para a professora dizendo que queria muito continuar o curso. Ela perguntou se podia mudar para a turma de sábado. Se não houvesse vaga, gostaria de receber os exercícios de terça para fazer em casa.',
      'A professora respondeu que ainda havia uma vaga no sábado, mas que essa aula começava uma hora mais cedo do que a de terça. Mina precisa decidir até sexta-feira. Ela sabe que acordar cedo não vai ser fácil, mas acha isso melhor do que perder parte da aula toda semana.',
    ],
    questions: [
      { prompt: 'Por que Mina chega atrasada às terças-feiras?', options: ['Os trens não estão funcionando.', 'A empresa dela mudou o horário de uma reunião.', 'A professora mudou de sala.'], correctIndex: 1, explanation: 'A empresa dela mudou o horário de uma reunião semanal.' },
      { prompt: 'O que Mina pede se não puder mudar de turma?', options: ['O dinheiro de volta', 'Outra professora', 'Exercícios para fazer em casa'], correctIndex: 2, explanation: 'Ela gostaria de receber os exercícios de terça para fazer em casa.' },
      { prompt: 'Por que Mina pensa na aula de sábado?', options: ['Assim ela não perderia parte da aula toda semana.', 'Ela adora acordar cedo.', 'Todos os amigos dela já mudaram de turma.'], correctIndex: 0, explanation: 'Ela prefere acordar cedo a perder parte da aula toda semana.' },
    ],
    writingPrompt: 'Escreva um e-mail para a professora. Explique o seu problema, proponha uma solução e diga por que ela é boa para você.',
    speakingPrompt: 'Explique para outra pessoa o problema da Mina. O que você decidiria, e por quê?',
    modelAnswer: 'Olá, professora Berger, eu gostaria de continuar o curso, mas por causa de uma reunião no trabalho chego atrasada às terças. Eu poderia mudar para a turma de sábado? Assim eu conseguiria acompanhar a aula inteira. Muito obrigada pela ajuda.',
  },
  it: {
    id: 'course-time-it-001', language: 'it', title: 'Cambiare l’orario di un corso di lingua',
    paragraphs: [
      'Da tre mesi Mina frequenta un corso di lingua la sera. Le piace lavorare con l’insegnante e con gli altri partecipanti, perché tutti si aiutano a vicenda a parlare. Però la sua azienda ha spostato l’orario di una riunione settimanale. Per questo il martedì arriva sempre in ritardo a lezione.',
      'La settimana scorsa ha perso un’attività di gruppo importante. Mina ha scritto all’insegnante che vuole assolutamente continuare il corso. Le ha chiesto se può passare al gruppo del sabato. Se non ci fosse posto, vorrebbe ricevere gli esercizi del martedì per farli a casa.',
      'L’insegnante ha risposto che il sabato c’è ancora un posto libero, ma che quel corso comincia un’ora prima di quello del martedì. Mina deve decidere entro venerdì. Sa che alzarsi presto non sarà facile, ma le sembra meglio che perdere una parte della lezione ogni settimana.',
    ],
    questions: [
      { prompt: 'Perché Mina arriva in ritardo il martedì?', options: ['I treni non funzionano.', 'La sua azienda ha spostato una riunione.', 'L’insegnante ha cambiato aula.'], correctIndex: 1, explanation: 'La sua azienda ha spostato l’orario di una riunione settimanale.' },
      { prompt: 'Che cosa chiede Mina se non può cambiare gruppo?', options: ['I soldi indietro', 'Un’altra insegnante', 'Gli esercizi da fare a casa'], correctIndex: 2, explanation: 'Vorrebbe ricevere gli esercizi del martedì per farli a casa.' },
      { prompt: 'Perché Mina pensa al corso del sabato?', options: ['Così non perderebbe una parte della lezione ogni settimana.', 'Le piace molto alzarsi presto.', 'Tutti i suoi amici hanno già cambiato gruppo.'], correctIndex: 0, explanation: 'Preferisce alzarsi presto piuttosto che perdere una parte della lezione ogni settimana.' },
    ],
    writingPrompt: 'Scrivi un’e-mail all’insegnante. Spiega il tuo problema, proponi una soluzione e di’ perché fa al caso tuo.',
    speakingPrompt: 'Spiega a un’altra persona il problema di Mina. Tu che cosa decideresti, e perché?',
    modelAnswer: 'Gentile professoressa Berger, vorrei continuare il corso, ma a causa di una riunione di lavoro il martedì arrivo in ritardo. Potrei passare al gruppo del sabato? Così potrei seguire tutta la lezione. Grazie mille per l’aiuto.',
  },
  zh: {
    id: 'course-time-zh-001', language: 'zh', title: '更改语言课的时间',
    paragraphs: [
      '米娜晚上上语言课已经三个月了。她喜欢老师和同学，因为大家互相帮助练习说话。可是最近她的公司改了每周开会的时间，所以她每个星期二都迟到。',
      '上个星期，米娜错过了一个重要的小组活动。她给老师写了一封电子邮件，说她还想继续上课，并问能不能换到星期六的班。如果没有位子，她希望老师把星期二的练习发给她，让她在家做。',
      '老师回信说，星期六的班还有一个空位，可是比星期二的班早一个小时开始。米娜得在星期五以前做决定。她觉得早起不容易，但是比每个星期都错过一部分课好。',
    ],
    questions: [
      { prompt: '米娜为什么星期二迟到？', options: ['火车停运了。', '她的公司改了开会的时间。', '老师换了教室。'], correctIndex: 1, explanation: '她的公司改了每周开会的时间。', roman: { prompt: "Mǐnà wèishénme xīngqī'èr chídào?", options: ['Huǒchē tíngyùn le.', 'Tā de gōngsī gǎile kāihuì de shíjiān.', 'Lǎoshī huànle jiàoshì.'], explanation: 'Tā de gōngsī gǎile měi zhōu kāihuì de shíjiān.' } },
      { prompt: '如果不能换班，米娜想要什么？', options: ['退钱', '换一个老师', '在家做的练习'], correctIndex: 2, explanation: '她希望老师把星期二的练习发给她，让她在家做。', roman: { prompt: 'Rúguǒ bù néng huàn bān, Mǐnà xiǎng yào shénme?', options: ['Tuì qián', 'Huàn yí gè lǎoshī', 'Zài jiā zuò de liànxí'], explanation: "Tā xīwàng lǎoshī bǎ xīngqī'èr de liànxí fā gěi tā, ràng tā zài jiā zuò." } },
      { prompt: '米娜为什么考虑星期六的班？', options: ['这样她就不会每个星期都错过一部分课。', '她很喜欢早起。', '她的朋友都已经换班了。'], correctIndex: 0, explanation: '她觉得早起比每个星期都错过一部分课好。', roman: { prompt: 'Mǐnà wèishénme kǎolǜ xīngqīliù de bān?', options: ['Zhèyàng tā jiù bú huì měi gè xīngqī dōu cuòguò yí bùfen kè.', 'Tā hěn xǐhuan zǎoqǐ.', 'Tā de péngyou dōu yǐjīng huàn bān le.'], explanation: 'Tā juéde zǎoqǐ bǐ měi gè xīngqī dōu cuòguò yí bùfen kè hǎo.' } },
    ],
    writingPrompt: '给老师写一封电子邮件：说明你的问题，提出一个办法，并说明为什么这个办法适合你。',
    speakingPrompt: '跟朋友说说米娜有什么问题。你会怎么决定？为什么？',
    modelAnswer: '王老师您好！我想继续上课，可是每个星期二公司都开会，所以我总是迟到。我可以换到星期六的班吗？这样我就能上完整的课。谢谢您的帮助！',
    roman: {
      title: 'Gēnggǎi yǔyánkè de shíjiān',
      paragraphs: [
        "Mǐnà wǎnshang shàng yǔyánkè yǐjīng sān gè yuè le. Tā xǐhuan lǎoshī hé tóngxué, yīnwèi dàjiā hùxiāng bāngzhù liànxí shuōhuà. Kěshì zuìjìn tā de gōngsī gǎile měi zhōu kāihuì de shíjiān, suǒyǐ tā měi gè xīngqī'èr dōu chídào.",
        "Shàng gè xīngqī, Mǐnà cuòguòle yí gè zhòngyào de xiǎozǔ huódòng. Tā gěi lǎoshī xiěle yì fēng diànzǐ yóujiàn, shuō tā hái xiǎng jìxù shàngkè, bìng wèn néng bu néng huàn dào xīngqīliù de bān. Rúguǒ méiyǒu wèizi, tā xīwàng lǎoshī bǎ xīngqī'èr de liànxí fā gěi tā, ràng tā zài jiā zuò.",
        "Lǎoshī huíxìn shuō, xīngqīliù de bān hái yǒu yí gè kòngwèi, kěshì bǐ xīngqī'èr de bān zǎo yí gè xiǎoshí kāishǐ. Mǐnà děi zài xīngqīwǔ yǐqián zuò juédìng. Tā juéde zǎoqǐ bù róngyì, dànshì bǐ měi gè xīngqī dōu cuòguò yí bùfen kè hǎo.",
      ],
      writingPrompt: 'Gěi lǎoshī xiě yì fēng diànzǐ yóujiàn: shuōmíng nǐ de wèntí, tíchū yí gè bànfǎ, bìng shuōmíng wèishénme zhège bànfǎ shìhé nǐ.',
      speakingPrompt: 'Gēn péngyou shuōshuo Mǐnà yǒu shénme wèntí. Nǐ huì zěnme juédìng? Wèishénme?',
      modelAnswer: "Wáng lǎoshī nín hǎo! Wǒ xiǎng jìxù shàngkè, kěshì měi gè xīngqī'èr gōngsī dōu kāihuì, suǒyǐ wǒ zǒngshì chídào. Wǒ kěyǐ huàn dào xīngqīliù de bān ma? Zhèyàng wǒ jiù néng shàng wánzhěng de kè. Xièxie nín de bāngzhù!",
    },
  },
};
