import credits from "./showcase-credits.json";

/**
 * The 10 SAMPLE listings used by the demo seed and by the administration's "sample cars"
 * button. Every plate starts with the reserved prefix `EX-` (owners cannot register it), so
 * sample cars are recognised everywhere without a database column: they are badged
 * "Example", cannot be booked and can be removed in one action. Photos are free-licence
 * pictures of each model from Wikimedia Commons, served from /public/showcase and credited
 * in each description.
 */
export const SAMPLE_PLATE_PREFIX = "EX-";

export function isSamplePlate(registrationNumber: string | null | undefined): boolean {
  return Boolean(registrationNumber?.toUpperCase().startsWith(SAMPLE_PLATE_PREFIX));
}

export interface ShowcaseVehicle {
  plate: string;
  /** Neighbourhood shown next to the city for owner vehicles (agency vehicles show the branch). */
  area?: string;
  photo: string;
  make: string;
  model: string;
  year: number;
  city: string;
  category: "ECONOMY" | "COMPACT" | "SEDAN" | "SUV" | "PICKUP" | "MINIBUS" | "LUXURY";
  bodyType: "HATCHBACK" | "SEDAN" | "SUV" | "PICKUP" | "MINIBUS";
  transmission: "MANUAL" | "AUTOMATIC";
  fuelType: "PETROL" | "DIESEL" | "HYBRID";
  seats: number;
  doors: number;
  colour: string;
  daily: number;
  weekly: number;
  monthly: number;
  deposit: number;
  /** Owner account e-mail in the demo seed (none when added from the administration). */
  owner: string | null;
  ownership: "RIDEKMER_OWNED" | "FULLY_MANAGED_OWNER_VEHICLE" | "SELF_MANAGED_MARKETPLACE_VEHICLE";
  chauffeurFee?: number;
  selfDrive?: boolean;
  delivery?: boolean;
  instant: boolean;
  fr: string;
  en: string;
}

export const SHOWCASE_VEHICLES: ShowcaseVehicle[] = [
  {
    plate: "EX-101-DLA",
    photo: "toyota-corolla.jpg",
    make: "Toyota",
    model: "Corolla",
    year: 2022,
    city: "douala",
    category: "SEDAN",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    doors: 5,
    colour: "Blanc",
    daily: 30000,
    weekly: 190000,
    monthly: 700000,
    deposit: 150000,
    owner: null,
    ownership: "RIDEKMER_OWNED",
    instant: true,
    fr: "Berline hybride sobre et climatisée, parfaite pour les déplacements en ville et les rendez-vous d'affaires à Douala.",
    en: "Fuel-efficient air-conditioned hybrid, ideal for city driving and business meetings in Douala.",
  },
  {
    plate: "EX-102-YDE",
    area: "Bastos",
    photo: "toyota-land-cruiser-prado.jpg",
    make: "Toyota",
    model: "Land Cruiser Prado",
    year: 2023,
    city: "yaounde",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 7,
    doors: 5,
    colour: "Blanc nacré",
    daily: 85000,
    weekly: 550000,
    monthly: 2000000,
    deposit: 400000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 20000,
    instant: true,
    fr: "4x4 7 places, robuste et confortable pour les missions, les mariages et les routes de l'intérieur. Chauffeur disponible.",
    en: "Rugged, comfortable 7-seat 4x4 for assignments, weddings and upcountry roads. Chauffeur available.",
  },
  {
    plate: "EX-103-DLA",
    area: "Bonapriso",
    photo: "hyundai-tucson.jpg",
    make: "Hyundai",
    model: "Tucson",
    year: 2022,
    city: "douala",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris",
    daily: 50000,
    weekly: 320000,
    monthly: 1150000,
    deposit: 250000,
    owner: "showcase.owner.aicha@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    delivery: true,
    instant: false,
    fr: "SUV récent et spacieux, caméra de recul et Bluetooth. Livraison possible à Bonapriso, Akwa et Bonamoussadi.",
    en: "Recent, roomy SUV with reversing camera and Bluetooth. Delivery available in Bonapriso, Akwa and Bonamoussadi.",
  },
  {
    plate: "EX-104-BFS",
    area: "Tamdja",
    photo: "toyota-hilux.jpg",
    make: "Toyota",
    model: "Hilux",
    year: 2021,
    city: "bafoussam",
    category: "PICKUP",
    bodyType: "PICKUP",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 5,
    doors: 4,
    colour: "Blanc",
    daily: 55000,
    weekly: 350000,
    monthly: 1250000,
    deposit: 300000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    instant: true,
    fr: "Pick-up double cabine 4x4, idéal pour les chantiers, l'agriculture et les pistes de l'Ouest.",
    en: "Double-cab 4x4 pickup, ideal for building sites, farming and the tracks of the West region.",
  },
  {
    plate: "EX-105-DLA",
    area: "Akwa",
    photo: "suzuki-swift.jpg",
    make: "Suzuki",
    model: "Swift",
    year: 2023,
    city: "douala",
    category: "ECONOMY",
    bodyType: "HATCHBACK",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris clair",
    daily: 20000,
    weekly: 125000,
    monthly: 450000,
    deposit: 100000,
    owner: "showcase.owner.aicha@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    instant: true,
    fr: "Citadine économique et facile à garer, la solution la moins chère pour circuler en ville.",
    en: "Economical city car that is easy to park: the cheapest way to get around town.",
  },
  {
    plate: "EX-106-YDE",
    area: "Golf",
    photo: "mercedes-benz-e-class.jpg",
    make: "Mercedes-Benz",
    model: "E-Class",
    year: 2024,
    city: "yaounde",
    category: "LUXURY",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 4,
    colour: "Blanc",
    daily: 120000,
    weekly: 780000,
    monthly: 2800000,
    deposit: 600000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 25000,
    selfDrive: false,
    instant: false,
    fr: "Berline de prestige avec chauffeur professionnel pour délégations, cérémonies et accueil VIP.",
    en: "Executive sedan with a professional chauffeur for delegations, ceremonies and VIP pick-ups.",
  },
  {
    plate: "EX-107-KRI",
    area: "Centre-ville",
    photo: "toyota-rav4.jpg",
    make: "Toyota",
    model: "RAV4",
    year: 2022,
    city: "kribi",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris",
    daily: 45000,
    weekly: 290000,
    monthly: 1050000,
    deposit: 250000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    delivery: true,
    instant: true,
    fr: "SUV fiable pour un week-end à la plage ou une mission au port de Kribi. Livraison à l'hôtel possible.",
    en: "Reliable SUV for a beach weekend or a job at the port of Kribi. Hotel delivery available.",
  },
  {
    plate: "EX-108-DLA",
    area: "Bonamoussadi",
    photo: "toyota-hiace.jpg",
    make: "Toyota",
    model: "HiAce",
    year: 2020,
    city: "douala",
    category: "MINIBUS",
    bodyType: "MINIBUS",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 14,
    doors: 4,
    colour: "Gris argent",
    daily: 70000,
    weekly: 450000,
    monthly: 1600000,
    deposit: 300000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 20000,
    selfDrive: false,
    instant: true,
    fr: "Minibus 14 places avec chauffeur pour les transferts aéroport, les sorties d'équipe et les événements.",
    en: "14-seat minibus with chauffeur for airport transfers, team outings and events.",
  },
  {
    plate: "EX-109-LMB",
    area: "Down Beach",
    photo: "nissan-x-trail.jpg",
    make: "Nissan",
    model: "X-Trail",
    year: 2021,
    city: "limbe",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 7,
    doors: 5,
    colour: "Cuivre",
    daily: 45000,
    weekly: 290000,
    monthly: 1050000,
    deposit: 250000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    instant: false,
    fr: "SUV 7 places pour découvrir Limbé, Buea et le mont Cameroun en famille.",
    en: "7-seat SUV to explore Limbe, Buea and Mount Cameroon with the family.",
  },
  {
    plate: "EX-110-YDE",
    photo: "hyundai-accent.jpg",
    make: "Hyundai",
    model: "Accent",
    year: 2021,
    city: "yaounde",
    category: "COMPACT",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 4,
    colour: "Bleu gris",
    daily: 25000,
    weekly: 160000,
    monthly: 580000,
    deposit: 120000,
    owner: null,
    ownership: "RIDEKMER_OWNED",
    instant: true,
    fr: "Berline compacte automatique, économique et confortable pour circuler à Yaoundé.",
    en: "Compact automatic sedan, economical and comfortable for getting around Yaoundé.",
  },
];

export const SAMPLE_CITY_SLUGS = ["douala", "yaounde", "kribi", "limbe", "bafoussam"] as const;

/** Public URL of a sample car's photo, or null for any other vehicle. */
export function samplePhotoUrl(registrationNumber: string | null | undefined): string | null {
  if (!isSamplePlate(registrationNumber)) return null;
  const v = SHOWCASE_VEHICLES.find((x) => x.plate === registrationNumber);
  return v ? `/showcase/${v.photo}` : null;
}

export function sampleDescriptions(v: ShowcaseVehicle): { fr: string; en: string } {
  const c = (credits as Array<{ file: string; author: string | null; license: string }>).find(
    (x) => x.file === v.photo,
  );
  const who = c?.author ? `${c.author}, ` : "";
  return {
    fr: c ? `${v.fr} Photo du modèle : ${who}${c.license}, via Wikimedia Commons.` : v.fr,
    en: c ? `${v.en} Model photo: ${who}${c.license}, via Wikimedia Commons.` : v.en,
  };
}

/** Database fields of a sample vehicle; shared by the demo seed and the administration. */
export function sampleVehicleData(
  v: ShowcaseVehicle,
  place: {
    cityId: string;
    latitude: number | null;
    longitude: number | null;
    branchId: string | null;
    /** False when the sample's own city does not exist and another city is used instead. */
    ownCity: boolean;
    ownerProfileId: string | null;
  },
  now: Date,
) {
  const { fr, en } = sampleDescriptions(v);
  const agency = place.ownerProfileId === null;
  return {
    registrationNumber: v.plate,
    make: v.make,
    model: v.model,
    manufacturingYear: v.year,
    category: v.category,
    bodyType: v.bodyType,
    transmission: v.transmission,
    fuelType: v.fuelType,
    seats: v.seats,
    doors: v.doors,
    colour: v.colour,
    currentMileageKm: 20000 + (v.year % 7) * 9000,
    dailyPriceXaf: v.daily,
    weeklyPriceXaf: v.weekly,
    monthlyPriceXaf: v.monthly,
    securityDepositXaf: v.deposit,
    dailyKmAllowance: 250,
    extraKmRateXaf: 150,
    ownershipModel: agency ? ("RIDEKMER_OWNED" as const) : v.ownership,
    ownerProfileId: place.ownerProfileId,
    cityId: place.cityId,
    branchId: agency ? place.branchId : null,
    locationLabel: !agency && place.ownCity ? (v.area ?? null) : null,
    latitude: place.latitude,
    longitude: place.longitude,
    status: "ACTIVE" as const,
    documentsValid: true,
    publishedAt: now,
    hasAirConditioning: true,
    hasBluetooth: true,
    hasUsbCharging: true,
    hasReversingCamera: v.daily >= 45000,
    safetyEquipment: [
      "spare_wheel",
      "jack",
      "warning_triangle",
      "fire_extinguisher",
      "first_aid_kit",
    ],
    chauffeurAvailable: Boolean(v.chauffeurFee),
    chauffeurDailyFeeXaf: v.chauffeurFee ?? null,
    selfDriveAllowed: v.selfDrive ?? true,
    deliveryAvailable: Boolean(v.delivery),
    deliveryRadiusKm: v.delivery ? 15 : null,
    instantBooking: v.instant,
    descriptionFr: fr,
    descriptionEn: en,
    existingDamageNotes: null,
  };
}
