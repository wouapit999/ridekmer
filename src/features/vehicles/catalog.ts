import type { BODY_TYPES, VEHICLE_CATEGORIES } from "./schemas";

/**
 * Makes and models offered as lists in the owner's vehicle form, focused on what is driven
 * and rented in Cameroon. Picking a model pre-fills the category, body type and seats; the
 * owner can still change them, and "Other" keeps free text for anything missing here.
 * `wiki` is the English Wikipedia article used to find a freely licensed reference photo
 * when the title differs from "<make> <model>".
 */
export interface CatalogModel {
  name: string;
  category: (typeof VEHICLE_CATEGORIES)[number];
  bodyType: (typeof BODY_TYPES)[number];
  seats: number;
  wiki?: string;
}

export interface CatalogMake {
  name: string;
  models: CatalogModel[];
}

const m = (
  name: string,
  category: CatalogModel["category"],
  bodyType: CatalogModel["bodyType"],
  seats: number,
  wiki?: string,
): CatalogModel =>
  wiki ? { name, category, bodyType, seats, wiki } : { name, category, bodyType, seats };

export const VEHICLE_CATALOG: readonly CatalogMake[] = [
  {
    name: "Toyota",
    models: [
      m("Corolla", "SEDAN", "SEDAN", 5),
      m("Camry", "SEDAN", "SEDAN", 5),
      m("Yaris", "ECONOMY", "HATCHBACK", 5),
      m("Vitz", "ECONOMY", "HATCHBACK", 5, "Toyota Vitz"),
      m("Avensis", "SEDAN", "SEDAN", 5),
      m("RAV4", "SUV", "SUV", 5),
      m("Highlander", "SUV", "SUV", 7),
      m("Fortuner", "SUV", "SUV", 7),
      m("Land Cruiser Prado", "SUV", "SUV", 7),
      m("Land Cruiser", "LUXURY", "SUV", 7),
      m("Hilux", "PICKUP", "PICKUP", 5),
      m("HiAce", "MINIBUS", "MINIBUS", 14),
      m("Coaster", "MINIBUS", "MINIBUS", 30),
    ],
  },
  {
    name: "Hyundai",
    models: [
      m("i10", "ECONOMY", "HATCHBACK", 5, "Hyundai i10"),
      m("Accent", "COMPACT", "SEDAN", 5),
      m("Elantra", "SEDAN", "SEDAN", 5),
      m("Tucson", "SUV", "SUV", 5),
      m("Santa Fe", "SUV", "SUV", 7),
      m("Creta", "SUV", "SUV", 5),
      m("H-1", "VAN", "VAN", 9, "Hyundai Starex"),
    ],
  },
  {
    name: "Kia",
    models: [
      m("Picanto", "ECONOMY", "HATCHBACK", 5),
      m("Rio", "COMPACT", "HATCHBACK", 5),
      m("Cerato", "SEDAN", "SEDAN", 5, "Kia Forte"),
      m("Sportage", "SUV", "SUV", 5),
      m("Sorento", "SUV", "SUV", 7),
    ],
  },
  {
    name: "Nissan",
    models: [
      m("Sunny", "COMPACT", "SEDAN", 5, "Nissan Sunny"),
      m("Almera", "COMPACT", "SEDAN", 5),
      m("Qashqai", "SUV", "SUV", 5),
      m("X-Trail", "SUV", "SUV", 7),
      m("Patrol", "LUXURY", "SUV", 7),
      m("Navara", "PICKUP", "PICKUP", 5),
      m("Urvan", "MINIBUS", "MINIBUS", 15, "Nissan Caravan"),
    ],
  },
  {
    name: "Mitsubishi",
    models: [
      m("Lancer", "SEDAN", "SEDAN", 5),
      m("Outlander", "SUV", "SUV", 7),
      m("Pajero", "SUV", "SUV", 7),
      m("Pajero Sport", "SUV", "SUV", 7),
      m("L200", "PICKUP", "PICKUP", 5, "Mitsubishi Triton"),
    ],
  },
  {
    name: "Suzuki",
    models: [
      m("Alto", "ECONOMY", "HATCHBACK", 4),
      m("Swift", "ECONOMY", "HATCHBACK", 5),
      m("Dzire", "COMPACT", "SEDAN", 5, "Suzuki Dzire"),
      m("Vitara", "SUV", "SUV", 5),
      m("Jimny", "SUV", "SUV", 4),
    ],
  },
  {
    name: "Honda",
    models: [
      m("Civic", "SEDAN", "SEDAN", 5),
      m("Accord", "SEDAN", "SEDAN", 5),
      m("CR-V", "SUV", "SUV", 5),
      m("Fit", "ECONOMY", "HATCHBACK", 5, "Honda Fit"),
    ],
  },
  {
    name: "Mazda",
    models: [
      m("Mazda3", "SEDAN", "SEDAN", 5),
      m("Mazda6", "SEDAN", "SEDAN", 5),
      m("CX-5", "SUV", "SUV", 5, "Mazda CX-5"),
      m("BT-50", "PICKUP", "PICKUP", 5, "Mazda BT-50"),
    ],
  },
  {
    name: "Isuzu",
    models: [
      m("D-Max", "PICKUP", "PICKUP", 5, "Isuzu D-Max"),
      m("MU-X", "SUV", "SUV", 7, "Isuzu MU-X"),
    ],
  },
  {
    name: "Ford",
    models: [
      m("Fiesta", "ECONOMY", "HATCHBACK", 5),
      m("Focus", "COMPACT", "HATCHBACK", 5, "Ford Focus"),
      m("Ranger", "PICKUP", "PICKUP", 5, "Ford Ranger"),
      m("Everest", "SUV", "SUV", 7, "Ford Everest"),
      m("Explorer", "SUV", "SUV", 7, "Ford Explorer"),
    ],
  },
  {
    name: "Volkswagen",
    models: [
      m("Polo", "ECONOMY", "HATCHBACK", 5, "Volkswagen Polo"),
      m("Golf", "COMPACT", "HATCHBACK", 5, "Volkswagen Golf"),
      m("Passat", "SEDAN", "SEDAN", 5, "Volkswagen Passat"),
      m("Tiguan", "SUV", "SUV", 5),
      m("Touareg", "LUXURY", "SUV", 5),
      m("Amarok", "PICKUP", "PICKUP", 5),
    ],
  },
  {
    name: "Peugeot",
    models: [
      m("208", "ECONOMY", "HATCHBACK", 5, "Peugeot 208"),
      m("301", "COMPACT", "SEDAN", 5, "Peugeot 301"),
      m("308", "COMPACT", "HATCHBACK", 5, "Peugeot 308"),
      m("508", "SEDAN", "SEDAN", 5, "Peugeot 508"),
      m("2008", "SUV", "SUV", 5, "Peugeot 2008"),
      m("3008", "SUV", "SUV", 5, "Peugeot 3008"),
      m("5008", "SUV", "SUV", 7, "Peugeot 5008"),
      m("Partner", "UTILITY", "VAN", 2, "Peugeot Partner"),
      m("Boxer", "UTILITY", "VAN", 3, "Fiat Ducato"),
    ],
  },
  {
    name: "Renault",
    models: [
      m("Clio", "ECONOMY", "HATCHBACK", 5, "Renault Clio"),
      m("Logan", "COMPACT", "SEDAN", 5, "Dacia Logan"),
      m("Duster", "SUV", "SUV", 5, "Dacia Duster"),
      m("Koleos", "SUV", "SUV", 5, "Renault Koleos"),
      m("Kangoo", "UTILITY", "VAN", 5, "Renault Kangoo"),
      m("Master", "UTILITY", "VAN", 3, "Renault Master"),
    ],
  },
  {
    name: "Mercedes-Benz",
    models: [
      m("C-Class", "LUXURY", "SEDAN", 5, "Mercedes-Benz C-Class"),
      m("E-Class", "LUXURY", "SEDAN", 5, "Mercedes-Benz E-Class"),
      m("S-Class", "LUXURY", "SEDAN", 5, "Mercedes-Benz S-Class"),
      m("GLE", "LUXURY", "SUV", 5, "Mercedes-Benz GLE"),
      m("G-Class", "LUXURY", "SUV", 5, "Mercedes-Benz G-Class"),
      m("Sprinter", "MINIBUS", "MINIBUS", 16, "Mercedes-Benz Sprinter"),
    ],
  },
  {
    name: "BMW",
    models: [
      m("3 Series", "LUXURY", "SEDAN", 5, "BMW 3 Series"),
      m("5 Series", "LUXURY", "SEDAN", 5, "BMW 5 Series"),
      m("X3", "LUXURY", "SUV", 5, "BMW X3"),
      m("X5", "LUXURY", "SUV", 5, "BMW X5"),
    ],
  },
  {
    name: "Lexus",
    models: [
      m("RX", "LUXURY", "SUV", 5, "Lexus RX"),
      m("LX", "LUXURY", "SUV", 7, "Lexus LX"),
      m("ES", "LUXURY", "SEDAN", 5, "Lexus ES"),
    ],
  },
  {
    name: "Land Rover",
    models: [
      m("Defender", "LUXURY", "SUV", 5, "Land Rover Defender"),
      m("Discovery", "LUXURY", "SUV", 7, "Land Rover Discovery"),
      m("Range Rover", "LUXURY", "SUV", 5, "Range Rover"),
      m("Range Rover Sport", "LUXURY", "SUV", 5, "Range Rover Sport"),
    ],
  },
  {
    name: "Jeep",
    models: [
      m("Wrangler", "SUV", "SUV", 5, "Jeep Wrangler"),
      m("Grand Cherokee", "SUV", "SUV", 5, "Jeep Grand Cherokee"),
    ],
  },
  {
    name: "Chevrolet",
    models: [
      m("Spark", "ECONOMY", "HATCHBACK", 5, "Chevrolet Spark"),
      m("Cruze", "SEDAN", "SEDAN", 5, "Chevrolet Cruze"),
      m("Captiva", "SUV", "SUV", 7, "Chevrolet Captiva"),
    ],
  },
  {
    name: "Audi",
    models: [
      m("A4", "LUXURY", "SEDAN", 5, "Audi A4"),
      m("A6", "LUXURY", "SEDAN", 5, "Audi A6"),
      m("Q5", "LUXURY", "SUV", 5, "Audi Q5"),
      m("Q7", "LUXURY", "SUV", 7, "Audi Q7"),
    ],
  },
];

export const OTHER_OPTION = "__other__";

function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}

export function findCatalogMake(make: string): CatalogMake | undefined {
  const key = normalise(make);
  return VEHICLE_CATALOG.find((x) => normalise(x.name) === key);
}

export function findCatalogModel(make: string, model: string): CatalogModel | undefined {
  const key = normalise(model);
  return findCatalogMake(make)?.models.find((x) => normalise(x.name) === key);
}

/** Search phrase for the reference photo: the curated article title, else "<make> <model>". */
export function referenceQuery(make: string, model: string): string {
  const known = findCatalogModel(make, model);
  if (known?.wiki) return known.wiki;
  const canonicalMake = findCatalogMake(make)?.name ?? make.trim();
  return `${canonicalMake} ${known?.name ?? model.trim()}`;
}
