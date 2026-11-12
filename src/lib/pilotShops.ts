export interface PilotShopData {
  id: string;
  shopCode: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerUpiId: string;
  currentPin: string;
  pinExpiresAt: string;
  unsettledBalancePaise: number;
  isActive: boolean;
}

// 24 hours expiry from server init
const defaultPinExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export const PILOT_SHOPS: PilotShopData[] = [
  {
    id: "shop-001-uuid",
    shopCode: "SHP_001",
    name: "Sharma Chai Tapri & Snacks",
    ownerName: "Ramesh Sharma",
    ownerPhone: "+919876543201",
    ownerUpiId: "sharmachai@upi",
    currentPin: "1234",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-002-uuid",
    shopCode: "SHP_002",
    name: "Nandi Corner Tea & Filter Coffee",
    ownerName: "Venkatesh Gowda",
    ownerPhone: "+919876543202",
    ownerUpiId: "nandichai@okaxis",
    currentPin: "2468",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-003-uuid",
    shopCode: "SHP_003",
    name: "Maa Saraswati Book Depot & Stationery",
    ownerName: "Pradeep Kumar Gupta",
    ownerPhone: "+919876543203",
    ownerUpiId: "saraswatibooks@paytm",
    currentPin: "1357",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-004-uuid",
    shopCode: "SHP_004",
    name: "Gupta Ji Ki Mashhoor Special Chai",
    ownerName: "Anil Gupta",
    ownerPhone: "+919876543204",
    ownerUpiId: "guptaji@ybl",
    currentPin: "4321",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-005-uuid",
    shopCode: "SHP_005",
    name: "Kaveri Student Book House & Xerox",
    ownerName: "Suresh Shenoy",
    ownerPhone: "+919876543205",
    ownerUpiId: "kaveribooks@upi",
    currentPin: "9876",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-006-uuid",
    shopCode: "SHP_006",
    name: "Al-Madina Chai Point & Bakery",
    ownerName: "Farhan Qureshi",
    ownerPhone: "+919876543206",
    ownerUpiId: "farhanchai@okhdfcbank",
    currentPin: "5555",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-007-uuid",
    shopCode: "SHP_007",
    name: "Vidyarthi Pustak Bhandar",
    ownerName: "Kavitha Murthy",
    ownerPhone: "+919876543207",
    ownerUpiId: "vidyarthibooks@icici",
    currentPin: "7777",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-008-uuid",
    shopCode: "SHP_008",
    name: "Sardarji Amrit Tulya Chaha",
    ownerName: "Gurpreet Singh",
    ownerPhone: "+919876543208",
    ownerUpiId: "amrittulya@sbi",
    currentPin: "8888",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-009-uuid",
    shopCode: "SHP_009",
    name: "Pooja Newspaper & Magazine Corner",
    ownerName: "Pooja Verma",
    ownerPhone: "+919876543209",
    ownerUpiId: "poojanews@upi",
    currentPin: "1122",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
  {
    id: "shop-010-uuid",
    shopCode: "SHP_010",
    name: "Annapurna Tea & Refreshment Centre",
    ownerName: "Mahesh Joshi",
    ownerPhone: "+919876543210",
    ownerUpiId: "annapurnachai@upi",
    currentPin: "3344",
    pinExpiresAt: defaultPinExpiresAt,
    unsettledBalancePaise: 0,
    isActive: true,
  },
];

export function getPilotShopFallback(shopCode: string): PilotShopData | null {
  const normalized = shopCode.trim().toUpperCase();
  const found = PILOT_SHOPS.find((s) => s.shopCode === normalized);
  return found || null;
}
