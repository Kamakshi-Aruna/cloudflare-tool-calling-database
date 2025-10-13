# OpenWeatherMap API Setup

This guide will help you set up the OpenWeatherMap API for real-time weather data.

## 1. Get Your API Key

1. Go to [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to "API keys" section
4. Copy your API key (it may take a few minutes to activate)

## 2. Add API Key to Cloudflare Workers

### For Development (Local Testing):
```bash
# Create a .dev.vars file in your project root
echo "OPENWEATHER_API_KEY=your_api_key_here" > .dev.vars
```

### For Production (Deployed Worker):
```bash
# Use Wrangler to securely add the secret
wrangler secret put OPENWEATHER_API_KEY
# When prompted, paste your API key
```

## 3. Deploy Your Worker

```bash
# Deploy the updated worker
npm run worker:deploy
```

## 4. Test the Weather Tool

You can test the weather functionality by asking:
- "What's the weather in London?"
- "Tell me the current weather in Tokyo, Japan"
- "How's the weather in New York?"

## API Features

The OpenWeatherMap integration provides:
- Real-time temperature (°C)
- Feels-like temperature
- Min/Max temperature
- Humidity (%)
- Pressure (hPa)
- Visibility (km)
- Wind speed (km/h) and direction
- Cloud coverage (%)
- Weather description
- Sunrise and sunset times
- Weather icon URL

## Free Tier Limits

OpenWeatherMap free tier includes:
- 1,000 API calls per day
- 60 calls per minute
- Current weather data
- 3-hour forecast data

## Troubleshooting

If you get an error message about "API key not configured":
1. Make sure you've added the secret using `wrangler secret put OPENWEATHER_API_KEY`
2. Verify the API key is active on OpenWeatherMap dashboard
3. Redeploy your worker after adding the secret

If you get "city not found":
1. Check the spelling of the city name
2. Try adding the country code (e.g., "London, UK")
3. Use major city names that are well-known