import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed for GullyQuiz QR...");

  // Clear existing data in reverse dependency order for clean idempotent seeding
  await prisma.matchParticipant.deleteMany();
  await prisma.vendorPayout.deleteMany();
  await prisma.match.deleteMany();
  await prisma.question.deleteMany();
  await prisma.player.deleteMany();
  await prisma.shop.deleteMany();

  console.log("🧹 Cleaned existing tables.");

  const now = new Date();
  const pinExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

  // 1. Seed 10 Pilot Shops with active 4-digit PINs valid for 24 hours
  const pilotShops = [
    {
      shopCode: "SHP_001",
      name: "Sharma Chai Tapri & Snacks",
      ownerName: "Ramesh Sharma",
      ownerPhone: "+919876543201",
      ownerUpiId: "sharmachai@upi",
      currentPin: "1234",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_002",
      name: "Nandi Corner Tea & Filter Coffee",
      ownerName: "Venkatesh Gowda",
      ownerPhone: "+919876543202",
      ownerUpiId: "nandichai@okaxis",
      currentPin: "2468",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_003",
      name: "Maa Saraswati Book Depot & Stationery",
      ownerName: "Pradeep Kumar Gupta",
      ownerPhone: "+919876543203",
      ownerUpiId: "saraswatibooks@paytm",
      currentPin: "1357",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_004",
      name: "Gupta Ji Ki Mashhoor Special Chai",
      ownerName: "Anil Gupta",
      ownerPhone: "+919876543204",
      ownerUpiId: "guptaji@ybl",
      currentPin: "4321",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_005",
      name: "Kaveri Student Book House & Xerox",
      ownerName: "Suresh Shenoy",
      ownerPhone: "+919876543205",
      ownerUpiId: "kaveribooks@upi",
      currentPin: "9876",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_006",
      name: "Al-Madina Chai Point & Bakery",
      ownerName: "Farhan Qureshi",
      ownerPhone: "+919876543206",
      ownerUpiId: "farhanchai@okhdfcbank",
      currentPin: "5555",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_007",
      name: "Vidyarthi Pustak Bhandar",
      ownerName: "Kavitha Murthy",
      ownerPhone: "+919876543207",
      ownerUpiId: "vidyarthibooks@icici",
      currentPin: "7777",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_008",
      name: "Sardarji Amrit Tulya Chaha",
      ownerName: "Gurpreet Singh",
      ownerPhone: "+919876543208",
      ownerUpiId: "amrittulya@sbi",
      currentPin: "8888",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_009",
      name: "Pooja Newspaper & Magazine Corner",
      ownerName: "Pooja Verma",
      ownerPhone: "+919876543209",
      ownerUpiId: "poojanews@upi",
      currentPin: "1122",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
    {
      shopCode: "SHP_010",
      name: "Annapurna Tea & Refreshment Centre",
      ownerName: "Mahesh Joshi",
      ownerPhone: "+919876543210",
      ownerUpiId: "annapurnachai@upi",
      currentPin: "3344",
      pinExpiresAt,
      unsettledBalancePaise: 0,
      isActive: true,
    },
  ];

  for (const shop of pilotShops) {
    await prisma.shop.create({ data: shop });
  }
  console.log(`✅ Seeded ${pilotShops.length} pilot shops with 24h active PINs.`);

  // 2. Seed 30 Curated Indian & Global General Knowledge Questions
  const curatedQuestions = [
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which Indian spacecraft successfully made a soft landing near the south pole of the Moon in August 2023?",
      options: ["Chandrayaan-1", "Chandrayaan-2", "Chandrayaan-3", "Mangalyaan-2"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What is the official currency denomination stored in 1 Indian Rupee?",
      options: ["10 Paise", "50 Paise", "100 Paise", "1000 Paise"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Who is celebrated as the 'Father of the Indian Constitution'?",
      options: ["Mahatma Gandhi", "Dr. B. R. Ambedkar", "Jawaharlal Nehru", "Sardar Vallabhbhai Patel"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which is the longest river flowing entirely or primarily within India?",
      options: ["Ganga", "Yamuna", "Godavari", "Brahmaputra"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "How many player positions make up a standard cricket team on the field?",
      options: ["9", "10", "11", "12"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which planet in our solar system is popularly known as the 'Red Planet'?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "In which year did India win its first Cricket World Cup under Kapil Dev's captaincy?",
      options: ["1975", "1979", "1983", "1987"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What is the capital city of Australia?",
      options: ["Sydney", "Melbourne", "Canberra", "Brisbane"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which Indian state is famously known as the 'Land of Five Rivers'?",
      options: ["Punjab", "Haryana", "Rajasthan", "Uttar Pradesh"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What chemical gas do plants primarily absorb from the atmosphere for photosynthesis?",
      options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Methane"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Who wrote the Indian national anthem 'Jana Gana Mana'?",
      options: ["Bankim Chandra Chatterjee", "Rabindranath Tagore", "Sarojini Naidu", "Subhash Chandra Bose"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which organ in the human body is responsible for pumping blood?",
      options: ["Brain", "Lungs", "Heart", "Liver"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Where is ISRO's primary satellite launch centre, Satish Dhawan Space Centre, located?",
      options: ["Thiruvananthapuram", "Sriharikota", "Bengaluru", "Chandipur"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What does the abbreviation 'UPI' stand for in Indian digital payments?",
      options: ["Unified Payments Interface", "Universal Personal Identity", "United Payment Infrastructure", "Unique Public Interface"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which metal is the best conductor of electricity at standard temperature?",
      options: ["Copper", "Gold", "Silver", "Aluminium"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What is the highest mountain peak located in India?",
      options: ["Mount Everest", "Kangchenjunga", "Nanda Devi", "K2 (Godwin-Austen)"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which is the national aquatic animal of India?",
      options: ["Ganges River Dolphin", "Blue Whale", "Gharial", "Olive Ridley Sea Turtle"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Who won India's first individual Olympic gold medal in athletics in 2021?",
      options: ["Abhinav Bindra", "Neeraj Chopra", "Milkha Singh", "P. T. Usha"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which gas makes up approximately 78% of Earth's atmosphere?",
      options: ["Oxygen", "Carbon Dioxide", "Argon", "Nitrogen"],
      correctOptionIndex: 3,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which classical dance form originated in the state of Kerala?",
      options: ["Bharatanatyam", "Kathakali", "Kathak", "Kuchipudi"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What does 'QR' in QR code stand for?",
      options: ["Quick Response", "Quantum Reader", "Quality Record", "Queue Route"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which country is the largest coffee producer in the world?",
      options: ["Colombia", "Vietnam", "Brazil", "India"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "In which Indian city is the historic Charminar located?",
      options: ["Hyderabad", "Lucknow", "Delhi", "Agra"],
      correctOptionIndex: 0,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "What is the boiling point of pure water at standard sea-level atmospheric pressure?",
      options: ["90°C", "95°C", "100°C", "110°C"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which Indian scientist won the Nobel Prize in Physics in 1930 for the scattering of light?",
      options: ["Homi J. Bhabha", "C. V. Raman", "Jagadish Chandra Bose", "Satyendra Nath Bose"],
      correctOptionIndex: 1,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which is the smallest continent by land area on Earth?",
      options: ["Europe", "Antarctica", "South America", "Australia"],
      correctOptionIndex: 3,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "How many spokes are there in the Ashoka Chakra on the Indian National Flag?",
      options: ["20", "22", "24", "26"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which vitamin is synthesized in the human skin when exposed to sunlight?",
      options: ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D"],
      correctOptionIndex: 3,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Which ocean is the largest and deepest ocean on Earth?",
      options: ["Atlantic Ocean", "Indian Ocean", "Pacific Ocean", "Arctic Ocean"],
      correctOptionIndex: 2,
      isActive: true,
    },
    {
      category: "GENERAL_KNOWLEDGE",
      questionText: "Who is known as the 'Missile Man of India'?",
      options: ["Dr. A. P. J. Abdul Kalam", "Vikram Sarabhai", "K. Sivan", "Satish Dhawan"],
      correctOptionIndex: 0,
      isActive: true,
    },
  ];

  for (const q of curatedQuestions) {
    await prisma.question.create({
      data: {
        category: q.category,
        questionText: q.questionText,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        isActive: q.isActive,
      },
    });
  }
  console.log(`✅ Seeded ${curatedQuestions.length} curated GK trivia questions.`);

  // 3. Create a sample pilot player to assist immediate local testing
  const samplePlayer = await prisma.player.upsert({
    where: { phone: "+919999988888" },
    update: {},
    create: {
      phone: "+919999988888",
      displayName: "Ravi Kumar",
      upiId: "ravi@okhdfcbank",
      totalMatches: 3,
      totalWinningsPaise: 2100, // ₹21.00
    },
  });
  console.log(`✅ Sample test player ready: ${samplePlayer.displayName} (${samplePlayer.phone})`);

  console.log("🎉 GullyQuiz Phase 1 seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
