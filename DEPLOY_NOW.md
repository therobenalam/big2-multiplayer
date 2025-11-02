# 🚀 DEPLOY NOW - Quick Guide

## Your repository is ready to deploy!

**Repository**: `therobenalam/big2-multiplayer`
**Branch**: `main` (all deployment configs merged ✅)

---

## Step 1: Deploy Backend to Render (5 minutes)

**Why?** Vercel doesn't support WebSocket connections, so we need the backend elsewhere.

1. **Go to Render.com**
   - Visit: https://render.com
   - Sign in with GitHub

2. **Create New Blueprint**
   - Click "New +" → "Blueprint"
   - Select your repository: `therobenalam/big2-multiplayer`
   - Render will detect `render.yaml` automatically
   - Click "Apply"
   
3. **Wait for Deployment** (~3-5 minutes)
   - Monitor the build logs
   - When complete, you'll see: "Live" with a green checkmark
   
4. **Copy Your Backend URL**
   - It will look like: `https://big2-multiplayer.onrender.com` or similar
   - **SAVE THIS URL** - you need it for Step 2!

---

## Step 2: Deploy Frontend to Vercel (3 minutes)

### Option A: Vercel Dashboard (Recommended - Visual)

1. **Go to Vercel**
   - Visit: https://vercel.com/new
   - Sign in with GitHub if needed

2. **Import Repository**
   - Click "Import Git Repository"
   - Search for: `big2-multiplayer`
   - Click "Import"

3. **Configure Project**
   - **Framework Preset**: Vercel will auto-detect "Vite"
   - **Root Directory**: Leave as default (it will use `vercel.json` config)
   - **Build Command**: Auto-filled
   - **Output Directory**: Auto-filled

4. **Add Environment Variable** ⚠️ CRITICAL
   - Click "Environment Variables" to expand
   - Add a new variable:
     - **Name**: `VITE_BACKEND_URL`
     - **Value**: Paste your backend URL from Step 1 (e.g., `https://big2-multiplayer.onrender.com`)
     - **Environments**: Check all three boxes (Production, Preview, Development)
   
5. **Deploy**
   - Click "Deploy"
   - Wait ~2 minutes
   - You'll get a URL like: `https://big2-multiplayer-xyz.vercel.app`

6. **Test Your Game!**
   - Visit your Vercel URL
   - Open browser console (F12) to check connection
   - Join a game and play!

---

### Option B: Vercel CLI (Alternative - Command Line)

Run these commands in order:

```bash
# 1. Make sure you're in project root
cd /Users/michaelalam/Desktop/Desktop/Coding/Coding/big2-multiplayer

# 2. Set environment variable (replace with YOUR backend URL)
vercel env add VITE_BACKEND_URL production
# When prompted, enter: https://YOUR-BACKEND-URL.onrender.com

# 3. Deploy to production
vercel --prod

# 4. Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (your account)
# - Link to existing project? No
# - Project name? (press Enter for default)
# - Directory? (press Enter for default)
# - Override settings? No

# 5. Visit the URL provided!
```

---

## Quick Verification Checklist

After deployment, verify everything works:

- [ ] Backend is live (visit `https://your-backend/healthz` - should see "ok")
- [ ] Frontend is live (visit your Vercel URL)
- [ ] Browser console shows Socket.IO connection established
- [ ] Can join a game and see waiting room
- [ ] Can play cards (test with a friend or use "Start with Bots")
- [ ] Chat works
- [ ] Game state persists

---

## 🎯 Expected Results

### Backend (Render)
- URL: `https://big2-multiplayer.onrender.com` (or similar)
- Status: "Live" (green checkmark)
- Health check: Returns "ok"
- Free tier: Will sleep after 15 min inactivity (30s cold start)

### Frontend (Vercel)
- URL: `https://big2-multiplayer-xyz.vercel.app` (or your custom domain)
- Status: "Ready"
- Build time: ~1-2 minutes
- Free tier: Unlimited bandwidth (100GB/month)

---

## ⚠️ Troubleshooting

### Backend Issues

**Problem**: Build fails on Render
- Check build logs for errors
- Verify `render.yaml` is in repository root
- Ensure `server/package.json` has correct dependencies

**Problem**: Backend shows "Deploying" for too long
- Render free tier can be slow on first deploy
- Wait 5-10 minutes
- Check build logs for progress

### Frontend Issues

**Problem**: "Can't connect to server"
- Verify `VITE_BACKEND_URL` is set in Vercel
- Check backend is running (visit `/healthz`)
- Check browser console for errors
- Ensure backend URL includes `https://` and no trailing `/`

**Problem**: Build fails on Vercel
- Check build logs in Vercel dashboard
- Verify `vercel.json` is in repository root
- Ensure all dependencies are installed

**Problem**: "WebSocket connection failed"
- Backend might be sleeping (Render free tier)
- Wait 30-60 seconds and refresh
- Check backend URL is correct

---

## 🎉 Success!

Once deployed, share your game URL with friends:
- **Your Game**: `https://your-app.vercel.app`
- **Share and Play**: Send the link to 3 friends
- **AI Practice**: Use "Start with Bots" to play solo

---

## Next Steps (Optional)

1. **Custom Domain** (Vercel)
   - Add your own domain in Project Settings
   - Configure DNS records
   - Auto HTTPS included

2. **Upgrade Backend** (Render)
   - $7/month for always-on (no cold starts)
   - Better performance
   - Auto-scaling

3. **Monitor Performance**
   - Vercel Analytics (built-in)
   - Render Metrics (dashboard)
   - Set up alerts

---

## Need Help?

- **Detailed Guide**: See `DEPLOYMENT.md`
- **Quick Reference**: See `VERCEL_QUICKSTART.md`
- **Checklist**: See `DEPLOYMENT_SUMMARY.md`
- **GitHub Issues**: Open an issue on your repository

---

**You're all set! 🚀 Start with Step 1 above and you'll be playing online in ~10 minutes!**
