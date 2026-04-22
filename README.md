# User Journey Auditor

Chrome Extension + FastAPI + LangGraph pipeline that extracts interactive page elements, detects deterministic user journeys, scores friction, and asks LLM (optional) for a structured UX narrative.

## Run

### 1) Backend

```bash
cd user-journey-auditor/backend
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### 2) Extension (build)

```bash
cd ..
npm install
npm run build
```

### 3) Load in Chrome

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select the `user-journey-auditor/dist/` folder

### 4) Test

- Open any website
- Click the extension icon
- Click **Audit This Page**

## Tests

```bash
cd user-journey-auditor
pytest -q
```

