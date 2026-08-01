/**
 * The thirty phrases worth having in your own voice.
 *
 * Standard voice banking has people read sentences like "the big yellow jug of
 * fresh orange juice is warming on the shelf" — chosen purely because they
 * cover awkward phonemes. They're fine for training a synthetic voice and
 * useless for anything else: nobody ever needs to say them.
 *
 * This deck inverts that. Every line is something the person will actually
 * need after they stop being able to speak — introducing themselves, asking
 * for water, saying they're in pain, saying goodnight. Banked in their real
 * voice, these play back directly, which means the product works on day one
 * without waiting on a synthetic voice to be built.
 *
 * They still carry the phonetic load. Read end to end the deck covers the full
 * ARPAbet inventory, so the corpus is good enough to build a synthetic voice
 * from later — the coverage just stops being the reason for the sentence.
 *
 * `triggers` are the ways someone might ask the question this phrase answers.
 * They're indexed separately so the speak-for-me surface can match a spoken
 * question to the right banked reply.
 */

export type EssentialCategory =
  | 'Introductions'
  | 'Everyday needs'
  | 'Comfort and pain'
  | 'Understanding each other'
  | 'People and feeling';

export type Essential = {
  id: string;
  category: EssentialCategory;
  /** `{name}` is replaced with the patient's name. */
  text: string;
  /** How someone might ask the question this answers. */
  triggers: string[];
};

export const ESSENTIALS: Essential[] = [
  // ------------------------------------------------------------ introductions
  {
    id: 'name',
    category: 'Introductions',
    text: 'My name is {name}.',
    triggers: ["what is your name", "who are you", "can you tell me your name", "what should I call you"],
  },
  {
    id: 'greeting',
    category: 'Introductions',
    text: "Hello. It's good to see you.",
    triggers: ['hello', 'hi there', 'good morning', 'how are you doing today'],
  },
  {
    id: 'how-am-i',
    category: 'Introductions',
    text: "I'm doing all right today, thank you for asking.",
    triggers: ['how are you', 'how are you feeling', 'are you doing okay', 'how has your day been'],
  },

  // ----------------------------------------------------------- everyday needs
  {
    id: 'water',
    category: 'Everyday needs',
    text: "I'm thirsty. Could I have a drink of water, please?",
    triggers: ['are you thirsty', 'do you want a drink', 'would you like some water', 'can I get you anything'],
  },
  {
    id: 'food',
    category: 'Everyday needs',
    text: "I'm hungry. Could I have something to eat?",
    triggers: ['are you hungry', 'do you want something to eat', 'is it time for lunch', 'would you like food'],
  },
  {
    id: 'bathroom',
    category: 'Everyday needs',
    text: 'I need to use the bathroom.',
    triggers: ['do you need the bathroom', 'do you need the toilet', 'do you need help getting up'],
  },
  {
    id: 'sit-up',
    category: 'Everyday needs',
    text: 'Could you help me sit up, please?',
    triggers: ['do you want to sit up', 'are you comfortable', 'do you want to move'],
  },
  {
    id: 'lie-down',
    category: 'Everyday needs',
    text: "I'd like to lie down and rest now.",
    triggers: ['do you want to lie down', 'are you tired', 'do you want to go to bed'],
  },
  {
    id: 'blanket',
    category: 'Everyday needs',
    text: "I'm cold. Could I have another blanket?",
    triggers: ['are you cold', 'do you want a blanket', 'is the room too cold'],
  },
  {
    id: 'too-warm',
    category: 'Everyday needs',
    text: "I'm too warm. Could you open a window?",
    triggers: ['are you too hot', 'is it warm in here', 'do you want the window open'],
  },
  {
    id: 'glasses',
    category: 'Everyday needs',
    text: 'Could you pass me my glasses, please?',
    triggers: ['do you need your glasses', 'can I get you something', 'what do you need'],
  },
  {
    id: 'wash',
    category: 'Everyday needs',
    text: "I'd like to have a wash. Could you help me?",
    triggers: ['do you want a shower', 'shall we get you washed', 'is it time to wash'],
  },
  {
    id: 'television',
    category: 'Everyday needs',
    text: 'Could you put the television on for me?',
    triggers: ['do you want the tv on', 'shall I turn on the television', 'do you want some music'],
  },
  {
    id: 'light-off',
    category: 'Everyday needs',
    text: 'Please turn the light off.',
    triggers: ['do you want the light off', 'is the light too bright', 'shall I leave the light on'],
  },

  // --------------------------------------------------------- comfort and pain
  {
    id: 'pain',
    category: 'Comfort and pain',
    text: "I'm in pain.",
    triggers: ['are you in pain', 'does it hurt', 'are you hurting', 'is something wrong'],
  },
  {
    id: 'pain-here',
    category: 'Comfort and pain',
    text: 'The pain is here, where I am looking.',
    triggers: ['where does it hurt', 'can you show me where', 'which part hurts'],
  },
  {
    id: 'no-pain',
    category: 'Comfort and pain',
    text: "I'm not in any pain right now.",
    triggers: ['are you in pain', 'are you comfortable', 'does anything hurt'],
  },
  {
    id: 'doctor',
    category: 'Comfort and pain',
    text: 'Please call my doctor.',
    triggers: ['should I call someone', 'do you want the doctor', 'do you need help'],
  },
  {
    id: 'tired',
    category: 'Comfort and pain',
    text: "I'm very tired. I just need to rest for a while.",
    triggers: ['are you tired', 'do you need a break', 'have you had enough'],
  },
  {
    id: 'breathing',
    category: 'Comfort and pain',
    text: "I'm having trouble breathing.",
    triggers: ['are you breathing okay', 'is it hard to breathe', 'do you need suction'],
  },

  // -------------------------------------------------- understanding each other
  {
    id: 'yes',
    category: 'Understanding each other',
    text: "Yes, that's right.",
    triggers: ['is that right', 'did I get that right', 'yes or no', 'do you agree'],
  },
  {
    id: 'no',
    category: 'Understanding each other',
    text: "No, that's not what I meant.",
    triggers: ['is that right', 'did I understand you', 'is that what you wanted'],
  },
  {
    id: 'slow-down',
    category: 'Understanding each other',
    text: 'Please slow down. I need a little more time.',
    triggers: ['am I going too fast', 'do you need more time'],
  },
  {
    id: 'say-again',
    category: 'Understanding each other',
    text: "I didn't understand that. Could you say it again?",
    triggers: ['did you hear me', 'did you understand', 'do you want me to repeat that'],
  },

  // ------------------------------------------------------- people and feeling
  {
    id: 'thank-you',
    category: 'People and feeling',
    text: 'Thank you so much. That means a great deal to me.',
    triggers: ['you are welcome', 'is there anything else', 'I hope that helped'],
  },
  {
    id: 'love-you',
    category: 'People and feeling',
    text: 'I love you.',
    triggers: ['I love you', 'do you know how much we love you'],
  },
  {
    id: 'stay',
    category: 'People and feeling',
    text: 'Could you stay with me a while?',
    triggers: ['do you want me to stay', 'shall I go', 'do you want company'],
  },
  {
    id: 'alone',
    category: 'People and feeling',
    text: "I'd like to be on my own for a little while.",
    triggers: ['do you want to be alone', 'shall I give you some space', 'do you want company'],
  },
  {
    id: 'family',
    category: 'People and feeling',
    text: "I'd like to see my family.",
    triggers: ['do you want to see anyone', 'shall I call your family', 'who would you like to see'],
  },
  {
    id: 'goodnight',
    category: 'People and feeling',
    text: 'Goodnight. Sleep well.',
    triggers: ['goodnight', 'I am heading home now', 'see you tomorrow'],
  },
];

export const ESSENTIAL_CATEGORIES: EssentialCategory[] = [
  'Introductions',
  'Everyday needs',
  'Comfort and pain',
  'Understanding each other',
  'People and feeling',
];

export function essentialById(id: string): Essential | undefined {
  return ESSENTIALS.find((e) => e.id === id);
}

/** Fills in the patient's own name where the deck calls for it. */
export function renderEssential(essential: Essential, patientName: string): string {
  return essential.text.replace('{name}', patientName || '—');
}
