import React, { useState, useEffect } from 'react';
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
  AlertCircle,
  Navigation
} from 'lucide-react';

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
  updatedAt: Date;
  coordinates: { lat: number; lon: number };
}

const STORAGE_LAST_GPS_KEY = 'zuzu_last_gps_weather';

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

  // Fetch real weather data from Open-Meteo for given coordinates
  const fetchWeatherForGPS = async (lat: number, lon: number, locationLabel: string = 'Current Location') => {
    setIsLoading(true);
    setErrorNotice(null);

    try {
      // 1. Fetch live meteorological metrics from Open-Meteo API
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather service returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const current = data.current;
      const daily = data.daily;

      // 2. Reverse geocode city name via BigDataCloud or Open-Meteo reverse
      let resolvedCity = locationLabel;
      let resolvedCountry = '';

      try {
        const geoRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          resolvedCity = geoData.locality || geoData.city || geoData.principalSubdivision || locationLabel;
          resolvedCountry = geoData.countryName || '';
        }
      } catch {
        // Fallback to basic coordinate label if reverse lookup times out
        if (locationLabel === 'Current Location') {
          resolvedCity = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
        }
      }

      const weatherCondition = getWeatherDescription(current.weather_code);

      const weatherObj: WeatherData = {
        city: resolvedCity,
        country: resolvedCountry,
        temperature: Math.round(current.temperature_2m),
        condition: weatherCondition.text,
        code: current.weather_code,
        feelsLike: Math.round(current.apparent_temperature),
        high: Math.round(daily.temperature_2m_max?.[0] ?? current.temperature_2m + 2),
        low: Math.round(daily.temperature_2m_min?.[0] ?? current.temperature_2m - 2),
        humidity: Math.round(current.relative_humidity_2m),
        windSpeed: Math.round(current.wind_speed_10m),
        isDay: current.is_day === 1,
        updatedAt: new Date(),
        coordinates: { lat, lon }
      };

      setWeather(weatherObj);

      // Save to localStorage for quick restore on app launch
      try {
        localStorage.setItem(STORAGE_LAST_GPS_KEY, JSON.stringify({
          lat,
          lon,
          city: resolvedCity,
          country: resolvedCountry,
          timestamp: Date.now()
        }));
      } catch {}
    } catch (err: any) {
      console.warn('GPS weather fetch error:', err);
      setErrorNotice(err.message || 'Unable to update live weather.');
    } finally {
      setIsLoading(false);
    }
  };

  // Acquire current device GPS coordinates
  const acquireGPSWeather = () => {
    setIsLoading(true);
    setErrorNotice(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setIsLoading(false);
      setErrorNotice('GPS geolocation is not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchWeatherForGPS(latitude, longitude, 'Live Device Location');
      },
      (err) => {
        console.warn('GPS location request error:', err);
        setIsLoading(false);
        if (err.code === 1) {
          setErrorNotice('Location permission required. Please allow location access in your device settings.');
        } else if (err.code === 2) {
          setErrorNotice('GPS signal unavailable. Please ensure location services are enabled.');
        } else {
          setErrorNotice('GPS location request timed out. Tap retry to acquire signal.');
        }

        // If we have cached GPS location, load it while showing the notice
        try {
          const cached = localStorage.getItem(STORAGE_LAST_GPS_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.lat && parsed.lon) {
              fetchWeatherForGPS(parsed.lat, parsed.lon, parsed.city || 'Cached Location');
            }
          }
        } catch {}
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // On initial mount, acquire device GPS location immediately
  useEffect(() => {
    // Attempt cached restore first for instant UI responsiveness
    try {
      const cached = localStorage.getItem(STORAGE_LAST_GPS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.lat && parsed.lon && Date.now() - (parsed.timestamp || 0) < 1800000) {
          fetchWeatherForGPS(parsed.lat, parsed.lon, parsed.city || 'Current Location');
          return;
        }
      }
    } catch {}

    acquireGPSWeather();
  }, []);

  const renderWeatherIcon = () => {
    if (!weather) return <Sun className="w-8 h-8 text-amber-500 animate-spin-slow" />;

    const isDay = weather.isDay;
    switch (weather.code) {
      case 0:
      case 1:
        return isDay 
          ? <Sun className="w-8 h-8 text-amber-500 animate-pulse-slow" />
          : <Sun className="w-8 h-8 text-indigo-400" />;
      case 2:
      case 3:
        return <CloudSun className="w-8 h-8 text-sky-500" />;
      case 45:
      case 48:
        return <Cloud className="w-8 h-8 text-slate-400" />;
      case 51:
      case 53:
      case 55:
      case 61:
      case 63:
      case 65:
      case 80:
      case 81:
      case 82:
        return <CloudRain className="w-8 h-8 text-blue-500" />;
      case 71:
      case 73:
      case 75:
        return <CloudSnow className="w-8 h-8 text-cyan-400" />;
      case 95:
      case 96:
      case 99:
        return <CloudLightning className="w-8 h-8 text-amber-400 animate-bounce" />;
      default:
        return <CloudSun className="w-8 h-8 text-sky-500" />;
    }
  };

  return (
    <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 p-4 shadow-lg shadow-purple-900/5 relative overflow-hidden transition-all duration-300">
      {/* Background ambient gradient glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-amber-400/20 via-sky-400/20 to-purple-400/10 rounded-full blur-2xl pointer-events-none" />

      {/* Top Bar: Location Header and Refresh Action */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 shadow-xs">
            <Navigation className="w-3.5 h-3.5 fill-current" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-xs text-slate-800 truncate">
                {weather?.city || 'Live GPS Location'}
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-mono font-bold flex-shrink-0">
                GPS
              </span>
            </div>
            {weather?.country && (
              <p className="text-[10px] text-slate-400 truncate">{weather.country}</p>
            )}
          </div>
        </div>

        {/* Refresh GPS Button */}
        <button
          onClick={acquireGPSWeather}
          disabled={isLoading}
          className="p-1.5 rounded-full hover:bg-purple-100/70 text-slate-500 hover:text-purple-700 transition-colors shadow-2xs"
          title="Refresh Device Live Location"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
        </button>
      </div>

      {/* Main Weather Display */}
      {weather && !isLoading ? (
        <div className="flex items-center justify-between pt-1">
          {/* Left: Temperature & Conditions */}
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight font-sans">
                {weather.temperature}°
              </span>
              <span className="text-xs font-semibold text-slate-500">C</span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-medium">
                Feels {weather.feelsLike}°
              </span>
            </div>
            <p className="text-xs font-bold text-purple-700">
              {weather.condition}
            </p>
          </div>

          {/* Right: Weather Icon & High / Low / Humidity / Wind */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-purple-50 to-sky-50 border border-purple-100/60 shadow-xs">
              {renderWeatherIcon()}
            </div>

            <div className="text-[10px] space-y-1 font-semibold text-slate-500 border-l border-slate-100 pl-3">
              <div className="flex items-center gap-1.5">
                <Droplets className="w-3 h-3 text-sky-500" />
                <span>{weather.humidity}% Hum</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wind className="w-3 h-3 text-teal-500" />
                <span>{weather.windSpeed} km/h</span>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                <span>H: {weather.high}°</span>
                <span>•</span>
                <span>L: {weather.low}°</span>
              </div>
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="py-4 flex items-center justify-center gap-2 text-xs text-purple-700 font-semibold animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
          <span>Acquiring live device GPS location...</span>
        </div>
      ) : null}

      {/* Permission or Connection Notice if error occurred */}
      {errorNotice && (
        <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="leading-snug">{errorNotice}</p>
            <button
              onClick={acquireGPSWeather}
              className="mt-1 text-[10px] font-bold text-purple-700 underline hover:text-purple-900"
            >
              Retry GPS Location
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
