import { runWithTools } from './runWithTools';

export interface Env {
  AI: any;
  WEATHER_API_KEY: {
    get(): Promise<string>;
  };
}

/**
 * Get current weather for a city using OpenWeatherMap API (real-time data)
 */
async function getCurrentWeather(
  { city, country }: { city: string; country?: string },
  env?: Env
): Promise<any> {
  if (!env?.WEATHER_API_KEY) {
    return {
      error: true,
      message: "OpenWeatherMap API key not configured. Please configure Secrets Store binding."
    };
  }

  try {
    // Get API key from Secrets Store using .get() method
    const apiKey = await env.WEATHER_API_KEY.get();

    if (!apiKey || apiKey.trim().length === 0) {
      return {
        error: true,
        message: "OpenWeatherMap API key is not configured. Please set WEATHER_API_KEY as a secret."
      };
    }

    // Trim any whitespace from the API key
    const trimmedApiKey = apiKey.trim();

    // Build query with optional country code
    const query = country ? `${city},${country}` : city;

    // Get current weather from OpenWeatherMap API (using secret from Cloudflare Secrets Store)
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${trimmedApiKey}&units=metric`;
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      const errorData = await weatherResponse.json() as any;
      return {
        error: true,
        message: errorData.message || `City "${city}" not found. Please check the spelling or try a different city.`
      };
    }

    const weatherData = await weatherResponse.json() as any;

    // Convert Unix timestamp to ISO string
    const timestamp = new Date(weatherData.dt * 1000).toISOString();
    const sunrise = new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString();
    const sunset = new Date(weatherData.sys.sunset * 1000).toLocaleTimeString();

    return {
      location: {
        name: weatherData.name,
        country: weatherData.sys.country,
        coordinates: {
          latitude: weatherData.coord.lat,
          longitude: weatherData.coord.lon
        },
        timezone: weatherData.timezone
      },
      current: {
        temperature: Math.round(weatherData.main.temp * 10) / 10,
        temperature_unit: "°C",
        feels_like: Math.round(weatherData.main.feels_like * 10) / 10,
        temp_min: Math.round(weatherData.main.temp_min * 10) / 10,
        temp_max: Math.round(weatherData.main.temp_max * 10) / 10,
        humidity: weatherData.main.humidity,
        humidity_unit: "%",
        pressure: weatherData.main.pressure,
        pressure_unit: "hPa",
        visibility: weatherData.visibility / 1000, // Convert to km
        visibility_unit: "km",
        wind_speed: Math.round(weatherData.wind.speed * 3.6 * 10) / 10, // Convert m/s to km/h
        wind_speed_unit: "km/h",
        wind_direction: weatherData.wind.deg,
        clouds: weatherData.clouds.all,
        clouds_unit: "%",
        description: weatherData.weather[0].description,
        main: weatherData.weather[0].main,
        icon: weatherData.weather[0].icon,
        icon_url: `https://openweathermap.org/img/wn/${weatherData.weather[0].icon}@2x.png`
      },
      sun: {
        sunrise: sunrise,
        sunset: sunset
      },
      timestamp: timestamp,
      source: "OpenWeatherMap API (Real-time)"
    };
  } catch (error) {
    console.error('Weather API error:', error);
    return {
      error: true,
      message: `Failed to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Main Worker handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers for browser testing
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Get query from request
      let userQuery: string;

      if (request.method === 'POST') {
        const body = await request.json() as { query: string };
        userQuery = body.query;
      } else {
        userQuery = url.searchParams.get('query') || 'What is the weather in London?';
      }

      const model = "@cf/meta/llama-3.1-8b-instruct";

      // Run AI with tool calling
      const response = await runWithTools(env.AI, model, {
        messages: [
          { role: "user", content: userQuery }
        ],
        tools: [
          {
            name: "getCurrentWeather",
            description: "Gets real-time weather data for any city",
            parameters: {
              type: "object",
              properties: {
                city: {
                  type: "string",
                  description: "City name (required)"
                },
                country: {
                  type: "string",
                  description: "Country name or code (optional, helps with accuracy)"
                }
              },
              required: ["city"]
            },
            function: async (args) => getCurrentWeather(args, env)
          }
        ]
      });

      // Return response
      return new Response(JSON.stringify({
        success: true,
        query: userQuery,
        response: response.response,
        toolsUsed: response.toolsUsed,
        model: model,
      }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};