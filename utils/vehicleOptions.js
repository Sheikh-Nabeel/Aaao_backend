// Shared vehicle options, enums, and select flow configuration

export const VALID_SERVICE_TYPES = {
  "car cab": ["economy", "premium", "xl", "family", "luxury"],
  bike: ["economy", "premium", "vip"],
  "car recovery": [
    "flatbed towing",
    "wheel lift towing",
    "on-road winching",
    "off-road winching",
    "battery jump start",
    "fuel delivery",
    "luxury & exotic car recovery",
    "accident & collision recovery",
    "heavy-duty vehicle recovery",
    "basement pull-out",
  ],
  "shifting & movers": [
    "mini pickup",
    "suzuki carry",
    "small van",
    "medium truck",
    "mazda",
    "covered van",
    "large truck",
    "6-wheeler",
    "container truck",
  ],
};

export const SERVICE_CATEGORY_MAP = {
  "car recovery": {
    "towing services": ["flatbed towing", "wheel lift towing"],
    "winching services": ["on-road winching", "off-road winching"],
    "roadside assistance": ["battery jump start", "fuel delivery"],
    "specialized/heavy recovery": [
      "luxury & exotic car recovery",
      "accident & collision recovery",
      "heavy-duty vehicle recovery",
      "basement pull-out",
    ],
  },
  "shifting & movers": {
    "small mover": ["mini pickup", "suzuki carry", "small van"],
    "medium mover": ["medium truck", "mazda", "covered van"],
    "heavy mover": ["large truck", "6-wheeler", "container truck"],
  },
};

export const SELECT_FLOW = [
  {
    key: "car recovery",
    label: "Car Recovery",
    categories: [
      {
        key: "towing services",
        label: "Towing Services",
        imageHint: "Tow truck carrying a sedan on flatbed",
        subServices: [
          { key: "flatbed towing", label: "Flatbed Towing", info: "Safest option for all vehicles, including luxury/exotic cars & low clearance models." },
          { key: "wheel lift towing", label: "Wheel Lift Towing", info: "Quick & efficient method lifting front or rear wheels, suitable for short-distance towing." },
        ],
      },
      {
        key: "winching services",
        label: "Winching Services",
        imageHint: "4x4 recovery vehicle pulling SUV from roadside mud",
        subServices: [
          { key: "on-road winching", label: "On-Road Winching", info: "For vehicles stuck roadside due to ditch, breakdown, or minor accident." },
          { key: "off-road winching", label: "Off-Road Winching", info: "Recovery for vehicles stuck in sand, mud, or rough terrain." },
        ],
      },
      {
        key: "roadside assistance",
        label: "Roadside Assistance",
        imageHint: "Technician helping with car battery on roadside",
        subServices: [
          { key: "battery jump start", label: "Battery Jump Start", info: "Portable jump-start service when battery is dead." },
          { key: "fuel delivery", label: "Fuel Delivery", info: "Fuel delivered directly to stranded vehicles (petrol/diesel)." },
        ],
      },
      {
        key: "specialized/heavy recovery",
        label: "Specialized/Heavy Recovery",
        imageHint: "Heavy-duty 6-wheeler tow truck pulling a large truck",
        subServices: [
          { key: "luxury & exotic car recovery", label: "Luxury & Exotic Car Recovery", info: "Secure handling of high-end vehicles." },
          { key: "accident & collision recovery", label: "Accident & Collision Recovery", info: "Safe recovery after accidents." },
          { key: "heavy-duty vehicle recovery", label: "Heavy-Duty Vehicle Recovery", info: "Tow buses, trucks, and trailers." },
          { key: "basement pull-out", label: "Basement Pull-Out", info: "Specialized service for underground/basement parking." },
        ],
      },
    ],
    helpers: { packingHelper: false, loadingUnloadingHelper: false, fixingHelper: false },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "shifting & movers",
    label: "Shifting & Movers",
    categories: [
      {
        key: "small mover",
        label: "Small Mover",
        info: "Vehicle: Mini Pickup / Suzuki Carry / Small Van. Best for: Small apartments, single-room shifting, few items.",
        vehicles: ["mini pickup", "suzuki carry", "small van"],
      },
      {
        key: "medium mover",
        label: "Medium Mover",
        info: "Vehicle: Medium Truck / Mazda / Covered Van. Best for: 2–3 bedroom homes, medium office relocations.",
        vehicles: ["medium truck", "mazda", "covered van"],
      },
      {
        key: "heavy mover",
        label: "Heavy Mover",
        info: "Vehicle: Large Truck / 6-Wheeler / Container Truck. Best for: Full house shifting, big offices, industrial goods.",
        vehicles: ["large truck", "6-wheeler", "container truck"],
      },
    ],
    helpers: { packingHelper: true, loadingUnloadingHelper: true, fixingHelper: true },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "car cab",
    label: "Car Cab",
    subServices: [
      { key: "economy", label: "Economy", info: "Budget-friendly rides. Hatchbacks & small sedans. Ideal for daily use & short trips." },
      { key: "premium", label: "Premium", info: "Business-class comfort. Luxury sedans & executive cars. Perfect for corporate travel & events." },
      { key: "xl", label: "XL (Group Ride)", info: "SUVs & 7-seaters. Extra luggage space. Great for groups & airport transfers." },
      { key: "family", label: "Family", info: "Spacious & safe for families. Optional child seat. Focus on comfort & safety for kids." },
      { key: "luxury", label: "Luxury (VIP)", info: "Ultra-luxury cars like Hummer, GMC, Range Rover, Lexus, Mercedes, BMW. High-class comfort & prestige." },
    ],
    helpers: { packingHelper: false, loadingUnloadingHelper: false, fixingHelper: false },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "bike",
    label: "Bike",
    subServices: [
      { key: "economy", label: "Economy", info: "Budget-friendly motorbike rides." },
      { key: "premium", label: "Premium", info: "Comfortable bikes with experienced riders." },
      { key: "vip", label: "VIP", info: "Stylish, high-end bikes for an exclusive experience." },
    ],
    helpers: { packingHelper: false, loadingUnloadingHelper: false, fixingHelper: false },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
];

