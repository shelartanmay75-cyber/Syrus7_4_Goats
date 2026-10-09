# 🚀 Deploying the Backend on Render (Connected to Vercel Frontend)

This guide walks you through deploying the **Quantum Portfolio Optimiser FastAPI backend** to [Render](https://render.com) and linking it to your **React frontend on Vercel**.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────┐           HTTP REST           ┌─────────────────────────────────┐
│         Vercel Frontend         │  ──────────────────────────>  │          Render Backend         │
│  https://your-app.vercel.app    │                               │  https://your-api.onrender.com  │
│  (React 19 + Vite + Tailwind 4) │  <──────────────────────────  │   (FastAPI + Qiskit 2.5 + QUBO) │
└─────────────────────────────────┘           JSON Response       └─────────────────────────────────┘
```

---

## ⚡ Option 1: 1-Click Blueprint Deploy (Fastest)

Render can automatically read the [`render.yaml`](render.yaml) file in the root of this repository.

1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right and select **Blueprint**.
3. Connect your GitHub repository (`Quantum-Portfolio`).
4. Render will parse `render.yaml` and configure:
   - Service name: `quantum-portfolio-backend`
   - Root directory: `backend`
   - Fast `uv` build command: `pip install --upgrade pip && pip install uv && uv pip install --system -r requirements.txt`
   - Start command: `python -m uvicorn qportfolio.api.main:app --host 0.0.0.0 --port $PORT`
   - Health check: `/api/health`
5. Click **Apply**. Render will build and deploy the service.

---

## 🛠️ Option 2: Manual Web Service Setup

If you prefer to configure the service manually in the Render UI:

1. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Web Service**.
2. Select your GitHub repository.
3. Configure the settings:
   - **Name**: `quantum-portfolio-backend` (or your preferred name)
   - **Region**: Choose the region closest to you (e.g., Singapore, Frankfurt, Oregon, Ohio)
   - **Branch**: `main` (or your active branch)
   - **Root Directory**: `backend`
   - **Runtime**: `Python`
   - **Build Command**:
     ```bash
     pip install --upgrade pip && pip install uv && uv pip install -r requirements.txt
     ```
     *(Using `uv` installs all dependencies in ~20 seconds instead of 10 minutes, avoiding Render's build timeout)*
   - **Start Command**:
     ```bash
     python -m uvicorn qportfolio.api.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: `Free`

4. Add **Environment Variables** in the form:
   | Key | Value | Description |
   |---|---|---|
   | `PYTHON_VERSION` | `3.13.0` | Pinned Python runtime |
   | `PYTHONUTF8` | `1` | Ensures clean UTF-8 string encoding |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` (or `*`) | Allows your Vercel frontend domain |

5. Under **Advanced Settings**:
   - Set **Health Check Path** to `/api/health`.

6. Click **Create Web Service**.

---

## 🐳 Option 3: Docker Deployment on Render

If you prefer containerized deployment, Render also supports Docker:
- Set **Runtime**: `Docker`
- The project includes both:
  - [`Dockerfile`](Dockerfile) at the root
  - [`backend/Dockerfile`](backend/Dockerfile) in the backend directory
- Both Dockerfiles use multi-stage `uv` binary caching for rapid container builds and expose port `8000`.

---

## 🔗 Connecting Your Vercel Frontend to Render

Once Render finishes deploying, it gives you a public URL (e.g., `https://quantum-portfolio-backend.onrender.com`).

### 1. Configure Vercel Environment Variable
1. Go to your [Vercel Dashboard](https://vercel.com) and select your frontend project.
2. Navigate to **Settings** -> **Environment Variables**.
3. Add a new variable:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://your-backend-name.onrender.com` *(no trailing slash)*
   - **Environments**: Check `Production`, `Preview`, and `Development`.
4. Click **Save**.

### 2. Redeploy Frontend
1. In Vercel, go to the **Deployments** tab.
2. Click the three dots `...` on your latest deployment -> **Redeploy**.
3. Vercel will rebuild the frontend with the new backend URL injected!

---

## ✅ Verifying Your Deployment

1. **Test the Backend Health Check**:
   Open in your browser:
   ```
   https://your-backend-name.onrender.com/api/health
   ```
   You should see:
   ```json
   {"ok": true, "version": "0.1.0"}
   ```

2. **Interactive API Documentation**:
   Visit the Swagger UI at:
   ```
   https://your-backend-name.onrender.com/docs
   ```

3. **Open Your Vercel App**:
   - Visit `https://your-app.vercel.app`.
   - The top banner should display:
     `Snapshot: as of 2026-10-07 | Estimation window: 2023-10-01 to 2025-09-30`
   - Click **Run Optimization** to verify live communication between Vercel and Render.

---

## 💡 Render Free Tier Tips

- **Cold Starts**: Render's free tier services spin down after 15 minutes of inactivity. When a new request arrives, it takes ~30–50 seconds to wake up.
- **Keep-Alive (Optional)**: To avoid cold starts during demos, you can set up a free uptime monitor (like [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com)) to ping `https://your-backend-name.onrender.com/api/health` every 10 minutes.
