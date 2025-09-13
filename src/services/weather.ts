import axios from 'axios';
import { WeatherSnapshot, Location } from '@/types';
import { logger } from '@/utils/logger';

export class WeatherService {
  private static readonly BASE_URL = 'https://api.openweathermap.org/data/2.5';
  private static readonly API_KEY = process.env.WEATHER_API_KEY;

  /**
   * Get current weather for a location
   */
  static async getCurrentWeather(location: Location): Promise<WeatherSnapshot> {
    // If in mock mode or no API key, return mock data
    if (process.env.MOCK_MODE === 'true' || !this.API_KEY) {
      return this.getMockWeather(location);
    }

    try {
      const response = await axios.get(`${this.BASE_URL}/weather`, {
        params: {
          lat: location.lat,
          lon: location.lng,
          appid: this.API_KEY,
          units: 'metric'
        },
        timeout: 5000
      });

      const data = response.data;

      return {
        temp: Math.round(data.main.temp * 10) / 10,
        humidity: data.main.humidity,
        source: 'OpenWeatherMap',
        timestamp: new Date(),
        conditions: data.weather[0]?.description || 'Unknown',
        windSpeed: data.wind?.speed || 0
      };
    } catch (error) {
      logger.warn('Weather API call failed, using mock data:', error);
      return this.getMockWeather(location);
    }
  }

  /**
   * Generate mock weather data based on location and time
   */
  private static getMockWeather(location: Location): WeatherSnapshot {
    // Generate deterministic but realistic weather based on location
    const seed = Math.abs(location.lat * location.lng * 1000) % 100;
    const hour = new Date().getHours();
    
    // Base temperature varies by latitude (rough approximation)
    const baseTemp = 25 - Math.abs(location.lat) * 0.6;
    
    // Daily temperature variation
    const dailyVariation = Math.sin((hour - 6) * Math.PI / 12) * 8;
    
    // Random variation based on location
    const randomVariation = (seed % 20) - 10;
    
    const temp = Math.round((baseTemp + dailyVariation + randomVariation) * 10) / 10;
    const humidity = Math.min(100, Math.max(20, 50 + (seed % 40) + (hour > 18 ? 20 : 0)));

    const conditions = [
      'Clear sky', 'Few clouds', 'Scattered clouds', 'Partly cloudy',
      'Overcast', 'Light rain', 'Moderate rain'
    ];

    return {
      temp,
      humidity,
      source: 'Mock Weather Service',
      timestamp: new Date(),
      conditions: conditions[seed % conditions.length],
      windSpeed: Math.round((5 + (seed % 15)) * 10) / 10
    };
  }

  /**
   * Get weather history for a location (mock implementation)
   */
  static async getWeatherHistory(location: Location, hours: number = 24): Promise<WeatherSnapshot[]> {
    const history: WeatherSnapshot[] = [];
    const now = new Date();

    for (let i = 0; i < hours; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      const mockLocation = { ...location, lat: location.lat + (i * 0.001) }; // Slight variation
      
      const weather = this.getMockWeather(mockLocation);
      weather.timestamp = timestamp;
      
      history.push(weather);
    }

    return history.reverse(); // Chronological order
  }
}