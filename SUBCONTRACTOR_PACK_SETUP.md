# Subcontractor Pack Setup Guide

## Overview

The subcontractor pack feature allows subcontractors to submit their business information, banking details, and insurance documents. The system uses AI to automatically extract expiry dates from insurance documents and sends automated email reminders when insurance is expiring.

## Required Environment Variables

Add these to your Vercel project settings (Settings → Environment Variables):

### Existing Variables
- `RESEND_API_KEY` - Your Resend API key (already configured)
- `FROM_EMAIL` - Email address to send from (already configured)
- `BUSINESS_EMAIL` - Your business email to receive submissions (already configured)

### New Variables Required

#### 1. OpenAI API Key
```
OPENAI_API_KEY=sk-...your-openai-api-key...
```

**To get your OpenAI API key:**
1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key and add it to Vercel environment variables

**Cost**: ~$0.01 per document analyzed (~$3-5/month for 100-200 submissions)

#### 2. Vercel Postgres Database

**Setup Instructions:**
1. Go to your Vercel project dashboard
2. Navigate to "Storage" tab
3. Click "Create Database"
4. Select "Postgres"
5. Follow the prompts to create the database
6. Vercel will automatically add these environment variables:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

**Cost**: Free tier includes 256MB storage, 60 hours compute/month (sufficient for this use case)

#### 3. Cron Secret (for security)
```
CRON_SECRET=your-random-secret-string
```

Generate a random string to secure your cron endpoint:
```bash
# On Windows PowerShell:
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})

# Or use any random string generator
```

## Database Setup

After creating the Vercel Postgres database:

### Option 1: Using Vercel Dashboard
1. Go to Storage → Your Postgres database → "Data" tab
2. Click "Query"
3. Copy and paste the contents of `schema.sql`
4. Click "Run Query"

### Option 2: Using Vercel CLI
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Link your project
vercel link

# Run the schema
vercel env pull .env.local
psql $POSTGRES_URL -f schema.sql
```

## Deployment Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables in Vercel**
   - Add `OPENAI_API_KEY`
   - Add `CRON_SECRET`
   - Create Postgres database (adds `POSTGRES_URL` automatically)

3. **Run Database Schema**
   - Execute `schema.sql` in your Postgres database

4. **Deploy to Vercel**
   ```bash
   git add .
   git commit -m "Add subcontractor pack feature"
   git push
   ```

5. **Verify Cron Job**
   - Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
   - You should see: `/api/cron/check-expiring-insurance` running daily at 9:00 AM AEST

## Testing Locally

To test locally, create a `.env.local` file:

```env
RESEND_API_KEY=your-resend-key
FROM_EMAIL=your@email.com
BUSINESS_EMAIL=your-business@email.com
OPENAI_API_KEY=sk-your-openai-key
POSTGRES_URL=postgres://user:pass@host:5432/database
CRON_SECRET=your-secret-string
```

Then run:
```bash
npm run serve
```

## How It Works

### Form Submission Flow
1. Subcontractor fills out form at `/subcontractor-pack.html`
2. Form submits to `/api/submit-subby-pack`
3. API endpoint:
   - Validates input
   - Sends insurance documents to OpenAI Vision API
   - Extracts expiry dates, policy numbers, insurer names
   - Stores data in Postgres database
   - Sends email with all details + AI-extracted info
   - Highlights any insurance expiring within 60 days

### Automated Reminders
1. Cron job runs daily at 9:00 AM AEST (`/api/cron/check-expiring-insurance`)
2. Queries database for insurance expiring in next 30/60/90 days
3. Sends reminder email with:
   - List of expiring insurance
   - Days until expiry
   - Subcontractor contact details
4. Marks insurance as "reminded" to avoid duplicate emails

## Troubleshooting

### AI Extraction Not Working
- Check `OPENAI_API_KEY` is set correctly
- Verify you have OpenAI API credits
- Check Vercel function logs for errors

### Database Errors
- Ensure Postgres database is created in Vercel
- Verify `POSTGRES_URL` environment variable is set
- Check schema has been run successfully

### Cron Job Not Running
- Verify `CRON_SECRET` environment variable is set
- Check Vercel Dashboard → Cron Jobs for execution logs
- Ensure you're on a Vercel plan that supports cron jobs (Hobby plan and above)

### Emails Not Sending
- Verify `RESEND_API_KEY`, `FROM_EMAIL`, and `BUSINESS_EMAIL` are set
- Check Resend dashboard for email logs
- Verify email domain is verified in Resend

## Support

For issues or questions, check:
- Vercel function logs: Dashboard → Project → Functions → Logs
- OpenAI API usage: https://platform.openai.com/usage
- Resend email logs: https://resend.com/emails
