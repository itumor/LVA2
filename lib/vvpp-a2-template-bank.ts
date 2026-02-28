export const TOPICS = [
  "family",
  "work",
  "shopping",
  "health",
  "transport",
  "leisure",
  "holidays",
  "weather",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS_LV: Record<Topic, string> = {
  family: "ģimene",
  work: "darbs",
  shopping: "iepirkšanās",
  health: "veselība",
  transport: "transports",
  leisure: "brīvais laiks",
  holidays: "svētki un brīvdienas",
  weather: "laikapstākļi",
};

export function rotateTopic(examIndex: number, officialOrder: number): Topic {
  const index = (examIndex * 3 + (officialOrder - 1)) % TOPICS.length;
  return TOPICS[index] ?? TOPICS[0];
}

export const TASK_UI_LABELS_EN = {
  LISTENING_ANNOUNCEMENTS: "Announcements MCQ",
  LISTENING_TRUE_FALSE: "Dialogue True/False",
  LISTENING_GAP_FILL: "Short Dialogue Gap Fill",
  READING_SHORT_TEXTS: "Short Text Statements",
  READING_AD_MATCHING: "Situations to Ads",
  READING_CLOZE: "Cloze Multiple Choice",
  WRITING_PICTURE_SENTENCE: "Picture Sentences",
  WRITING_WORD_FORM: "Word Forms",
  WRITING_SMS_AD: "SMS/Advert",
  SPEAKING_INTERVIEW: "Interview",
  SPEAKING_IMAGE_DESCRIPTION: "Image Description",
  SPEAKING_AD_QUESTIONS: "Questions About Ads",
} as const;

export const PERSON_NAMES_LV = [
  "Anna",
  "Jānis",
  "Marta",
  "Edgars",
  "Līga",
  "Roberts",
  "Ilze",
  "Pēteris",
  "Laura",
  "Andris",
  "Dace",
  "Toms",
] as const;

export const CITIES_LV = [
  "Rīgu",
  "Jelgavu",
  "Liepāju",
  "Valmieru",
  "Ventspili",
  "Daugavpili",
  "Cēsīm",
  "Siguldu",
] as const;

export const CITY_PLACES_LV = [
  "stacijā",
  "aptiekā",
  "bibliotēkā",
  "tirgū",
  "kafejnīcā",
  "sporta centrā",
  "kultūras namā",
  "parkā",
] as const;

export const WEEKDAYS_LV = [
  "pirmdien",
  "otrdien",
  "trešdien",
  "ceturtdien",
  "piektdien",
  "sestdien",
  "svētdien",
] as const;

export const TIME_OPTIONS_LV = [
  "7.30",
  "8.00",
  "8.30",
  "9.00",
  "9.30",
  "10.00",
  "17.00",
  "18.00",
  "18.30",
  "19.00",
  "19.30",
  "20.00",
  "20.30",
] as const;

export const PRICE_OPTIONS_EUR = [
  "1.20",
  "1.40",
  "1.50",
  "1.80",
  "2.00",
  "2.20",
  "2.50",
  "2.80",
  "3.00",
] as const;

export const EVENT_PLACES_LV = [
  "kultūras namā",
  "skolas zālē",
  "sporta hallē",
  "bibliotēkas zālē",
  "kopienas centrā",
  "pilsētas parkā",
] as const;

export const BUS_NUMBERS = ["2", "3", "4", "5", "6", "7", "8", "9"] as const;

export const SERVICES_LV = [
  "aptieka",
  "pasts",
  "baseins",
  "frizētava",
  "grāmatnīca",
  "veikals",
] as const;

export const GAP_TARGET_WORDS = [
  "rīt",
  "deviņos",
  "aptiekā",
  "lielo",
  "divas",
  "piektdien",
  "autobusā",
  "zilo",
  "trīs",
  "stacijā",
  "vakar",
  "svētdien",
  "mājās",
  "ātri",
  "siltu",
] as const;

export const GAP_DISTRACTOR_WORDS = [
  "zaļo",
  "vēlu",
  "septiņos",
  "pagalmā",
  "vienu",
  "aukstu",
  "lēni",
  "rudenī",
  "laukumā",
  "mazo",
] as const;

export const READING_AD_POOL = [
  "Velosipēdu remonts darba dienās no 9.00 līdz 18.00.",
  "Bērnu peldēšanas nodarbības sestdienās no rīta.",
  "Datoru kursi iesācējiem vakaros divas reizes nedēļā.",
  "Dzīvokļu uzkopšanas pakalpojumi ar saviem līdzekļiem.",
  "Šūšanas darbnīca: bikšu saīsināšana vienas dienas laikā.",
  "Privāts angļu valodas skolotājs tiešsaistē.",
  "Suņu pastaigas pakalpojums darba dienu vakaros.",
  "Svaigu dārzeņu piegāde uz mājām sestdienās.",
  "Mūzikas skola piedāvā klavieru nodarbības bērniem.",
  "Automašīnu mazgāšana bez iepriekšēja pieraksta.",
  "Masāžas kabinets ar vakara laikiem pēc darba.",
  "Foto pakalpojumi pasēm un dokumentiem desmit minūtēs.",
] as const;

export const READING_SITUATION_POOL = [
  {
    textLv: "Tev steidzami jāsaīsina bikses līdz rītdienai.",
    matches: ["Šūšanas darbnīca"],
  },
  {
    textLv: "Tu gribi mācīties datoru pamatus pēc darba.",
    matches: ["Datoru kursi"],
  },
  {
    textLv: "Tavam bērnam vajag peldēšanas nodarbības nedēļas nogalē.",
    matches: ["Bērnu peldēšanas"],
  },
  {
    textLv: "Dzīvoklim nepieciešama regulāra uzkopšana.",
    matches: ["Dzīvokļu uzkopšanas"],
  },
  {
    textLv: "Jāsalabo velosipēds šīs nedēļas laikā.",
    matches: ["Velosipēdu remonts"],
  },
  {
    textLv: "Vēlies individuālas angļu valodas nodarbības.",
    matches: ["Privāts angļu valodas skolotājs"],
  },
  {
    textLv: "Sunim vajag pastaigu darba dienu vakaros.",
    matches: ["Suņu pastaigas"],
  },
  {
    textLv: "Vēlies pasūtīt dārzeņus uz mājām sestdien.",
    matches: ["Svaigu dārzeņu piegāde"],
  },
  {
    textLv: "Tev vajag pases foto bez ilgas gaidīšanas.",
    matches: ["Foto pakalpojumi"],
  },
] as const;

export const WRITING_PICTURE_PROMPTS = [
  "Ģimene gatavo vakariņas mājas virtuvē.",
  "Cilvēks gaida autobusu pie pieturas lietū.",
  "Draugi iepērkas tirgū sestdienas rītā.",
  "Bērni spēlē bumbu parkā saulainā dienā.",
  "Sieviete lasa grāmatu bibliotēkā.",
  "Vīrietis skrien gar jūru vējainā laikā.",
  "Kolēģi dzer tēju biroja virtuvē.",
  "Pāris plāno ceļojumu pie galda ar karti.",
  "Skolēns raksta mājasdarbu savā istabā.",
  "Ģimene rotā māju pirms svētkiem.",
] as const;

export const SPEAKING_IMAGE_SCENES = [
  "Ģimene kopā gatavo pusdienas virtuvē.",
  "Divi draugi brauc ar velosipēdiem parkā.",
  "Cilvēki sēž kafejnīcā un runā.",
  "Skolēni gaida autobusu pie skolas.",
  "Pāris pastaigājas pa vecpilsētu.",
  "Kolēģi strādā pie datora birojā.",
  "Vecāki ar bērniem spēlējas pludmalē.",
  "Cilvēks pērk augļus tirgū.",
] as const;

export const SPEAKING_INTERVIEW_QUESTION_POOL = [
  "Kā jūs sauc un no kurienes jūs esat?",
  "Kur jūs dzīvojat un ar ko kopā dzīvojat?",
  "Ko jūs parasti darāt no rīta pirms darba vai mācībām?",
  "Kāds ir jūsu darba vai mācību grafiks?",
  "Kā jūs parasti nokļūstat darbā vai skolā?",
  "Ko jūs parasti pērkat veikalā katru nedēļu?",
  "Ko jūs darāt brīvajā laikā pēc darba?",
  "Ko jūs darījāt pagājušajā nedēļas nogalē?",
  "Kādi ir jūsu plāni nākamajām brīvdienām?",
  "Kāpēc jūs mācāties latviešu valodu?",
  "Kāds laiks jums patīk visvairāk un kāpēc?",
  "Kādu ēdienu jūs gatavojat mājās visbiežāk?",
  "Ar ko jūs sazināties katru dienu pa telefonu?",
  "Kur jūs labprāt pavadāt atvaļinājumu Latvijā?",
] as const;

export const AD_TARGETS = ["cena", "laiks", "adrese", "ilgums", "nosacījumi"] as const;

export const SPEAKING_AD_POOL = [
  "Istaba īrei klusā centrā ar internetu.",
  "Latviešu valodas kursi iesācējiem vakaros.",
  "Velosipēdu noma vasaras sezonai.",
  "Mūzikas skola meklē jaunus audzēkņus.",
  "Sporta klubs piedāvā rīta abonementu.",
  "Mājražotājs pārdod medu un ievārījumu.",
  "Dārza darbi privātmājām pavasarī.",
  "Bērnu nometne jūlijā pie ezera.",
] as const;

export type RubricDimension = {
  nameLv: string;
  nameEn: string;
  maxPoints: number;
};

export function buildRubric(dimensions: RubricDimension[], scoringNotesLv: string) {
  return {
    dimensions,
    scoringNotesLv,
  };
}
