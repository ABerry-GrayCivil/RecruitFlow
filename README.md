# RecruitFlow — Gray Civil Recruiting

Internal recruitment management tool for Gray Civil Engineering.

## Stack
- **Frontend:** React + Vite
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Auth:** Azure Entra ID (Microsoft 365 SSO) via Supabase
- **Hosting:** Vercel at recruit.gray-civil.com

## Setup

### 1. Database
Run `supabase-schema-recruitflow.sql` in the Supabase SQL Editor
(same project as TimeAway: bnbwtxcrryhfuocmwaja.supabase.co)

### 2. Azure App Registration
Add the Supabase callback URL to the existing app registration's redirect URIs:
```
https://bnbwtxcrryhfuocmwaja.supabase.co/auth/v1/callback
```
(If this is already there from TimeAway, no change needed.)

### 3. DNS
Add CNAME record: `recruit` → `cname.vercel-dns.com`
(See WebAdmin-RecruitFlow-Subdomain.md)

### 4. Deploy to Vercel
1. Push this folder to a GitHub repo
2. Import to Vercel
3. Set environment variables:
   - `VITE_SUPABASE_URL` = `https://bnbwtxcrryhfuocmwaja.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Add custom domain: `recruit.gray-civil.com`

### 5. Local Development
```bash
npm install
cp .env.example .env.local  # Fill in your keys
npm run dev
```
