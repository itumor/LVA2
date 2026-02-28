import {
  AD_TARGETS,
  buildRubric,
  BUS_NUMBERS,
  CITIES_LV,
  CITY_PLACES_LV,
  EVENT_PLACES_LV,
  GAP_DISTRACTOR_WORDS,
  GAP_TARGET_WORDS,
  PERSON_NAMES_LV,
  PRICE_OPTIONS_EUR,
  READING_AD_POOL,
  rotateTopic,
  SERVICES_LV,
  SPEAKING_AD_POOL,
  SPEAKING_IMAGE_SCENES,
  SPEAKING_INTERVIEW_QUESTION_POOL,
  TASK_UI_LABELS_EN,
  TIME_OPTIONS_LV,
  TOPICS,
  WEEKDAYS_LV,
  WRITING_PICTURE_PROMPTS,
} from "@/lib/vvpp-a2-template-bank";
import { deriveTaskSeed, DeterministicRng } from "@/lib/vvpp-a2-rng";

export type ExamSkill = "LISTENING" | "READING" | "WRITING" | "SPEAKING";

type SectionDurationsMin = {
  LISTENING: 25;
  READING: 30;
  WRITING: 35;
  SPEAKING: 15;
};

type PassRule = {
  perSkillMin: 9;
  perSkillMax: 15;
};

export type ExamTask = {
  id: string;
  officialOrder: number;
  taskType: string;
  topic: string;
  points: number;
  uiLabelEn: string;
  instructionLv: string;
  stimuli: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
  answerKey?: {
    items: Array<Record<string, unknown>>;
  };
  rubric?: {
    dimensions: Array<{ nameLv: string; nameEn: string; maxPoints: number }>;
    scoringNotesLv: string;
  };
  sampleResponseLv?: string | string[];
  commonErrorsLv?: string[];
};

export type ExamSection = {
  skill: ExamSkill;
  tasks: ExamTask[];
};

export type ExamVersion = {
  examId: string;
  versionLabel: string;
  sectionDurationsMin: SectionDurationsMin;
  passRule: PassRule;
  sections: ExamSection[];
  validation: {
    listeningPoints: 15;
    readingPoints: 15;
    writingPoints: 15;
    speakingPoints: 15;
    totalPoints: 60;
  };
};

export type VvppA2GeneratorInput = {
  n?: number;
  seed?: number;
  extraPracticeVariants?: number;
};

export type VvppA2GeneratorOutput = {
  generator: {
    name: "VVPP_A2_Generator";
    seed: number;
    n: number;
  };
  exams: ExamVersion[];
};

type GeneratedTask = {
  task: ExamTask;
  coreTexts: string[];
};

const SECTION_ORDER: readonly ExamSkill[] = ["LISTENING", "READING", "WRITING", "SPEAKING"];

const SECTION_DURATIONS_MIN: SectionDurationsMin = {
  LISTENING: 25,
  READING: 30,
  WRITING: 35,
  SPEAKING: 15,
};

const PASS_RULE: PassRule = {
  perSkillMin: 9,
  perSkillMax: 15,
};

const AUTO_GRADED_TASK_ORDERS = new Set([1, 2, 3, 4, 5, 6, 8]);
const PRODUCTION_TASK_ORDERS = new Set([7, 8, 9, 10, 11, 12]);

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}'-]+/gu) ?? [];
}

function normalizeUniqueText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureUniqueCoreTexts(coreTexts: string[], registry: Set<string>): boolean {
  const normalized = coreTexts
    .map((entry) => normalizeUniqueText(entry))
    .filter((entry) => entry.length >= 16);

  for (const entry of normalized) {
    if (registry.has(entry)) {
      return false;
    }
  }

  for (const entry of normalized) {
    registry.add(entry);
  }

  return true;
}

function extractA2TargetStrings(task: ExamTask): string[] {
  const values: string[] = [task.instructionLv, task.topic];

  if (Array.isArray(task.stimuli.audioScriptLv)) {
    values.push(...(task.stimuli.audioScriptLv as string[]));
  }

  if (typeof task.stimuli.transcriptLv === "string") {
    values.push(task.stimuli.transcriptLv);
  }

  for (const question of task.questions) {
    for (const value of Object.values(question)) {
      if (typeof value === "string") {
        values.push(value);
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            values.push(item);
          }
        }
      }
    }
  }

  return values;
}

function splitForA2Check(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tokenCount = words(trimmed).length;
  if (tokenCount <= 18) return [trimmed];

  const fragments = trimmed
    .split(/[.!?]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  return fragments.length > 1 ? fragments : [trimmed];
}

function isA2Friendly(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned) return true;

  const tokenCount = words(cleaned).length;
  if (tokenCount > 18) return false;

  return true;
}

function assertTaskA2Friendly(task: ExamTask) {
  const targets = extractA2TargetStrings(task);
  for (const target of targets) {
    for (const fragment of splitForA2Check(target)) {
      if (!isA2Friendly(fragment)) {
        throw new Error(`A2 lexical gate failed for task ${task.id}: "${fragment}"`);
      }
    }
  }
}

function pickThreeOptions(rng: DeterministicRng, correct: string, candidates: readonly string[]): {
  options: string[];
  correctOptionIndex: number;
} {
  const filtered = [...new Set(candidates.filter((entry) => entry !== correct))];
  const distractors = rng.shuffle(filtered).slice(0, 2);
  const options = rng.shuffle([correct, ...distractors]);
  return {
    options,
    correctOptionIndex: options.findIndex((entry) => entry === correct),
  };
}

function pickDistinct<T>(rng: DeterministicRng, values: readonly T[], count: number): T[] {
  if (count > values.length) {
    throw new Error(`Cannot pick ${count} distinct items from ${values.length} values.`);
  }

  return rng.shuffle(values).slice(0, count);
}

function skillFromOrder(officialOrder: number): ExamSkill {
  if (officialOrder <= 3) return "LISTENING";
  if (officialOrder <= 6) return "READING";
  if (officialOrder <= 9) return "WRITING";
  return "SPEAKING";
}

function buildTaskId(examId: string, officialOrder: number): string {
  return `${examId}_t${String(officialOrder).padStart(2, "0")}`;
}

function buildListeningAnnouncementsTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const destination = rng.pick(CITIES_LV);
  const platform = String(rng.int(2, 8));
  const platformOptions = pickThreeOptions(
    rng,
    `No ${platform}. platformas`,
    ["No 1. platformas", "No 2. platformas", "No 3. platformas", "No 4. platformas", "No 5. platformas", "No 6. platformas", "No 7. platformas", "No 8. platformas"],
  );

  const service = rng.pick(SERVICES_LV);
  const closingTime = rng.pick(TIME_OPTIONS_LV.slice(7));
  const closingOptions = pickThreeOptions(rng, closingTime, TIME_OPTIONS_LV);

  const price = rng.pick(PRICE_OPTIONS_EUR);
  const priceOptions = pickThreeOptions(rng, price, PRICE_OPTIONS_EUR);

  const eventPlace = rng.pick(EVENT_PLACES_LV);
  const eventPlaceOptions = pickThreeOptions(rng, eventPlace, EVENT_PLACES_LV);

  const busNumber = rng.pick(BUS_NUMBERS);
  const busOptions = pickThreeOptions(rng, busNumber, BUS_NUMBERS);

  const service2 = rng.pick(SERVICES_LV.filter((entry) => entry !== service));
  const openTime = rng.pick(TIME_OPTIONS_LV.slice(0, 7));
  const openOptions = pickThreeOptions(rng, openTime, TIME_OPTIONS_LV.slice(0, 9));

  const announcements = [
    `Stacijas paziņojums. Vilciens uz ${destination} iziet no ${platform}. platformas.`,
    `${service} šodien strādā līdz pulksten ${closingTime}.`,
    `Dienas biļete pilsētas transportam maksā ${price} eiro.`,
    `Vakara koncerts šodien notiek ${eventPlace}.`,
    `Uz poliklīniku no centra brauc ${busNumber}. autobuss.`,
    `No nākamās nedēļas ${service2} tiek atvērta pulksten ${openTime}.`,
  ];

  const questions = [
    {
      id: "q1",
      stemLv: `No kuras platformas iziet vilciens uz ${destination}?`,
      optionsLv: platformOptions.options,
    },
    {
      id: "q2",
      stemLv: `Līdz cikiem strādā ${service}?`,
      optionsLv: closingOptions.options,
    },
    {
      id: "q3",
      stemLv: "Cik maksā dienas biļete pilsētas transportam?",
      optionsLv: priceOptions.options,
    },
    {
      id: "q4",
      stemLv: "Kur notiek vakara koncerts?",
      optionsLv: eventPlaceOptions.options,
    },
    {
      id: "q5",
      stemLv: "Kurš autobuss brauc uz poliklīniku?",
      optionsLv: busOptions.options,
    },
    {
      id: "q6",
      stemLv: `Cikos no nākamās nedēļas atver ${service2}?`,
      optionsLv: openOptions.options,
    },
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "MCQ_ANNOUNCEMENTS",
      topic,
      points: 6,
      uiLabelEn: TASK_UI_LABELS_EN.LISTENING_ANNOUNCEMENTS,
      instructionLv: "Noklausies sešus paziņojumus un izvēlies pareizo atbildi.",
      stimuli: {
        audioScriptLv: announcements,
        transcriptLv: announcements.join(" "),
      },
      questions,
      answerKey: {
        items: [
          { questionId: "q1", correctOptionIndex: platformOptions.correctOptionIndex },
          { questionId: "q2", correctOptionIndex: closingOptions.correctOptionIndex },
          { questionId: "q3", correctOptionIndex: priceOptions.correctOptionIndex },
          { questionId: "q4", correctOptionIndex: eventPlaceOptions.correctOptionIndex },
          { questionId: "q5", correctOptionIndex: busOptions.correctOptionIndex },
          { questionId: "q6", correctOptionIndex: openOptions.correctOptionIndex },
        ],
      },
    },
    coreTexts: announcements,
  };
}

function buildListeningTrueFalseTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const personA = rng.pick(PERSON_NAMES_LV);
  const personB = rng.pick(PERSON_NAMES_LV.filter((name) => name !== personA));
  const travelDay = rng.pick(WEEKDAYS_LV);
  const city = rng.pick(CITIES_LV);
  const hours = rng.int(1, 2);
  const minutes = rng.pick(["10", "20", "30", "40"] as const);
  const duration = `${hours} stunda un ${minutes} minūtes`;
  const bagType = rng.pick(["mazā mugursoma", "neliela sporta soma", "mazā pleca soma"] as const);

  const lines = [
    `${personA}. Vai tu brauksi uz ${city} ${travelDay}?`,
    `${personB}. Jā, es braukšu ${travelDay} no rīta ar autobusu.`,
    `${personA}. Kur pirksi biļeti?`,
    `${personB}. Biļeti var nopirkt internetā vai autoostā.`,
    `${personA}. Cik ilgs būs ceļš?`,
    `${personB}. Ceļš ilgst apmēram ${duration}.`,
    `${personA}. Vai tu ņemsi lielo čemodānu?`,
    `${personB}. Nē, man būs tikai ${bagType}.`,
  ];

  const statements = [
    { id: "q1", statementLv: `${personB} brauks ${travelDay}.`, correct: true },
    { id: "q2", statementLv: "Biļeti var nopirkt tikai internetā.", correct: false },
    { id: "q3", statementLv: "Ceļš ir īsāks par divām stundām.", correct: hours === 1 },
    { id: "q4", statementLv: `${personB} ņems lielo čemodānu.`, correct: false },
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "TRUE_FALSE_DIALOGUE",
      topic,
      points: 4,
      uiLabelEn: TASK_UI_LABELS_EN.LISTENING_TRUE_FALSE,
      instructionLv: "Noklausies dialogu un atzīmē apgalvojumus kā Patiesi vai Nepatiesi.",
      stimuli: {
        audioScriptLv: lines,
        transcriptLv: lines.join(" "),
      },
      questions: statements.map((row) => ({
        id: row.id,
        statementLv: row.statementLv,
      })),
      answerKey: {
        items: statements.map((row) => ({
          questionId: row.id,
          correct: row.correct,
        })),
      },
    },
    coreTexts: [...lines],
  };
}

function buildListeningGapFillTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const dayWord = rng.pick(["rīt", "piektdien", "svētdien", "vakar", "otrdien", "ceturtdien", "sestdien"] as const);
  const timeWord = rng.pick(["septiņos", "astoņos", "deviņos", "desmitos", "vienpadsmitos", "divpadsmitos"] as const);
  const placeWord = rng.pick(["aptiekā", "stacijā", "mājās", "tirgū", "bibliotēkā", "parkā"] as const);
  const sizeWord = rng.pick(["lielo", "zilo", "mazo", "sarkano", "melno", "jauno"] as const);
  const numberWord = rng.pick(["vienu", "divas", "trīs", "četras", "piecas", "sešas"] as const);

  const answers = [dayWord, timeWord, placeWord, sizeWord, numberWord];

  const distractorPool = [...GAP_DISTRACTOR_WORDS, ...GAP_TARGET_WORDS].filter(
    (entry) => !answers.includes(entry as (typeof answers)[number]),
  );
  const distractors = pickDistinct(rng, distractorPool, 4);
  const wordBank = rng.shuffle([...answers, ...distractors]);

  const dialogues = [
    `A. Kad mēs tiekamies pie veikala? B. Mēs tiekamies ${dayWord}.`,
    `A. Cikos sākas nodarbība? B. Nodarbība sākas pulksten ${timeWord}.`,
    `A. Kur tu nopirksi zāles? B. Es ieiešu ${placeWord} pēc darba.`,
    `A. Kuru somu tu ņemsi ceļojumam? B. Es ņemšu ${sizeWord} somu.`,
    `A. Cik biļetes jums vajag? B. Mums vajag ${numberWord} biļetes.`,
  ];

  const questions = [
    { id: "q1", stemLv: "Mēs tiekamies ____ pie veikala." },
    { id: "q2", stemLv: "Nodarbība sākas pulksten ____." },
    { id: "q3", stemLv: "Es ieiešu ____ pēc darba." },
    { id: "q4", stemLv: "Es ņemšu ____ somu." },
    { id: "q5", stemLv: "Mums vajag ____ biļetes." },
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "GAP_FILL_DIALOGUES",
      topic,
      points: 5,
      uiLabelEn: TASK_UI_LABELS_EN.LISTENING_GAP_FILL,
      instructionLv:
        "Noklausies piecus īsus dialogus. Ieraksti trūkstošo vārdu, izmantojot vārdu banku.",
      stimuli: {
        audioScriptLv: dialogues,
        transcriptLv: dialogues.join(" "),
        wordBankLv: wordBank,
      },
      questions,
      answerKey: {
        items: [
          { questionId: "q1", correctWord: dayWord },
          { questionId: "q2", correctWord: timeWord },
          { questionId: "q3", correctWord: placeWord },
          { questionId: "q4", correctWord: sizeWord },
          { questionId: "q5", correctWord: numberWord },
        ],
      },
    },
    coreTexts: [...dialogues, wordBank.join(" ")],
  };
}

function buildReadingShortTextsTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const closedDay = rng.pick(WEEKDAYS_LV);
  const libraryOpen = rng.pick(TIME_OPTIONS_LV.slice(0, 7));
  const libraryClose = rng.pick(TIME_OPTIONS_LV.slice(7));

  const marketDay = rng.pick(["sestdien", "svētdien"] as const);
  const marketOpen = rng.pick(TIME_OPTIONS_LV.slice(0, 5));
  const marketClose = rng.pick(TIME_OPTIONS_LV.slice(8));

  const clinicDay = rng.pick(WEEKDAYS_LV.filter((day) => day !== closedDay));
  const clinicStart = rng.pick(TIME_OPTIONS_LV.slice(0, 6));

  const busLine = rng.pick(BUS_NUMBERS);
  const busPlace = rng.pick(CITY_PLACES_LV);

  const questions = [
    {
      id: "q1",
      textLv: `Bibliotēka ${closedDay} ir slēgta. Citās dienās tā strādā no ${libraryOpen} līdz ${libraryClose}.`,
      optionsLv: [
        `Bibliotēka ${closedDay} nestrādā.`,
        "Bibliotēka strādā tikai no rīta.",
        "Bibliotēka katru dienu ir slēgta.",
      ],
      correctOptionIndex: 0,
    },
    {
      id: "q2",
      textLv: `Tirgus ${marketDay} ir atvērts no ${marketOpen} līdz ${marketClose}. Darba dienās tas ir slēgts.`,
      optionsLv: [
        "Tirgus ir atvērts katru darba dienu.",
        `Tirgus ir atvērts ${marketDay}.`,
        "Tirgus ir atvērts tikai vakarā.",
      ],
      correctOptionIndex: 1,
    },
    {
      id: "q3",
      textLv: `Poliklīnikā pie ārsta var pierakstīties ${clinicDay} no pulksten ${clinicStart}. Vajag personu apliecinošu dokumentu.`,
      optionsLv: [
        "Pie ārsta nevar pierakstīties.",
        "Uz poliklīniku nav jāņem dokuments.",
        `Pie ārsta var pierakstīties ${clinicDay}.`,
      ],
      correctOptionIndex: 2,
    },
    {
      id: "q4",
      textLv: `${busLine}. autobuss brauc uz ${busPlace}. Pēdējais reiss no centra ir pulksten 21.00.`,
      optionsLv: [
        "Pēdējais autobuss ir pulksten 18.00.",
        `${busLine}. autobuss brauc uz ${busPlace}.`,
        "Šis autobuss neiet no centra.",
      ],
      correctOptionIndex: 1,
    },
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "SHORT_TEXT_STATEMENTS",
      topic,
      points: 4,
      uiLabelEn: TASK_UI_LABELS_EN.READING_SHORT_TEXTS,
      instructionLv: "Izlasi četrus īsus tekstus un izvēlies pareizo apgalvojumu pie katra teksta.",
      stimuli: {
        textCount: 4,
      },
      questions: questions.map((row) => ({
        id: row.id,
        textLv: row.textLv,
        optionsLv: row.optionsLv,
      })),
      answerKey: {
        items: questions.map((row) => ({
          questionId: row.id,
          correctOptionIndex: row.correctOptionIndex,
        })),
      },
    },
    coreTexts: questions.map((row) => row.textLv),
  };
}

function buildReadingAdMatchingTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const selectedAds = pickDistinct(rng, READING_AD_POOL, 8).map((baseText, index) => {
    const day = rng.pick(WEEKDAYS_LV);
    const time = rng.pick(TIME_OPTIONS_LV);
    return {
      id: String.fromCharCode(65 + index),
      textLv: `${baseText} Pieteikumi ${day} no ${time}.`,
    };
  });

  const selectedSituations: Array<{ id: string; textLv: string; answerAdId: string }> = selectedAds
    .slice(0, 6)
    .map((ad, index) => {
      const shortNeed = ad.textLv
        .split(" ")
        .slice(0, 4)
        .join(" ")
        .replace(/[.,]$/g, "")
        .toLowerCase();
      return {
        id: `s${index + 1}`,
        textLv: `Meklē sludinājumu par ${shortNeed}.`,
        answerAdId: ad.id,
      };
    });

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "SITUATION_AD_MATCHING",
      topic,
      points: 6,
      uiLabelEn: TASK_UI_LABELS_EN.READING_AD_MATCHING,
      instructionLv: "Izlasi situācijas un izvēlies katrai situācijai atbilstošo sludinājumu.",
      stimuli: {
        ads: selectedAds,
      },
      questions: selectedSituations.map((row) => ({
        id: row.id,
        textLv: row.textLv,
        availableAds: selectedAds.map((ad) => ad.id),
      })),
      answerKey: {
        items: selectedSituations.map((row) => ({
          situationId: row.id,
          adId: row.answerAdId,
        })),
      },
    },
    coreTexts: [...selectedAds.map((ad) => ad.textLv)],
  };
}

function buildReadingClozeTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const name = rng.pick(PERSON_NAMES_LV);
  const city = rng.pick(CITIES_LV);
  const weatherWord = rng.pick(["saulains", "silts", "vējains"] as const);

  const gap1 = pickThreeOptions(rng, "draugu", ["draugu", "mašīnu", "ātri", "telefonu"]);
  const gap2 = pickThreeOptions(rng, city, CITIES_LV);
  const gap3 = pickThreeOptions(rng, "agri", ["agri", "lēni", "klusā", "skaļi"]);
  const gap4 = pickThreeOptions(rng, weatherWord, ["saulains", "silts", "vējains", "tumšs", "ātrs"]);
  const gap5 = pickThreeOptions(rng, "zupu", ["zupu", "autobusu", "stundu", "māju"]);

  const textLv = `${name} sestdien ar [1] brauca uz [2]. Viņi [3] no rīta devās ar vilcienu. Tur laiks bija [4], tāpēc viņi ilgi staigāja parkā. Vakarā viņi kafejnīcā ēda [5].`;

  const questions = [
    { id: "g1", stemLv: "1. Izvēlies pareizo vārdu", optionsLv: gap1.options },
    { id: "g2", stemLv: "2. Izvēlies pareizo vietas nosaukumu", optionsLv: gap2.options },
    { id: "g3", stemLv: "3. Izvēlies pareizo apstākļa vārdu", optionsLv: gap3.options },
    { id: "g4", stemLv: "4. Izvēlies pareizo īpašības vārdu", optionsLv: gap4.options },
    { id: "g5", stemLv: "5. Izvēlies pareizo lietvārdu", optionsLv: gap5.options },
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "CLOZE_MCQ",
      topic,
      points: 5,
      uiLabelEn: TASK_UI_LABELS_EN.READING_CLOZE,
      instructionLv: "Izlasi tekstu un katrā tukšumā izvēlies pareizo atbildi.",
      stimuli: {
        textLv,
      },
      questions,
      answerKey: {
        items: [
          { gapId: "g1", correctOptionIndex: gap1.correctOptionIndex },
          { gapId: "g2", correctOptionIndex: gap2.correctOptionIndex },
          { gapId: "g3", correctOptionIndex: gap3.correctOptionIndex },
          { gapId: "g4", correctOptionIndex: gap4.correctOptionIndex },
          { gapId: "g5", correctOptionIndex: gap5.correctOptionIndex },
        ],
      },
    },
    coreTexts: [textLv],
  };
}

function buildWritingPictureSentenceTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const prompts = pickDistinct(rng, WRITING_PICTURE_PROMPTS, 4).map((basePrompt) => {
    const suffix = rng.pick(["No rīta.", "Vakarā.", "Brīvdienā.", "Pēc darba."] as const);
    return `${basePrompt} ${suffix}`;
  });

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "PICTURE_SENTENCE",
      topic,
      points: 4,
      uiLabelEn: TASK_UI_LABELS_EN.WRITING_PICTURE_SENTENCE,
      instructionLv: "Apskati četrus attēlu aprakstus un uzraksti par katru vismaz piecus vārdus.",
      stimuli: {
        picturePrompts: prompts.map((prompt, index) => ({
          imageId: `img${index + 1}`,
          descriptionLv: prompt,
        })),
      },
      questions: prompts.map((prompt, index) => ({
        id: `q${index + 1}`,
        promptLv: prompt,
        minWords: 5,
      })),
      rubric: buildRubric(
        [
          { nameLv: "satura atbilstība", nameEn: "taskCompletion", maxPoints: 2 },
          { nameLv: "gramatika", nameEn: "grammar", maxPoints: 1 },
          { nameLv: "vārdu krājums un pareizrakstība", nameEn: "vocabularySpelling", maxPoints: 1 },
        ],
        "Vērtē katru teikumu pēc uzdevuma izpildes, teikuma pareizības un vārdu lietojuma.",
      ),
      sampleResponseLv:
        "Pirmajā attēlā ģimene kopā gatavo vakariņas. Otrajā attēlā cilvēks mierīgi gaida autobusu pieturā. Trešajā attēlā draugi pērk svaigus dārzeņus tirgū. Ceturtajā attēlā bērni spēlē bumbu parkā.",
      commonErrorsLv: [
        "Teikums ir īsāks par pieciem vārdiem.",
        "Nav darbības vārda pilnā teikumā.",
        "Lietots nepareizs lielais burts vai punkts.",
      ],
    },
    coreTexts: prompts,
  };
}

function buildWritingWordFormTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const nounOptions = [
    { stemLv: "Es dzīvoju ____ (Rīga).", correctForm: "Rīgā" },
    { stemLv: "Mēs vakar bijām ____ (Liepāja).", correctForm: "Liepājā" },
    { stemLv: "Viņa strādā ____ (banka).", correctForm: "bankā" },
  ] as const;

  const verbOptions = [
    { stemLv: "Rīt mēs ____ uz darbu ar autobusu. (braukt)", correctForm: "brauksim" },
    { stemLv: "Katru vakaru es ____ grāmatu. (lasīt)", correctForm: "lasu" },
    { stemLv: "Vakar viņi ____ mājās vēlu. (atgriezties)", correctForm: "atgriezās" },
  ] as const;

  const pronounOptions = [
    { stemLv: "Vai šī jaka ir ____? (tu)", correctForm: "tava" },
    { stemLv: "Mēs satikām ____ pie veikala. (viņš)", correctForm: "viņu" },
    { stemLv: "Skolotāja runāja ar ____. (es)", correctForm: "mani" },
  ] as const;

  const adjectiveOptions = [
    { stemLv: "Šodien ir ____ laiks nekā vakar. (silts)", correctForm: "siltāks" },
    { stemLv: "Man patīk ____ maize no rīta. (svaigs)", correctForm: "svaiga" },
    { stemLv: "Mēs dzīvojam ____ ielā. (kluss)", correctForm: "klusā" },
  ] as const;

  const numberOptions = [
    { stemLv: "Man ir ____ brāļi. (divi)", correctForm: "divi" },
    { stemLv: "Mēs gaidījām ____ minūtes. (desmit)", correctForm: "desmit" },
    { stemLv: "Klasē ir ____ skolēni. (divdesmit)", correctForm: "divdesmit" },
  ] as const;

  const selected = [
    rng.pick(nounOptions),
    rng.pick(verbOptions),
    rng.pick(pronounOptions),
    rng.pick(adjectiveOptions),
    rng.pick(numberOptions),
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "WORD_FORM",
      topic,
      points: 5,
      uiLabelEn: TASK_UI_LABELS_EN.WRITING_WORD_FORM,
      instructionLv:
        "Aizpildi teikumus ar pareizo vārda formu. Katrā teikumā izmanto dotā vārda pareizo formu.",
      stimuli: {
        categories: ["noun", "verb", "pronoun", "adjective", "number"],
      },
      questions: selected.map((row, index) => ({
        id: `q${index + 1}`,
        stemLv: row.stemLv,
      })),
      answerKey: {
        items: selected.map((row, index) => ({
          questionId: `q${index + 1}`,
          correctForm: row.correctForm,
        })),
      },
      rubric: buildRubric(
        [{ nameLv: "formas precizitāte", nameEn: "formAccuracy", maxPoints: 5 }],
        "Par katru pareizu formu piešķir vienu punktu.",
      ),
      sampleResponseLv: selected.map((row) => row.correctForm).join(", "),
      commonErrorsLv: [
        "Nepareiza locījuma galotne lietvārdam.",
        "Darbības vārds neatbilst laikam teikumā.",
        "Nav ievērota pareiza pareizrakstība ar garumzīmēm.",
      ],
    },
    coreTexts: [selected.map((row) => row.stemLv).join(" ")],
  };
}

function buildSmsSample(name: string, place: string): string {
  return `Sveiki! Vakar ${place} pazaudēju melnu somu ar dokumentiem. Soma bija pie autobusa pieturas ap pulksten astoņiem vakarā. Lūdzu, zvaniet man, ja atradāt. Atlīdzība ir garantēta. Mans vārds ir ${name}, tālrunis 20000000.`;
}

function buildWritingSmsTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const name = rng.pick(PERSON_NAMES_LV);
  const place = rng.pick(["Rīgas centrā", "tirgus laukumā", "pie stacijas", "parkā"] as const);
  const day = rng.pick(WEEKDAYS_LV);
  const scenario = `Tu ${day} ${place} pazaudēji personīgo lietu. Uzraksti īsu ziņu vai sludinājumu.`;

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "SMS_AD",
      topic,
      points: 6,
      uiLabelEn: TASK_UI_LABELS_EN.WRITING_SMS_AD,
      instructionLv: "Uzraksti apmēram 35 vārdu ziņu vai sludinājumu, iekļaujot visus četrus plāna punktus.",
      stimuli: {
        scenarioLv: scenario,
        planPointsLv: [
          "Kas notika?",
          "Kad un kur tas notika?",
          "Ko tu lūdz vai piedāvā?",
          "Kā ar tevi sazināties?",
        ],
        minWords: 35,
      },
      questions: [
        {
          id: "q1",
          promptLv: scenario,
          minWords: 35,
        },
      ],
      rubric: buildRubric(
        [
          { nameLv: "plāna punkti", nameEn: "planCoverage", maxPoints: 4 },
          { nameLv: "gramatika", nameEn: "grammar", maxPoints: 1 },
          { nameLv: "saistījums", nameEn: "coherence", maxPoints: 1 },
        ],
        "Piešķir vienu punktu par katru izpildītu plāna punktu un novērtē valodas kvalitāti.",
      ),
      sampleResponseLv: buildSmsSample(name, place),
      commonErrorsLv: [
        "Nav iekļauts viens no plāna punktiem.",
        "Nav skaidri norādīts saziņas veids.",
        "Teksts ir pārāk īss vai pārāk garš.",
      ],
    },
    coreTexts: [scenario, buildSmsSample(name, place)],
  };
}

function buildSpeakingInterviewTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const prompts = pickDistinct(rng, SPEAKING_INTERVIEW_QUESTION_POOL, 10).map((basePrompt) => {
    const modifier = rng.pick(["šonedēļ", "šomēnes", "ziemā", "vasarā", "rudenī", "pavasarī"] as const);
    if (basePrompt.endsWith("?")) {
      return `${basePrompt.slice(0, -1)} ${modifier}?`;
    }
    return `${basePrompt} ${modifier}?`;
  });

  const sampleResponseLv = [
    "Mani sauc Anna, es dzīvoju Rīgā.",
    "Darba dienās es ceļos septiņos un braucu uz darbu ar autobusu.",
    "Brīvajā laikā es eju pastaigās un lasu grāmatas.",
    "Pagājušajā nedēļas nogalē es satiku draugus un gatavoju vakariņas mājās.",
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "INTERVIEW",
      topic,
      points: 0,
      uiLabelEn: TASK_UI_LABELS_EN.SPEAKING_INTERVIEW,
      instructionLv: "Atbildi uz desmit īsiem intervijas jautājumiem pilnos teikumos.",
      stimuli: {
        questionCount: 10,
      },
      questions: prompts.map((promptLv, index) => ({
        id: `q${index + 1}`,
        promptLv,
      })),
      rubric: buildRubric(
        [{ nameLv: "iesildīšanās gatavība", nameEn: "readiness", maxPoints: 0 }],
        "Šis uzdevums ir iesildīšanās un netiek ieskaitīts punktos.",
      ),
      sampleResponseLv,
      commonErrorsLv: [
        "Atbilde ir tikai viens vārds, nevis pilns teikums.",
        "Jautājums tiek neatbildēts vai pārprasts.",
        "Ļoti gara pauze pirms atbildes sākuma.",
      ],
    },
    coreTexts: prompts,
  };
}

function buildSpeakingImageDescriptionTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const scenes = pickDistinct(rng, SPEAKING_IMAGE_SCENES, 2).map((baseScene) => {
    const suffix = rng.pick(["No rīta.", "Dienas vidū.", "Vakarā.", "Brīvdienā."] as const);
    return `${baseScene} ${suffix}`;
  });
  const personalBase = rng.pick([
    "Pastāsti, kad tu pēdējo reizi pavadīji laiku ar draugiem ārā.",
    "Pastāsti, ko tu parasti dari brīvdienā ar ģimeni.",
    "Pastāsti, kādu vietu pilsētā tu apmeklē visbiežāk.",
  ] as const);
  const personalModifier = rng.pick(["šonedēļ", "pagājušajā mēnesī", "ziemā", "vasarā"] as const);
  const personalQuestion = personalBase.replace(/\.$/, ` ${personalModifier}.`);

  const guidedQuestions = [
    "Ko cilvēki dara pirmajā attēlā?",
    "Kur notiek darbība otrajā attēlā?",
    "Kāda ir noskaņa abos attēlos?",
  ];

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "IMAGE_DESCRIPTION",
      topic,
      points: 12,
      uiLabelEn: TASK_UI_LABELS_EN.SPEAKING_IMAGE_DESCRIPTION,
      instructionLv:
        "Apraksti divus attēlus, atbildi uz trim jautājumiem un pēc tam atbildi uz personiskās pieredzes jautājumu.",
      stimuli: {
        images: [
          { id: "img1", descriptionLv: scenes[0] },
          { id: "img2", descriptionLv: scenes[1] },
        ],
        guidedQuestionsLv: guidedQuestions,
        personalQuestionLv: personalQuestion,
      },
      questions: [
        { id: "q1", promptLv: guidedQuestions[0] },
        { id: "q2", promptLv: guidedQuestions[1] },
        { id: "q3", promptLv: guidedQuestions[2] },
        { id: "q4", promptLv: personalQuestion },
      ],
      rubric: buildRubric(
        [
          { nameLv: "uzdevuma izpilde", nameEn: "taskCompletion", maxPoints: 4 },
          { nameLv: "gramatika", nameEn: "grammar", maxPoints: 3 },
          { nameLv: "leksika", nameEn: "vocabulary", maxPoints: 2 },
          { nameLv: "saistījums", nameEn: "coherence", maxPoints: 1 },
          { nameLv: "plūdums un izruna", nameEn: "fluencyPronunciation", maxPoints: 2 },
        ],
        "Vērtē atbilžu saturu, valodas pareizību, vārdu krājumu, saistījumu un runas plūdumu.",
      ),
      sampleResponseLv:
        "Pirmajā attēlā cilvēki kopā gatavo ēdienu virtuvē. Otrajā attēlā draugi mierīgi sarunājas kafejnīcā. Abos attēlos noskaņa ir draudzīga un mierīga. Brīvdienās es bieži tiekos ar draugiem parkā un runāju par nedēļas plāniem.",
      commonErrorsLv: [
        "Aprakstā nav minēta vieta vai darbība.",
        "Atbildes nav saistītas ar attēliem.",
        "Personiskās pieredzes jautājums paliek neatbildēts.",
      ],
    },
    coreTexts: [...scenes, personalQuestion],
  };
}

function buildSpeakingAdQuestionsTask(params: {
  examId: string;
  officialOrder: number;
  topic: string;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, officialOrder, topic, rng } = params;
  const taskId = buildTaskId(examId, officialOrder);

  const ads = pickDistinct(rng, SPEAKING_AD_POOL, 3).map((baseText, index) => {
    const day = rng.pick(WEEKDAYS_LV);
    const time = rng.pick(TIME_OPTIONS_LV);
    const place = rng.pick(["centrā", "Pārdaugavā", "pie stacijas", "Mežciemā"] as const);
    return {
      id: `ad${index + 1}`,
      textLv: `${baseText} Tikšanās ${day} ${time} ${place}.`,
      target: rng.pick(AD_TARGETS),
    };
  });

  const sampleQuestions = ads.map((ad) => {
    if (ad.target === "cena") return `Cik maksā šis piedāvājums?`;
    if (ad.target === "laiks") return `Cikos notiek nodarbības vai pakalpojums?`;
    if (ad.target === "adrese") return `Kur atrodas šī vieta?`;
    if (ad.target === "ilgums") return `Cik ilgi ilgst šis pakalpojums?`;
    return "Kādi ir galvenie nosacījumi?";
  });

  return {
    task: {
      id: taskId,
      officialOrder,
      taskType: "AD_QUESTION",
      topic,
      points: 3,
      uiLabelEn: TASK_UI_LABELS_EN.SPEAKING_AD_QUESTIONS,
      instructionLv: "Apskati trīs sludinājumus un par katru uzdod vienu pilnu jautājumu.",
      stimuli: {
        ads,
      },
      questions: ads.map((ad, index) => ({
        id: `q${index + 1}`,
        adId: ad.id,
        adTextLv: ad.textLv,
        targetLv: ad.target,
        promptLv: `Uzdod jautājumu par: ${ad.target}.`,
      })),
      rubric: buildRubric(
        [
          { nameLv: "jautājums 1", nameEn: "question1", maxPoints: 1 },
          { nameLv: "jautājums 2", nameEn: "question2", maxPoints: 1 },
          { nameLv: "jautājums 3", nameEn: "question3", maxPoints: 1 },
        ],
        "Par katru gramatiski saprotamu un atbilstošu jautājumu piešķir vienu punktu.",
      ),
      sampleResponseLv: sampleQuestions,
      commonErrorsLv: [
        "Jautājums nav pilns teikums.",
        "Nav jautājuma zīmes teikuma beigās.",
        "Jautājums nav saistīts ar sludinājuma informāciju.",
      ],
    },
    coreTexts: ads.map((ad) => ad.textLv),
  };
}

function buildTask(params: {
  examId: string;
  examIndex: number;
  officialOrder: number;
  rng: DeterministicRng;
}): GeneratedTask {
  const { examId, examIndex, officialOrder, rng } = params;
  const topic = rotateTopic(examIndex, officialOrder);

  if (officialOrder === 1) {
    return buildListeningAnnouncementsTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 2) {
    return buildListeningTrueFalseTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 3) {
    return buildListeningGapFillTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 4) {
    return buildReadingShortTextsTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 5) {
    return buildReadingAdMatchingTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 6) {
    return buildReadingClozeTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 7) {
    return buildWritingPictureSentenceTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 8) {
    return buildWritingWordFormTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 9) {
    return buildWritingSmsTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 10) {
    return buildSpeakingInterviewTask({ examId, officialOrder, topic, rng });
  }
  if (officialOrder === 11) {
    return buildSpeakingImageDescriptionTask({ examId, officialOrder, topic, rng });
  }

  return buildSpeakingAdQuestionsTask({ examId, officialOrder, topic, rng });
}

function buildTaskWithRetries(params: {
  seed: number;
  examId: string;
  examIndex: number;
  officialOrder: number;
  registry: Set<string>;
}): ExamTask {
  const { seed, examId, examIndex, officialOrder, registry } = params;

  for (let retryIndex = 0; retryIndex < 1024; retryIndex += 1) {
    const taskSeed = deriveTaskSeed({
      seed,
      examIndex,
      officialOrder,
      retryIndex,
    });

    const rng = new DeterministicRng(taskSeed);
    const generated = buildTask({ examId, examIndex, officialOrder, rng });

    try {
      assertTaskA2Friendly(generated.task);
    } catch {
      continue;
    }

    if (!ensureUniqueCoreTexts(generated.coreTexts, registry)) {
      continue;
    }

    return generated.task;
  }

  throw new Error(`Unable to generate unique task for order ${officialOrder} in ${examId}.`);
}

export function validateVvppA2Exam(exam: ExamVersion) {
  const skillOrder = exam.sections.map((section) => section.skill);
  if (JSON.stringify(skillOrder) !== JSON.stringify(SECTION_ORDER)) {
    throw new Error(`Invalid section order in ${exam.examId}: ${skillOrder.join(", ")}`);
  }

  if (JSON.stringify(exam.sectionDurationsMin) !== JSON.stringify(SECTION_DURATIONS_MIN)) {
    throw new Error(`Invalid section durations in ${exam.examId}.`);
  }

  if (exam.passRule.perSkillMin !== 9 || exam.passRule.perSkillMax !== 15) {
    throw new Error(`Invalid pass rule in ${exam.examId}.`);
  }

  const allTasks = exam.sections.flatMap((section) => section.tasks);
  if (allTasks.length !== 12) {
    throw new Error(`Exam ${exam.examId} must contain 12 tasks, got ${allTasks.length}.`);
  }

  const orders = allTasks.map((task) => task.officialOrder).sort((a, b) => a - b);
  for (let i = 0; i < 12; i += 1) {
    if (orders[i] !== i + 1) {
      throw new Error(`Exam ${exam.examId} has invalid officialOrder sequence.`);
    }
  }

  const sectionTaskCounts = exam.sections.map((section) => section.tasks.length);
  if (sectionTaskCounts.some((count) => count !== 3)) {
    throw new Error(`Each section in ${exam.examId} must contain exactly 3 tasks.`);
  }

  const pointsBySkill = new Map<ExamSkill, number>();
  for (const section of exam.sections) {
    pointsBySkill.set(
      section.skill,
      section.tasks.reduce((sum, task) => sum + task.points, 0),
    );
  }

  for (const skill of SECTION_ORDER) {
    const points = pointsBySkill.get(skill) ?? 0;
    if (points !== 15) {
      throw new Error(`Skill ${skill} in ${exam.examId} must total 15 points, got ${points}.`);
    }
  }

  const totalPoints = [...pointsBySkill.values()].reduce((sum, value) => sum + value, 0);
  if (totalPoints !== 60) {
    throw new Error(`Exam ${exam.examId} must total 60 points, got ${totalPoints}.`);
  }

  for (const task of allTasks) {
    const hasAnswerKey = Boolean(task.answerKey?.items?.length);
    if (AUTO_GRADED_TASK_ORDERS.has(task.officialOrder) && !hasAnswerKey) {
      throw new Error(`Auto-graded task ${task.id} is missing answerKey.`);
    }
    if (!AUTO_GRADED_TASK_ORDERS.has(task.officialOrder) && hasAnswerKey && task.officialOrder !== 8) {
      throw new Error(`Task ${task.id} should not contain answerKey.`);
    }

    if (task.officialOrder <= 3) {
      const audioScriptLv = task.stimuli.audioScriptLv;
      const transcriptLv = task.stimuli.transcriptLv;
      if (!Array.isArray(audioScriptLv) || audioScriptLv.length === 0 || typeof transcriptLv !== "string") {
        throw new Error(`Listening task ${task.id} must contain audioScriptLv and transcriptLv.`);
      }
    }

    if (PRODUCTION_TASK_ORDERS.has(task.officialOrder)) {
      if (!task.rubric || !Array.isArray(task.rubric.dimensions) || task.rubric.dimensions.length === 0) {
        throw new Error(`Production task ${task.id} must include rubric dimensions.`);
      }
      if (!task.sampleResponseLv) {
        throw new Error(`Production task ${task.id} must include sampleResponseLv.`);
      }
      if (!Array.isArray(task.commonErrorsLv) || task.commonErrorsLv.length === 0) {
        throw new Error(`Production task ${task.id} must include commonErrorsLv.`);
      }
    }
  }

  const uniqueTopics = new Set(allTasks.map((task) => task.topic));
  if (uniqueTopics.size < 6) {
    throw new Error(`Exam ${exam.examId} must cover at least 6 topics.`);
  }

  const unknownTopic = [...uniqueTopics].find((topic) => !TOPICS.includes(topic as (typeof TOPICS)[number]));
  if (unknownTopic) {
    throw new Error(`Exam ${exam.examId} includes unknown topic: ${unknownTopic}`);
  }

  if (
    exam.validation.listeningPoints !== 15 ||
    exam.validation.readingPoints !== 15 ||
    exam.validation.writingPoints !== 15 ||
    exam.validation.speakingPoints !== 15 ||
    exam.validation.totalPoints !== 60
  ) {
    throw new Error(`Exam ${exam.examId} validation summary is invalid.`);
  }
}

function buildExam(params: {
  seed: number;
  examIndex: number;
  versionLabel: string;
  examId: string;
  uniquenessRegistry: Set<string>;
}): ExamVersion {
  const { seed, examIndex, versionLabel, examId, uniquenessRegistry } = params;

  const allTasks: ExamTask[] = [];

  for (let officialOrder = 1; officialOrder <= 12; officialOrder += 1) {
    const task = buildTaskWithRetries({
      seed,
      examId,
      examIndex,
      officialOrder,
      registry: uniquenessRegistry,
    });

    allTasks.push(task);
  }

  const sections: ExamSection[] = SECTION_ORDER.map((skill) => ({
    skill,
    tasks: allTasks.filter((task) => skillFromOrder(task.officialOrder) === skill),
  }));

  const exam: ExamVersion = {
    examId,
    versionLabel,
    sectionDurationsMin: SECTION_DURATIONS_MIN,
    passRule: PASS_RULE,
    sections,
    validation: {
      listeningPoints: 15,
      readingPoints: 15,
      writingPoints: 15,
      speakingPoints: 15,
      totalPoints: 60,
    },
  };

  validateVvppA2Exam(exam);
  return exam;
}

function sanitizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function sanitizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : fallback;
}

export function generateVvppA2Exams(input: VvppA2GeneratorInput = {}): VvppA2GeneratorOutput {
  const n = sanitizePositiveInt(input.n, 3);
  const seed = sanitizePositiveInt(input.seed, 2026);
  const extraPracticeVariants = sanitizeNonNegativeInt(input.extraPracticeVariants, 0);

  const exams: ExamVersion[] = [];
  const uniquenessRegistry = new Set<string>();

  for (let i = 0; i < n; i += 1) {
    const examId = `vvpp_a2_${seed}_v${i + 1}`;
    const versionLabel = `VVPP A2 V${i + 1}`;
    exams.push(
      buildExam({
        seed,
        examIndex: i,
        versionLabel,
        examId,
        uniquenessRegistry,
      }),
    );
  }

  for (let j = 0; j < extraPracticeVariants; j += 1) {
    const examIndex = n + j;
    const examId = `vvpp_a2_${seed}_practice_v${j + 1}`;
    const versionLabel = `PRACTICE V${j + 1}`;
    exams.push(
      buildExam({
        seed,
        examIndex,
        versionLabel,
        examId,
        uniquenessRegistry,
      }),
    );
  }

  return {
    generator: {
      name: "VVPP_A2_Generator",
      seed,
      n,
    },
    exams,
  };
}
