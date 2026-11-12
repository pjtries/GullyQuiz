export interface FallbackQuestion {
  id: string;
  category: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

export const CURATED_QUESTIONS: FallbackQuestion[] = [
  {
    id: "q-01",
    category: "GENERAL_KNOWLEDGE",
    questionText: "Which Indian spacecraft successfully made a soft landing near the south pole of the Moon in August 2023?",
    options: ["Chandrayaan-1", "Chandrayaan-2", "Chandrayaan-3", "Mangalyaan-2"],
    correctOptionIndex: 2,
  },
  {
    id: "q-02",
    category: "GENERAL_KNOWLEDGE",
    questionText: "What is the official currency denomination stored in 1 Indian Rupee?",
    options: ["10 Paise", "50 Paise", "100 Paise", "1000 Paise"],
    correctOptionIndex: 2,
  },
  {
    id: "q-03",
    category: "GENERAL_KNOWLEDGE",
    questionText: "Who is celebrated as the 'Father of the Indian Constitution'?",
    options: ["Mahatma Gandhi", "Dr. B. R. Ambedkar", "Jawaharlal Nehru", "Sardar Vallabhbhai Patel"],
    correctOptionIndex: 1,
  },
  {
    id: "q-04",
    category: "GENERAL_KNOWLEDGE",
    questionText: "Which is the longest river flowing primarily within India?",
    options: ["Ganga", "Yamuna", "Godavari", "Brahmaputra"],
    correctOptionIndex: 0,
  },
  {
    id: "q-05",
    category: "GENERAL_KNOWLEDGE",
    questionText: "How many player positions make up a standard cricket team on the field?",
    options: ["9", "10", "11", "12"],
    correctOptionIndex: 2,
  },
  {
    id: "q-06",
    category: "GENERAL_KNOWLEDGE",
    questionText: "Which planet in our solar system is popularly known as the 'Red Planet'?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctOptionIndex: 1,
  },
  {
    id: "q-07",
    category: "GENERAL_KNOWLEDGE",
    questionText: "In which year did India win its first Cricket World Cup under Kapil Dev's captaincy?",
    options: ["1975", "1979", "1983", "1987"],
    correctOptionIndex: 2,
  },
  {
    id: "q-08",
    category: "GENERAL_KNOWLEDGE",
    questionText: "What is the capital city of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Brisbane"],
    correctOptionIndex: 2,
  },
  {
    id: "q-09",
    category: "GENERAL_KNOWLEDGE",
    questionText: "Which Indian state is famously known as the 'Land of Five Rivers'?",
    options: ["Punjab", "Haryana", "Rajasthan", "Uttar Pradesh"],
    correctOptionIndex: 0,
  },
  {
    id: "q-10",
    category: "GENERAL_KNOWLEDGE",
    questionText: "What chemical gas do plants primarily absorb from the atmosphere for photosynthesis?",
    options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Methane"],
    correctOptionIndex: 1,
  },
];
