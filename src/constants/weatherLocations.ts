export interface WeatherLocationItem {
  name: string;
  bnName?: string;
  divisionOrCountry: string;
  country: string;
  lat: number;
  lon: number;
}

export interface DivisionGroup {
  division: string;
  bnDivision: string;
  districts: WeatherLocationItem[];
}

export interface CountryGroup {
  country: string;
  cities: WeatherLocationItem[];
}

export const BANGLADESH_DIVISIONS: DivisionGroup[] = [
  {
    division: 'Dhaka Division',
    bnDivision: 'ঢাকা বিভাগ',
    districts: [
      { name: 'Dhaka', bnName: 'ঢাকা', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lon: 90.4125 },
      { name: 'Faridpur', bnName: 'ফরিদপুর', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.6071, lon: 89.8426 },
      { name: 'Gazipur', bnName: 'গাজীপুর', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.9999, lon: 90.4203 },
      { name: 'Gopalganj', bnName: 'গোপালগঞ্জ', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.0051, lon: 89.8266 },
      { name: 'Kishoreganj', bnName: 'কিশোরগঞ্জ', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 24.4449, lon: 90.7766 },
      { name: 'Madaripur', bnName: 'মাদারীপুর', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.1641, lon: 90.1897 },
      { name: 'Manikganj', bnName: 'মানিকগঞ্জ', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.8644, lon: 90.0047 },
      { name: 'Munshiganj', bnName: 'মুন্সীগঞ্জ', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.5422, lon: 90.5305 },
      { name: 'Narayanganj', bnName: 'নারায়ণগঞ্জ', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.6238, lon: 90.5000 },
      { name: 'Narsingdi', bnName: 'নরসিংদী', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.9322, lon: 90.7154 },
      { name: 'Rajbari', bnName: 'রাজবাড়ী', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.7574, lon: 89.6445 },
      { name: 'Shariatpur', bnName: 'শরীয়তপুর', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 23.2423, lon: 90.4348 },
      { name: 'Tangail', bnName: 'টাঙ্গাইল', divisionOrCountry: 'Dhaka', country: 'Bangladesh', lat: 24.2513, lon: 89.9167 }
    ]
  },
  {
    division: 'Chattogram Division',
    bnDivision: 'চট্টগ্রাম বিভাগ',
    districts: [
      { name: 'Bandarban', bnName: 'বান্দরবান', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 22.1953, lon: 92.2184 },
      { name: 'Brahmanbaria', bnName: 'ব্রাহ্মণবাড়িয়া', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 23.9571, lon: 91.1119 },
      { name: 'Chandpur', bnName: 'চাঁদপুর', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 23.2321, lon: 90.6631 },
      { name: 'Chattogram', bnName: 'চট্টগ্রাম', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 22.3569, lon: 91.7832 },
      { name: 'Cumilla', bnName: 'কুমিল্লা', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 23.4682, lon: 91.1788 },
      { name: "Cox's Bazar", bnName: 'কক্সবাজার', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 21.4272, lon: 92.0058 },
      { name: 'Feni', bnName: 'ফেনী', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 23.0186, lon: 91.3966 },
      { name: 'Khagrachhari', bnName: 'খাগড়াছড়ি', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 23.1193, lon: 91.9847 },
      { name: 'Lakshmipur', bnName: 'লক্ষ্মীপুর', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 22.9425, lon: 90.8412 },
      { name: 'Noakhali', bnName: 'নোয়াখালী', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 22.8696, lon: 91.0994 },
      { name: 'Rangamati', bnName: 'রাঙ্গামাটি', divisionOrCountry: 'Chattogram', country: 'Bangladesh', lat: 22.6574, lon: 92.1753 }
    ]
  },
  {
    division: 'Rajshahi Division',
    bnDivision: 'রাজশাহী বিভাগ',
    districts: [
      { name: 'Bogura', bnName: 'বগুড়া', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.8465, lon: 89.3777 },
      { name: 'Joypurhat', bnName: 'জয়পুরহাট', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 25.1014, lon: 89.0275 },
      { name: 'Naogaon', bnName: 'নওগাঁ', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.7936, lon: 88.9318 },
      { name: 'Natore', bnName: 'নাটোর', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.4206, lon: 89.0003 },
      { name: 'Chapainawabganj', bnName: 'চাঁপাইনবাবগঞ্জ', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.5965, lon: 88.2775 },
      { name: 'Pabna', bnName: 'পাবনা', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.0064, lon: 89.2372 },
      { name: 'Rajshahi', bnName: 'রাজশাহী', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.3745, lon: 88.6042 },
      { name: 'Sirajganj', bnName: 'সিরাজগঞ্জ', divisionOrCountry: 'Rajshahi', country: 'Bangladesh', lat: 24.4534, lon: 89.7008 }
    ]
  },
  {
    division: 'Khulna Division',
    bnDivision: 'খুলনা বিভাগ',
    districts: [
      { name: 'Bagerhat', bnName: 'বাগেরহাট', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 22.6516, lon: 89.7859 },
      { name: 'Chuadanga', bnName: 'চুয়াডাঙ্গা', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.6402, lon: 88.8418 },
      { name: 'Jashore', bnName: 'যশোর', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.1664, lon: 89.2081 },
      { name: 'Jhenaidah', bnName: 'ঝিনাইদহ', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.5448, lon: 89.1539 },
      { name: 'Khulna', bnName: 'খুলনা', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 22.8456, lon: 89.5403 },
      { name: 'Kushtia', bnName: 'কুষ্টিয়া', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.9013, lon: 89.1204 },
      { name: 'Magura', bnName: 'মাগুরা', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.4873, lon: 89.4199 },
      { name: 'Meherpur', bnName: 'মেহেরপুর', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.7622, lon: 88.6318 },
      { name: 'Narail', bnName: 'নড়াইল', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 23.1725, lon: 89.5127 },
      { name: 'Satkhira', bnName: 'সাতক্ষীরা', divisionOrCountry: 'Khulna', country: 'Bangladesh', lat: 22.7185, lon: 89.0705 }
    ]
  },
  {
    division: 'Barishal Division',
    bnDivision: 'বরিশাল বিভাগ',
    districts: [
      { name: 'Barguna', bnName: 'বরগুনা', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.0953, lon: 90.1121 },
      { name: 'Barishal', bnName: 'বরিশাল', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.7010, lon: 90.3535 },
      { name: 'Bhola', bnName: 'ভোলা', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.6859, lon: 90.6481 },
      { name: 'Jhalokati', bnName: 'ঝালকাঠি', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.6406, lon: 90.1987 },
      { name: 'Patuakhali', bnName: 'পটুয়াখালী', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.3596, lon: 90.3299 },
      { name: 'Pirojpur', bnName: 'পিরোজপুর', divisionOrCountry: 'Barishal', country: 'Bangladesh', lat: 22.5841, lon: 89.9720 }
    ]
  },
  {
    division: 'Sylhet Division',
    bnDivision: 'সিলেট বিভাগ',
    districts: [
      { name: 'Habiganj', bnName: 'হবিগঞ্জ', divisionOrCountry: 'Sylhet', country: 'Bangladesh', lat: 24.3749, lon: 91.4155 },
      { name: 'Moulvibazar', bnName: 'মৌলভীবাজার', divisionOrCountry: 'Sylhet', country: 'Bangladesh', lat: 24.4829, lon: 91.7774 },
      { name: 'Sunamganj', bnName: 'সুনামগঞ্জ', divisionOrCountry: 'Sylhet', country: 'Bangladesh', lat: 25.0658, lon: 91.3950 },
      { name: 'Sylhet', bnName: 'সিলেট', divisionOrCountry: 'Sylhet', country: 'Bangladesh', lat: 24.8949, lon: 91.8687 }
    ]
  },
  {
    division: 'Rangpur Division',
    bnDivision: 'রংপুর বিভাগ',
    districts: [
      { name: 'Dinajpur', bnName: 'দিনাজপুর', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.6217, lon: 88.6355 },
      { name: 'Gaibandha', bnName: 'গাইবান্ধা', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.3288, lon: 89.5408 },
      { name: 'Kurigram', bnName: 'কুড়িগ্রাম', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.8054, lon: 89.6362 },
      { name: 'Lalmonirhat', bnName: 'লালমনিরহাট', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.9923, lon: 89.2847 },
      { name: 'Nilphamari', bnName: 'নীলফামারী', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.9318, lon: 88.8560 },
      { name: 'Panchagarh', bnName: 'পঞ্চগড়', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 26.3411, lon: 88.5542 },
      { name: 'Rangpur', bnName: 'রংপুর', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 25.7439, lon: 89.2752 },
      { name: 'Thakurgaon', bnName: 'ঠাকুরগাঁও', divisionOrCountry: 'Rangpur', country: 'Bangladesh', lat: 26.0337, lon: 88.4617 }
    ]
  },
  {
    division: 'Mymensingh Division',
    bnDivision: 'ময়মনসিংহ বিভাগ',
    districts: [
      { name: 'Jamalpur', bnName: 'জামালপুর', divisionOrCountry: 'Mymensingh', country: 'Bangladesh', lat: 24.9375, lon: 89.9378 },
      { name: 'Mymensingh', bnName: 'ময়মনসিংহ', divisionOrCountry: 'Mymensingh', country: 'Bangladesh', lat: 24.7471, lon: 90.4203 },
      { name: 'Netrokona', bnName: 'নেত্রকোণা', divisionOrCountry: 'Mymensingh', country: 'Bangladesh', lat: 24.8709, lon: 90.7279 },
      { name: 'Sherpur', bnName: 'শেরপুর', divisionOrCountry: 'Mymensingh', country: 'Bangladesh', lat: 25.0205, lon: 90.0153 }
    ]
  }
];

export const INTERNATIONAL_CITIES: CountryGroup[] = [
  {
    country: 'India',
    cities: [
      { name: 'Delhi', divisionOrCountry: 'India', country: 'India', lat: 28.6139, lon: 77.2090 },
      { name: 'Mumbai', divisionOrCountry: 'India', country: 'India', lat: 19.0760, lon: 72.8777 },
      { name: 'Kolkata', divisionOrCountry: 'India', country: 'India', lat: 22.5726, lon: 88.3639 },
      { name: 'Chennai', divisionOrCountry: 'India', country: 'India', lat: 13.0827, lon: 80.2707 },
      { name: 'Bengaluru', divisionOrCountry: 'India', country: 'India', lat: 12.9716, lon: 77.5946 },
      { name: 'Hyderabad', divisionOrCountry: 'India', country: 'India', lat: 17.3850, lon: 78.4867 },
      { name: 'Pune', divisionOrCountry: 'India', country: 'India', lat: 18.5204, lon: 73.8567 },
      { name: 'Lucknow', divisionOrCountry: 'India', country: 'India', lat: 26.8467, lon: 80.9462 }
    ]
  },
  {
    country: 'Nepal',
    cities: [
      { name: 'Kathmandu', divisionOrCountry: 'Nepal', country: 'Nepal', lat: 27.7172, lon: 85.3240 },
      { name: 'Pokhara', divisionOrCountry: 'Nepal', country: 'Nepal', lat: 28.2096, lon: 83.9856 },
      { name: 'Lalitpur', divisionOrCountry: 'Nepal', country: 'Nepal', lat: 27.6644, lon: 85.3188 }
    ]
  },
  {
    country: 'Pakistan',
    cities: [
      { name: 'Karachi', divisionOrCountry: 'Pakistan', country: 'Pakistan', lat: 24.8607, lon: 67.0011 },
      { name: 'Lahore', divisionOrCountry: 'Pakistan', country: 'Pakistan', lat: 31.5204, lon: 74.3587 },
      { name: 'Islamabad', divisionOrCountry: 'Pakistan', country: 'Pakistan', lat: 33.6844, lon: 73.0479 },
      { name: 'Peshawar', divisionOrCountry: 'Pakistan', country: 'Pakistan', lat: 34.0151, lon: 71.5249 }
    ]
  },
  {
    country: 'United Arab Emirates',
    cities: [
      { name: 'Dubai', divisionOrCountry: 'UAE', country: 'UAE', lat: 25.2048, lon: 55.2708 },
      { name: 'Abu Dhabi', divisionOrCountry: 'UAE', country: 'UAE', lat: 24.4539, lon: 54.3773 },
      { name: 'Sharjah', divisionOrCountry: 'UAE', country: 'UAE', lat: 25.3463, lon: 55.4209 }
    ]
  },
  {
    country: 'United Kingdom',
    cities: [
      { name: 'London', divisionOrCountry: 'UK', country: 'UK', lat: 51.5074, lon: -0.1278 },
      { name: 'Manchester', divisionOrCountry: 'UK', country: 'UK', lat: 53.4808, lon: -2.2426 },
      { name: 'Birmingham', divisionOrCountry: 'UK', country: 'UK', lat: 52.4862, lon: -1.8904 }
    ]
  },
  {
    country: 'United States',
    cities: [
      { name: 'New York', divisionOrCountry: 'USA', country: 'USA', lat: 40.7128, lon: -74.0060 },
      { name: 'Los Angeles', divisionOrCountry: 'USA', country: 'USA', lat: 34.0522, lon: -118.2437 },
      { name: 'Chicago', divisionOrCountry: 'USA', country: 'USA', lat: 41.8781, lon: -87.6298 },
      { name: 'Houston', divisionOrCountry: 'USA', country: 'USA', lat: 29.7604, lon: -95.3698 },
      { name: 'San Francisco', divisionOrCountry: 'USA', country: 'USA', lat: 37.7749, lon: -122.4194 }
    ]
  }
];

// Flat list of all predefined locations for rapid search
export const ALL_PREDEFINED_LOCATIONS: WeatherLocationItem[] = [
  ...BANGLADESH_DIVISIONS.flatMap(d => d.districts),
  ...INTERNATIONAL_CITIES.flatMap(c => c.cities)
];

// Worldwide City search via Open-Meteo free Geocoding API
export async function searchWorldwideCities(query: string): Promise<WeatherLocationItem[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=10&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.map((r: any) => ({
      name: r.name,
      divisionOrCountry: r.admin1 || r.country || '',
      country: r.country || '',
      lat: r.latitude,
      lon: r.longitude
    }));
  } catch (err) {
    console.warn('Geocoding search failed:', err);
    return [];
  }
}
