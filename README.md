# Privalytics Lite

Minimal privacy-first analytics with core tracking features.

## Features

- Cookie-less tracking (privacy-first)
- Total visitors and page views
- Top pages ranking
- Time series data
- Simple, lightweight dashboard

## Installation

```bash
npm install
npm start
```

Server runs on http://localhost:3001

## Usage

1. Add a site via the dashboard
2. Add tracking script to your site:
   ```html
   <script src="http://localhost:3001/script.js" data-site-id="YOUR_SITE_ID"></script>
   ```

## API

- `POST /api/track` - Track pageview
- `GET /api/sites` - List sites
- `POST /api/sites` - Create site
- `GET /api/sites/:id/stats` - Get stats
- `GET /api/sites/:id/timeseries` - Time series
- `GET /api/sites/:id/pages` - Top pages
