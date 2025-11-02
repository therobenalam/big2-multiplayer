# Deployment Guide

This Big Two multiplayer game uses a split deployment architecture:
- **Frontend (client)**: Deployed on Vercel
- **Backend (server)**: Deployed on Render.com (or Railway/Fly.io)

## Why Split Deployment?

Vercel's serverless functions don't support WebSocket connections, which are required for real-time multiplayer gameplay. Therefore, we deploy:
1. The React frontend on Vercel (excellent for static sites and SPAs)
2. The Node.js + Socket.IO backend on a platform that supports persistent connections

---

## Backend Deployment (Render.com)

### Option 1: Using the Render Dashboard

1. **Create a Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with your GitHub account

2. **Create a New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure the service:
     - **Name**: `big2-backend` (or your preferred name)
     - **Region**: Choose closest to your users
     - **Branch**: `main`
     - **Root Directory**: Leave empty (uses root)
     - **Runtime**: `Node`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free` (or upgrade for better performance)

3. **Add Environment Variables** (if needed)
   - In the Render dashboard, go to Environment
   - Add any required variables (none required for basic setup)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for the build to complete
   - Copy your backend URL (e.g., `https://big2-backend.onrender.com`)

### Option 2: Using render.yaml (Infrastructure as Code)

The project already includes `render.yaml`. Simply:

1. Go to [render.com](https://render.com)
2. Click "New +" → "Blueprint"
3. Connect your repository
4. Render will detect `render.yaml` and configure automatically

---

## Frontend Deployment (Vercel)

### Prerequisites

1. **Install Vercel CLI** (if not already installed)
   ```bash
   npm install -g vercel
   ```

### Deployment Steps

1. **Navigate to Project Root**
   ```bash
   cd /path/to/big2-multiplayer
   ```

2. **Set Backend URL Environment Variable**
   
   You need to configure where your frontend connects to the backend:
   
   ```bash
   # For Vercel CLI deployment
   vercel env add VITE_BACKEND_URL
   ```
   
   When prompted, enter your backend URL:
   - **Production**: `https://your-backend-url.onrender.com`
   - **Preview**: `https://your-backend-url.onrender.com`
   - **Development**: (leave empty or use `http://localhost:10000`)

   Or use the Vercel Dashboard:
   - Go to your project settings → Environment Variables
   - Add: `VITE_BACKEND_URL` = `https://your-backend-url.onrender.com`

3. **Deploy to Vercel**

   **Option A: Using Vercel CLI**
   ```bash
   vercel --prod
   ```

   **Option B: Using Git Integration**
   - Push your code to GitHub
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your repository
   - Vercel will auto-detect the configuration
   - Add the environment variable `VITE_BACKEND_URL` in project settings
   - Deploy

4. **Verify Deployment**
   - Visit your Vercel URL
   - Check browser console for connection to backend
   - Test joining a game

---

## Configuration Files

### `vercel.json`
Configures Vercel to:
- Build only the client directory
- Output to `client/dist`
- Handle SPA routing with rewrites

### `render.yaml`
Configures Render to:
- Deploy the Node.js backend
- Run on port 10000 (or dynamic `PORT`)
- Include health check endpoint

### Environment Variables

#### Client (Vercel)
- `VITE_BACKEND_URL`: URL of your backend server (e.g., `https://big2-backend.onrender.com`)

#### Server (Render)
- `PORT`: Automatically provided by Render (default: 10000)

---

## Local Development

For local development, both frontend and backend run together:

```bash
# Install dependencies
npm install

# Run both client and server
npm run dev

# Or run separately:
# Terminal 1 - Backend
cd server && npm start

# Terminal 2 - Client  
cd client && npm run dev
```

The client uses Vite's proxy (configured in `vite.config.ts`) to forward Socket.IO requests to `localhost:10000`.

---

## CORS Configuration

The backend (`server/index.js`) is configured to accept connections from any origin:

```javascript
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
```

For production, you may want to restrict this to your Vercel domain:

```javascript
const io = new Server(server, {
  cors: { 
    origin: ['https://your-app.vercel.app'], 
    methods: ['GET', 'POST'] 
  },
});
```

---

## Troubleshooting

### Frontend can't connect to backend
- Check browser console for connection errors
- Verify `VITE_BACKEND_URL` is set correctly in Vercel
- Ensure backend is deployed and running
- Check backend logs on Render

### Deployment fails on Vercel
- Verify `vercel.json` is in project root
- Check build logs for errors
- Ensure `client/package.json` has correct build script

### Backend deployment fails on Render
- Check build logs on Render dashboard
- Verify `package.json` scripts are correct
- Ensure all dependencies are listed

### WebSocket connection issues
- Confirm backend URL uses `https://` not `http://`
- Check if firewall/proxy blocks WebSocket connections
- Verify Socket.IO transport configuration

---

## Cost Considerations

### Free Tier Limits

**Vercel (Free)**
- Unlimited deployments
- 100 GB bandwidth/month
- Automatic HTTPS

**Render (Free)**
- 750 hours/month (enough for 1 service running 24/7)
- Service spins down after 15 minutes of inactivity
- Cold starts take ~30 seconds

### Performance Tips

For Render free tier:
- First connection may be slow (cold start)
- Keep service active with a cron job if needed
- Consider upgrading to paid plan ($7/month) for always-on service

---

## Alternative Backend Hosting

If Render doesn't work for you, consider:

1. **Railway.app**
   - $5/month for starter plan
   - Better cold start performance
   - Simple deployment from GitHub

2. **Fly.io**
   - Free tier includes 3 shared VMs
   - Global deployment
   - Better for low-latency requirements

3. **Heroku**
   - No longer offers free tier
   - Reliable, but starts at $5/month

---

## Monitoring

### Backend (Render)
- View logs in Render dashboard
- Monitor health check endpoint: `/healthz`
- Set up status alerts

### Frontend (Vercel)
- View deployment logs
- Monitor function executions
- Use Vercel Analytics (optional)

---

## Next Steps

1. Deploy backend to Render
2. Note the backend URL
3. Configure `VITE_BACKEND_URL` in Vercel
4. Deploy frontend to Vercel
5. Test the deployed application
6. Share the Vercel URL with users!

---

## Support

If you encounter issues:
- Check the logs on both platforms
- Verify environment variables are set
- Ensure CORS is configured correctly
- Test locally first to isolate deployment issues
