# Quick Start: Deploy to Vercel

This guide will help you deploy the Big Two Multiplayer game to Vercel in minutes.

## Prerequisites

- [ ] Backend deployed and running (see [DEPLOYMENT.md](./DEPLOYMENT.md) for backend setup)
- [ ] Backend URL ready (e.g., `https://big2-backend.onrender.com`)
- [ ] Vercel account (free tier works fine)

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel will auto-detect the configuration from `vercel.json`

3. **Configure Environment Variable**
   - Before deploying, click "Environment Variables"
   - Add:
     - **Name**: `VITE_BACKEND_URL`
     - **Value**: Your backend URL (e.g., `https://big2-backend.onrender.com`)
     - **Environments**: Production, Preview, Development (select all)

4. **Deploy**
   - Click "Deploy"
   - Wait 1-2 minutes for build to complete
   - Visit your new Vercel URL!

### Option 2: Deploy via Vercel CLI

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Set Environment Variable**
   ```bash
   vercel env add VITE_BACKEND_URL
   ```
   
   When prompted:
   - Enter your backend URL (e.g., `https://big2-backend.onrender.com`)
   - Select: Production, Preview, Development

3. **Deploy to Production**
   ```bash
   vercel --prod
   ```

4. **Visit Your Site**
   - Vercel will output your deployment URL
   - Visit it and test the game!

## Verify Deployment

1. Open your Vercel URL
2. Open browser DevTools (F12) → Console
3. Check for Socket.IO connection messages
4. Try joining a game with a friend!

## Troubleshooting

### "Can't connect to backend"
- Check that `VITE_BACKEND_URL` is set correctly
- Verify your backend is running (visit `https://your-backend/healthz`)
- Check browser console for specific errors

### "Build failed"
- Check Vercel build logs
- Ensure `vercel.json` is in project root
- Verify all dependencies are installed

### "Game loads but freezes"
- Backend might be on Render free tier and sleeping
- Wait 30 seconds for cold start
- Consider upgrading Render to paid tier for always-on

## Next Steps

- Share your Vercel URL with friends!
- Monitor usage in Vercel Dashboard
- Set up custom domain (optional)
- Configure auto-deployments on Git push

## Support

For detailed documentation, see [DEPLOYMENT.md](./DEPLOYMENT.md)
