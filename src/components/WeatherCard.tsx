import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sun, 
  CloudSun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  CloudSnow, 
  Droplets, 
  Wind, 
  MapPin, 
  RefreshCw, 
  ChevronRight,
  Search,
  X,
  Compass,
  Globe2,
  AlertCircle,
  Building2,
  Check
} from 'lucide-react';
import { 
  BANGLADESH_DIVISIONS, 
  INTERNATIONAL_CITIES, 
  ALL_PREDEFINED_LOCATIONS, 
  WeatherLocationItem,
  searchWorldwideCities 
} from '../constants/weatherLocations';

interface WeatherData {
  city: string;
  country: string;
  temperature: number;
  condition: string;
  code: number;
  feelsLike: number;
  high: number;
  low: number;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
  isGPS: boolean;
  updatedAt: Date;
  coordinates: { lat: number; lon: number };
}

const STORAGE_LAST_LOCATION_KEY = 'zuzu_last_weather_location_v2';

function getWeatherDescription(code: number): { text: string; icon: string } {
  switch (code) {
    case 0:
      return { text: 'Clear Sky', icon: 'sun' };
    case 1:
      return { text: 'Mainly Clear', icon: 'cloud-sun' };
    case 2:
      return { text: 'Partly Cloudy', icon: 'cloud-sun' };
    case 3:
      return { text: 'Overcast', icon: 'cloud' };
    case 45:
    case 48:
      return { text: 'Foggy Mist', icon: 'cloud' };
    case 51:
    case 53:
    case 55:
      return { text: 'Light Drizzle', icon: 'rain' };
    case 61:
    case 63:
    case 65:
      return { text: 'Rain Shower', icon: 'rain' };
    case 71:
    case 73:
    case 75:
      return { text: 'Snow Flurries', icon: 'snow' };
    case 80:
    case 81:
    case 82:
      return { text: 'Heavy Rain Showers', icon: 'rain' };
    case 95:
    case 96:
    case 99:
      return { text: 'Thunderstorm', icon: 'thunder' };
    default:
      return { text: 'Partly Cloudy', icon: 'cloud-sun' };
  }
}

export const WeatherCard: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState<boolean>(false);
  
  // Search and Location Selector State
  const [searchQuery, setSearchQuery] = useState('');
  const [worldwideResults, setWorldwideResults] = useState<WeatherLocationItem[]>([]);
  const [isSearchingWorldwide, setIsSearchingWorldwide] = useState(false);
  const [selectedDivisionTab, setSelectedDivisionTab] = useState<string>('Dhaka Division');
  const [locationViewTab, setLocationViewTab] = useState<'bd' | 'international' | 'search'>('bd');

  // Load saved location on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LAST_LOCATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lat && parsed.lon && parsed.name) {
          fetchWeatherForCoords(parsed.lat, parsed.lon, parsed.name, parsed.country || '', parsed.isGPS || false);
          return;
        }
      }
    } catch {}

    // Default to Dhaka
    fetchWeatherForCoords(23.8103, 90.4125, 'Dhaka', 'Bangladesh', false);
  }, []);

  // Live worldwide search debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setWorldwideResults([]);
      setIsSearchingWorldwide(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingWorldwide(true);
      const results = await searchWorldwideCities(searchQuery);
      setWorldwideResults(results);
      setIsSearchingWorldwide(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch real weather data from Open-Meteo
  const fetchWeatherForCoords = async (
    lat: number,
    lon: number,
    cityName: string,
    countryName: string = '',
    isGPS: boolean = false
  ) => {
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Open-Meteo service temporarily unavailable.');

      const data = await res.json();
      const current = data.current;
      const daily = data.daily;
      const desc = getWeatherDescription(current.weather_code);

      const newWeather: WeatherData = {
        city: cityName,
        country: countryName,
        temperature: Math.round(current.temperature_2m),
        condition: desc.text,
        code: current.weather_code,
        feelsLike: Math.round(current.apparent_temperature),
        high: Math.round(daily?.temperature_2m_max?.[0] ?? current.temperature_2m + 2),
        low: Math.round(daily?.temperature_2m_min?.[0] ?? current.temperature_2m - 3),
        humidity: Math.round(current.relative_humidity_2m),
        windSpeed: Math.round(current.wind_speed_10m),
        isDay: Boolean(current.is_day),
        isGPS,
        updatedAt: new Date(),
        coordinates: { lat, lon }
      };

      setWeather(newWeather);

      // Persist last manually selected or GPS location
      try {
        localStorage.setItem(STORAGE_LAST_LOCATION_KEY, JSON.stringify({
          lat,
          lon,
          name: cityName,
          country: countryName,
          isGPS
        }));
      } catch {}
    } catch (err: any) {
      console.warn('Weather fetch error:', err);
      setErrorNotice('Live weather update failed. Check network or tap Retry.');
    } finally {
      setIsLoading(false);
    }
  };

  // Permanent GPS / Current Location handler
  const handleRequestGPSLocation = () => {
    if (!navigator.geolocation) {
      setErrorNotice('GPS is not supported on this device/browser.');
      return;
    }

    setIsLoading(true);
    setErrorNotice(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        let detectedName = 'Current Location';
        let detectedCountry = '';

        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            detectedName =
              geoData.address?.city ||
              geoData.address?.town ||
              geoData.address?.suburb ||
              geoData.address?.district ||
              geoData.address?.state ||
              'My Location';
            detectedCountry = geoData.address?.country || '';
          }
        } catch {
          detectedName = 'GPS Location';
        }

        await fetchWeatherForCoords(lat, lon, detectedName, detectedCountry, true);
        setShowLocationPicker(false);
      },
      (err) => {
        console.warn('GPS permission error:', err.message);
        setErrorNotice(
          'Location permission was denied or timed out. You can manually select your district from Bangladesh (64 districts) or international cities below.'
        );
        setIsLoading(false);
      },
      { timeout: 9000, enableHighAccuracy: true }
    );
  };

  // Filter predefined locations
  const filteredPredefined = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return ALL_PREDEFINED_LOCATIONS.filter(item => 
      item.name.toLowerCase().includes(q) ||
      (item.bnName && item.bnName.includes(q)) ||
      item.divisionOrCountry.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const renderWeatherIcon = (code: number, isDay: boolean = true) => {
    if (code === 0) {
      return <Sun className="w-9 h-9 text-amber-500 animate-spin-slow" />;
    }
    if (code === 1 || code === 2) {
      return <CloudSun className="w-9 h-9 text-amber-400" />;
    }
    if (code === 3 || code === 45 || code === 48) {
      return <Cloud className="w-9 h-9 text-slate-400" />;
    }
    if (code >= 51 && code <= 82) {
      return <CloudRain className="w-9 h-9 text-blue-400" />;
    }
    if (code >= 95) {
      return <CloudLightning className="w-9 h-9 text-purple-400" />;
    }
    return <CloudSun className="w-9 h-9 text-amber-400" />;
  };

  return (
    <div className="w-full">
      {/* Premium Glass Weather Card */}
      <div className="relative overflow-hidden rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 p-5 shadow-lg shadow-purple-900/5 transition-all">
        {/* Soft atmospheric gradient glow behind weather card */}
        <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-gradient-to-br from-purple-200/50 via-sky-200/40 to-transparent blur-2xl pointer-events-none" />

        {/* Top Header: Location Selector Button & Refresh */}
        <div className="relative z-10 flex items-center justify-between mb-3">
          <button
            onClick={() => {
              setShowLocationPicker(true);
              setSearchQuery('');
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 text-xs font-semibold transition-all border border-purple-500/15 shadow-xs max-w-[85%] group"
            title="Tap to select location or use GPS"
          >
            {weather?.isGPS ? (
              <Compass className="w-3.5 h-3.5 text-emerald-600 animate-pulse flex-shrink-0" />
            ) : (
              <MapPin className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
            )}
            <span className="font-bold truncate">{weather?.city || 'Dhaka'}</span>
            {weather?.country && <span className="opacity-75 truncate text-[11px]">({weather.country})</span>}
            {weather?.isGPS && (
              <span className="text-[9px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-bold">
                GPS
              </span>
            )}
            <ChevronRight className="w-3 h-3 text-purple-400 flex-shrink-0" />
          </button>

          <button
            onClick={() => {
              if (weather) {
                fetchWeatherForCoords(
                  weather.coordinates.lat,
                  weather.coordinates.lon,
                  weather.city,
                  weather.country,
                  weather.isGPS
                );
              }
            }}
            disabled={isLoading}
            className="p-1.5 rounded-full text-slate-400 hover:text-purple-600 hover:bg-purple-100/50 transition-colors"
            title="Refresh Weather"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>

        {/* Error Notice with Retry */}
        {errorNotice && (
          <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-1.5 pr-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
              <span className="text-[11px] leading-tight">{errorNotice}</span>
            </div>
            <button
              onClick={() => {
                if (weather) {
                  fetchWeatherForCoords(
                    weather.coordinates.lat,
                    weather.coordinates.lon,
                    weather.city,
                    weather.country,
                    weather.isGPS
                  );
                }
              }}
              className="text-[10px] font-bold text-rose-700 bg-white px-2 py-1 rounded-lg border border-rose-200 hover:bg-rose-100 flex-shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main Temperature & Condition Row */}
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl sm:text-5xl font-black text-slate-800 tracking-tight">
                {isLoading && !weather ? '...' : (weather?.temperature ?? 28)}°
              </span>
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">C</span>
            </div>

            <div className="text-xs font-bold text-purple-900/80 mt-0.5">
              {weather?.condition || 'Partly Cloudy'}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
              <span>Feels like {weather?.feelsLike ?? 30}°</span>
              <span>•</span>
              <span>H: {weather?.high ?? 32}° L: {weather?.low ?? 23}°</span>
            </div>
          </div>

          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-100/80 to-sky-100/80 border border-white/60 shadow-inner flex items-center justify-center">
            {renderWeatherIcon(weather?.code ?? 2, weather?.isDay ?? true)}
          </div>
        </div>

        {/* Bottom Details Row: Humidity & Wind */}
        <div className="relative z-10 mt-4 pt-3 border-t border-purple-100/60 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 bg-white/50 px-2.5 py-1.5 rounded-xl border border-white/60">
            <Droplets className="w-3.5 h-3.5 text-sky-500" />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-slate-400 font-medium">Humidity:</span>
              <span className="font-bold text-slate-700">{weather?.humidity ?? 64}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-600 bg-white/50 px-2.5 py-1.5 rounded-xl border border-white/60">
            <Wind className="w-3.5 h-3.5 text-teal-500" />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-slate-400 font-medium">Wind:</span>
              <span className="font-bold text-slate-700">{weather?.windSpeed ?? 11} km/h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Searchable Location Selector Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-3xl p-4 sm:p-5 max-w-md w-full max-h-[88vh] flex flex-col shadow-2xl border border-purple-100 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">Select Weather Location</h3>
                  <p className="text-[10px] text-slate-400">Bangladesh 64 districts &amp; Worldwide</p>
                </div>
              </div>
              <button
                onClick={() => setShowLocationPicker(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Permanent GPS / Current Location Option */}
            <div className="pt-3">
              <button
                onClick={handleRequestGPSLocation}
                disabled={isLoading}
                className="w-full py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center justify-between shadow-md shadow-teal-700/20 transition-all active:scale-98"
              >
                <div className="flex items-center gap-2">
                  <Compass className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <div className="text-left">
                    <div>GPS / Current Device Location</div>
                    <div className="text-[10px] font-normal text-teal-100 opacity-90">Auto-detect hyper-local coordinates</div>
                  </div>
                </div>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                  Precise GPS
                </span>
              </button>
            </div>

            {/* Search Input Box */}
            <div className="pt-3 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 translate-y-[-10%]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any district, city, or country..."
                className="w-full bg-slate-50 text-xs text-slate-800 pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-400 focus:bg-white shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 translate-y-[-10%] text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Mode Tabs (when search is empty) */}
            {!searchQuery.trim() && (
              <div className="flex items-center gap-1.5 pt-3 border-b border-slate-100 pb-2">
                <button
                  onClick={() => setLocationViewTab('bd')}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1 border ${
                    locationViewTab === 'bd'
                      ? 'bg-purple-100 text-purple-800 border-purple-200 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>Bangladesh (64)</span>
                </button>

                <button
                  onClick={() => setLocationViewTab('international')}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1 border ${
                    locationViewTab === 'international'
                      ? 'bg-purple-100 text-purple-800 border-purple-200 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <Globe2 className="w-3 h-3" />
                  <span>International</span>
                </button>
              </div>
            )}

            {/* Scrollable Location List */}
            <div className="flex-1 overflow-y-auto pt-2 space-y-3 custom-scrollbar pr-1">
              {/* CASE 1: SEARCH ACTIVE */}
              {searchQuery.trim() ? (
                <div className="space-y-3">
                  {/* Predefined Matches */}
                  {filteredPredefined.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5">
                        Matched Locations ({filteredPredefined.length})
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {filteredPredefined.map((loc) => {
                          const isCurrent = weather?.city === loc.name;
                          return (
                            <button
                              key={`${loc.name}-${loc.divisionOrCountry}`}
                              onClick={() => {
                                fetchWeatherForCoords(loc.lat, loc.lon, loc.name, loc.country, false);
                                setShowLocationPicker(false);
                              }}
                              className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                                isCurrent
                                  ? 'bg-purple-50 border-purple-400 text-purple-800 font-bold shadow-xs'
                                  : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-purple-50/50 hover:border-purple-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold">{loc.name}</span>
                                {isCurrent && <Check className="w-3 h-3 text-purple-600" />}
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5">
                                {loc.bnName ? `${loc.bnName} • ` : ''}{loc.divisionOrCountry}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Live Worldwide Geocoding Results */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5 flex items-center justify-between">
                      <span>Worldwide Live Search</span>
                      {isSearchingWorldwide && <span className="text-purple-600">Searching...</span>}
                    </div>

                    {worldwideResults.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {worldwideResults.map((loc, idx) => (
                          <button
                            key={`geo-${loc.name}-${idx}`}
                            onClick={() => {
                              fetchWeatherForCoords(loc.lat, loc.lon, loc.name, loc.country, false);
                              setShowLocationPicker(false);
                            }}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 text-left text-xs transition-all"
                          >
                            <div className="font-bold text-slate-800">{loc.name}</div>
                            <div className="text-[9px] text-slate-400 truncate">
                              {loc.divisionOrCountry ? `${loc.divisionOrCountry}, ` : ''}{loc.country}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      !isSearchingWorldwide && filteredPredefined.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          No matching cities found. Try searching another city name.
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : locationViewTab === 'bd' ? (
                /* CASE 2: BANGLADESH 64 DISTRICTS (GROUPED BY DIVISION) */
                <div className="space-y-3">
                  {/* Division Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
                    {BANGLADESH_DIVISIONS.map((divGroup) => (
                      <button
                        key={divGroup.division}
                        onClick={() => setSelectedDivisionTab(divGroup.division)}
                        className={`px-2.5 py-1 rounded-xl whitespace-nowrap text-[11px] font-semibold border transition-all ${
                          selectedDivisionTab === divGroup.division
                            ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {divGroup.division.replace(' Division', '')} ({divGroup.districts.length})
                      </button>
                    ))}
                  </div>

                  {/* Selected Division's Districts */}
                  {(() => {
                    const currentDivision = BANGLADESH_DIVISIONS.find(d => d.division === selectedDivisionTab);
                    if (!currentDivision) return null;
                    return (
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-purple-900 mb-2 px-1">
                          <span>{currentDivision.division} ({currentDivision.bnDivision})</span>
                          <span className="text-[10px] font-mono text-slate-400">{currentDivision.districts.length} Districts</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {currentDivision.districts.map((dist) => {
                            const isCurrent = weather?.city === dist.name;
                            return (
                              <button
                                key={dist.name}
                                onClick={() => {
                                  fetchWeatherForCoords(dist.lat, dist.lon, dist.name, 'Bangladesh', false);
                                  setShowLocationPicker(false);
                                }}
                                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                                  isCurrent
                                    ? 'bg-purple-50 border-purple-400 text-purple-800 font-bold shadow-xs'
                                    : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-purple-50/50 hover:border-purple-200'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold">{dist.name}</span>
                                  {isCurrent && <Check className="w-3 h-3 text-purple-600" />}
                                </div>
                                <div className="text-[10px] text-purple-600/80 font-bengali mt-0.5">
                                  {dist.bnName}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* CASE 3: INTERNATIONAL CITIES (INDIA, NEPAL, PAKISTAN, UAE, UK, USA) */
                <div className="space-y-4">
                  {INTERNATIONAL_CITIES.map((countryGroup) => (
                    <div key={countryGroup.country}>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-900 px-1 mb-1.5 flex items-center justify-between">
                        <span>{countryGroup.country}</span>
                        <span className="text-[10px] font-mono text-slate-400">{countryGroup.cities.length} Cities</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {countryGroup.cities.map((city) => {
                          const isCurrent = weather?.city === city.name;
                          return (
                            <button
                              key={city.name}
                              onClick={() => {
                                fetchWeatherForCoords(city.lat, city.lon, city.name, city.country, false);
                                setShowLocationPicker(false);
                              }}
                              className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                                isCurrent
                                  ? 'bg-purple-50 border-purple-400 text-purple-800 font-bold shadow-xs'
                                  : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-purple-50/50 hover:border-purple-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold">{city.name}</span>
                                {isCurrent && <Check className="w-3 h-3 text-purple-600" />}
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5">{city.country}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer Note */}
            <div className="pt-2.5 border-t border-slate-100 mt-2 text-center text-[10px] text-slate-400">
              Live meteorological telemetry provided by Open-Meteo High-Resolution Model.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
