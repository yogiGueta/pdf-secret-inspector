# PDF Secret Inspector

A Chrome extension that catches secrets in PDFs before you accidentally upload them to ChatGPT, Claude, or other AI platforms. Because we've all been there - uploading that document with API keys still in it.

## What This Actually Does

Ever had that "oh crap" moment after uploading a PDF with passwords or API keys to ChatGPT? This tool prevents that by:

1. **Watching your uploads** - Monitors when you try to upload PDFs to AI platforms
2. **Scanning for secrets** - Uses Prompt Security's ML API plus local regex patterns as backup
3. **Warning you first** - Shows a popup if it finds anything suspicious (doesn't block, just warns)
4. **Keeping you safe** - Helps avoid accidentally leaking credentials to AI services

## Quick Setup (5 minutes)

### What You Need
- Node.js 18+ 
- Chrome browser
- 5 minutes of your time

### 1. Get the Backend Running
```bash
cd backend-service
npm install
cp .env.example .env
# Optional: Add your Prompt Security API key to .env (works without it too)
npm run dev
```

Backend starts on `http://localhost:3000` - you'll see a "Server running" message.

### 2. Install the Chrome Extension
1. Open `chrome://extensions/`
2. Turn on "Developer mode" (top right)
3. Click "Load unpacked" 
4. Select the `chrome-extension` folder
5. You should see "PDF Secret Inspector" in your extensions

### 3. Test It Out
```bash
# This creates test PDFs for you
node create-test-pdf.js

# Now go to ChatGPT and try uploading:
# - clean-test.pdf (should say "all good")
# - secrets-test.pdf (should warn you about secrets)
```

## How It Actually Works

I built this with a two-layer approach because APIs can fail:

**Primary Detection (The Smart Way)**
- Uses Prompt Security's ML API - it's really good at catching secrets in context
- Understands when "password123" is actually a password vs just example text
- Returns confidence scores so you know how sure it is

**Backup Detection (The Regex Way)**  
When the API is down or slow, falls back to pattern matching:
- AWS keys: `AKIA[0-9A-Z]{16}`
- GitHub tokens: `ghp_[A-Za-z0-9]{36}` 
- JWT tokens, private keys, database URLs, etc.
- Not as smart, but catches the obvious stuff

The extension watches for file uploads on ChatGPT, Claude, and Bard, sends PDFs to the backend, and shows you a popup with results.

## Current Limitations (The Honest Truth)

**Platform Coverage**
- ✅ ChatGPT (both chatgpt.com and chat.openai.com)
- ✅ Claude (claude.ai) 
- ✅ Google Bard (bard.google.com)
- ❌ Other AI platforms (Perplexity, Poe, etc.) - would need to add selectors for each
- ❌ Firefox/Safari - Chrome extension only for now

**What It Can/Can't Do**
- ✅ Text-based secrets in PDFs
- ❌ Secrets embedded in images within PDFs (no OCR yet)
- ❌ Password-protected PDFs (can't extract text)
- ❌ Files over 10MB (configurable but hits memory limits)
- ❌ Non-PDF files (DOCX, images, etc.)

**The Reality Check**
- No user accounts or persistence - results disappear when you close the browser
- Basic error handling - if something breaks, you might not know why
- Stores files temporarily on disk (unencrypted)
- No audit trail for compliance folks
- Regex patterns can have false positives ("password" in a tutorial, etc.)

## If This Were Going to Production

**Security Stuff We'd Need**
- User authentication (can't have random people using your API)
- HTTPS everywhere (currently allows HTTP in dev)
- Encrypt those temporary files 
- Better input validation (people will try to break it)
- Rate limiting per user, not just per IP
- Audit logs for compliance teams

**Making It Actually Scale**
- Database instead of storing everything in memory
- Queue system for processing large files
- Multiple backend instances with load balancing
- Caching for files we've already seen
- Better error handling and retry logic
- Monitoring so you know when things break

**Features Users Would Actually Want**
- Support for more file types (DOCX, images with OCR)
- Custom secret patterns ("flag anything with 'ACME_SECRET'")
- Whitelist for known-safe files
- Team management and sharing settings
- Dashboard to see what's been scanned
- Slack notifications when secrets are found

## Performance Ideas for Scale

**If You Had Thousands of Users**
- Stream large files instead of loading everything into memory
- Process multiple files at once with worker threads
- Cache results for identical files (hash-based)
- Use Redis for session data and caching
- Background job processing for heavy lifting

**If You Had Enterprise Customers**
- Microservices architecture (PDF service, detection service, notification service)
- Kubernetes for auto-scaling based on load
- CDN for static assets
- Database read replicas for better performance
- Circuit breakers for when external APIs go down

## Tech Stack (What's Under the Hood)

**Backend**: Node.js + TypeScript + Express (because it's reliable and everyone knows it)
**PDF Processing**: pdf-parse library (simple and works)
**Chrome Extension**: Manifest V3 (because Google forced the upgrade)
**External API**: Prompt Security for the smart detection
**Logging**: Winston (because console.log doesn't cut it in production)

## Testing This Thing

**Quick Backend Test**
```bash
curl http://localhost:3000/api/health
# Should return {"status": "healthy"}

curl -X POST -F "pdf=@secrets-test.pdf" http://localhost:3000/api/inspect-pdf
# Should return detected secrets
```

**Extension Testing**
1. Go to ChatGPT
2. Try uploading the test PDFs (you can use the files from the 'test-files' folder)
3. Check browser console (F12) for any errors
4. Should see popup notifications

## When Things Go Wrong

**Extension not working?**
- Check if it's enabled in `chrome://extensions/`
- Look for errors in browser console
- Make sure backend is running on port 3000
- Try refreshing the ChatGPT page

**Backend issues?**
- Check the logs in `backend-service/logs/`
- Verify the Prompt Security API key (if using)
- Make sure port 3000 isn't blocked

## The Bottom Line

This was built as an interview assignment, so it's more "proof of concept" than "enterprise ready." It works, it's useful, but you'd want to harden it significantly before putting it in front of real users.

The core idea is solid though - catching secrets before they leave your machine is way better than trying to recall them after they're already in an AI system's training data.

---

*Built with the assumption that developers will try to break things, because that's what we do.*
