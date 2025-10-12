# D1 Database Setup Guide

This guide will help you set up a Cloudflare D1 database for your Workers AI application.

## Quick Setup (Automated)

The easiest way to set up the database is using the automated script:

```bash
./setup-db.sh
```

This script will:
1. Create a D1 database called `users-database`
2. Update `wrangler.jsonc` with the database configuration
3. Create the database schema
4. Seed it with sample user data
5. Verify the setup

## Manual Setup

If you prefer to set up manually or the script fails, follow these steps:

### Step 1: Create D1 Database

```bash
npx wrangler d1 create users-database
```

This will output something like:
```
✅ Successfully created DB 'users-database'!

[[d1_databases]]
binding = "DB"
database_name = "users-database"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` from the output.**

### Step 2: Update wrangler.jsonc

Edit `wrangler.jsonc` and add the D1 configuration:

```jsonc
{
  "name": "cloudflare-ai-toolcalling",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",

  "ai": {
    "binding": "AI"
  },

  // Add this section with YOUR database_id
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "users-database",
      "database_id": "YOUR-DATABASE-ID-HERE"
    }
  ]
}
```

### Step 3: Create Schema

```bash
npx wrangler d1 execute users-database --file=schema.sql
```

This creates the `users` table with:
- `id` - Primary key
- `name` - User's full name
- `email` - User's email (unique)
- `department` - Department name
- `status` - "active" or "inactive"
- `lastSeen` - ISO timestamp of last activity
- `createdAt` - Record creation timestamp

### Step 4: Seed Data

```bash
npx wrangler d1 execute users-database --file=seed.sql
```

This inserts 15 sample users across different departments.

### Step 5: Verify Setup

Check that data was inserted:

```bash
npx wrangler d1 execute users-database --command="SELECT COUNT(*) as count FROM users WHERE status='active'"
```

View sample data:

```bash
npx wrangler d1 execute users-database --command="SELECT * FROM users LIMIT 5"
```

## Testing the Database

### Start the Worker

```bash
npm run worker:dev
```

### Test User Query

```bash
curl "http://localhost:8787?query=Show me the list of active users"
```

**Check the console logs** for:
```
Executing D1 query: SELECT * FROM users WHERE status = "active" ORDER BY lastSeen DESC LIMIT ? [10]
D1 returned 14 users
```

If you see `source: "database"` in the response, the database is working!

### Test with Department Filter

```bash
curl "http://localhost:8787?query=Show me users in Engineering department"
```

### Test via UI

1. Start UI: `npm run dev`
2. Open `http://localhost:3000`
3. Click "Show active users"
4. Check response - it should say `"source": "database"`

## Database Management

### List All Databases

```bash
npx wrangler d1 list
```

### Execute Custom Query

```bash
npx wrangler d1 execute users-database --command="SELECT * FROM users WHERE department='Engineering'"
```

### Add New User

```bash
npx wrangler d1 execute users-database --command="
INSERT INTO users (name, email, department, status, lastSeen)
VALUES ('John Doe', 'john@company.com', 'Sales', 'active', datetime('now'))
"
```

### Update User Status

```bash
npx wrangler d1 execute users-database --command="
UPDATE users SET status='inactive' WHERE email='john@company.com'
"
```

### View All Active Users

```bash
npx wrangler d1 execute users-database --command="
SELECT * FROM users WHERE status='active' ORDER BY lastSeen DESC
"
```

### Count Users by Department

```bash
npx wrangler d1 execute users-database --command="
SELECT department, COUNT(*) as count
FROM users
WHERE status='active'
GROUP BY department
ORDER BY count DESC
"
```

## Troubleshooting

### Error: "Database not found"

Make sure your `database_id` in `wrangler.jsonc` matches the one from `wrangler d1 create`.

Check your databases:
```bash
npx wrangler d1 list
```

### Error: "Binding DB not found"

Restart your worker after updating `wrangler.jsonc`:
```bash
# Stop the current worker (Ctrl+C)
npm run worker:dev
```

### Using Mock Data Instead of Database

If you see `"source": "mock_data"` in responses, check:

1. Is the DB binding configured in `wrangler.jsonc`?
2. Did you restart the worker after updating the config?
3. Check console logs for database errors

### Error: "Table users doesn't exist"

Run the schema creation:
```bash
npx wrangler d1 execute users-database --file=schema.sql
```

### No Data Returned

Check if data exists:
```bash
npx wrangler d1 execute users-database --command="SELECT COUNT(*) FROM users"
```

If count is 0, run the seed script:
```bash
npx wrangler d1 execute users-database --file=seed.sql
```

## Production Deployment

When deploying to production:

```bash
# Deploy with database binding
npm run worker:deploy
```

The D1 database binding from `wrangler.jsonc` will automatically be included.

### Use Different Databases for Dev/Prod

Update `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "users-database-prod",  // Production DB
      "database_id": "prod-database-id",
      "preview_database_id": "dev-database-id"  // Dev DB
    }
  ]
}
```

## Database Schema

The `users` table structure:

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-incrementing primary key |
| name | TEXT | User's full name (required) |
| email | TEXT | User's email, unique (required) |
| department | TEXT | Department name (required) |
| status | TEXT | "active" or "inactive" (default: "active") |
| lastSeen | TEXT | ISO 8601 timestamp of last activity |
| createdAt | TEXT | ISO 8601 timestamp when record was created |

### Indexes

- `idx_users_status` - On `status` column (speeds up active user queries)
- `idx_users_department` - On `department` column (speeds up department filters)
- `idx_users_lastSeen` - On `lastSeen` column (speeds up sorting by activity)

## Resources

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [D1 SQL Reference](https://developers.cloudflare.com/d1/platform/client-api/)
- [Wrangler D1 Commands](https://developers.cloudflare.com/workers/wrangler/commands/#d1)

## Next Steps

After setting up the database:

1. ✅ Test user queries to verify database is working
2. ✅ Test department filters
3. ✅ Check console logs to confirm D1 queries are executing
4. Add more users as needed
5. Deploy to production with `npm run worker:deploy`