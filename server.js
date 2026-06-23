const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.options("*", cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "STRYD API running ✓" });
});

app.post("/api/coach", async (req, res) => {
  try {
    const { messages, profile, recentSessions } = req.body;
    if (!messages) return res.status(400).json({ error: "messages required" });

    const ctx = profile
      ? `Athlete: ${profile.firstName}, age ${profile.age}, ${profile.height}cm, ${profile.weight}kg. Goal: ${profile.goal?.label}. Sport: ${profile.sport?.label}.`
      : "";

    const recent = recentSessions?.length > 0
      ? `Recent: ${recentSessions.map(s=>`${s.sport}: ${s.dist}, ${s.time}`).join("; ")}.`
      : "";

    const systemText = `You are a professional athletic coach for STRYD fitness app. ${ctx} ${recent} Be concise (under 90 words unless asked for a plan). Give specific actionable advice. Max 2 emojis.`;

    // Build Gemini conversation
    const geminiMessages = messages.slice(-8).map(m => ({
      role: m.role === "ai" ? "model" : "user",
      parts: [{ text: m.text }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", err);
      return res.status(500).json({ error: "AI error" });
    }

    const data  = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Try again.";
    res.json({ reply });

  } catch (err) {
    console.error("Coach error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/analyse", async (req, res) => {
  try {
    const { session, profile } = req.body;
    if (!session) return res.status(400).json({ error: "session required" });

    const prompt = `Analyse this ${session.sport || "run"} in under 80 words. Be specific. 1 strength, 1 improvement:
Distance: ${session.dist}, Time: ${session.duration}, Pace: ${session.avgPace}/km, Calories: ${session.calories}kcal
${profile ? `Athlete goal: ${profile.goal?.label}` : ""}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400 },
      }),
    });

    const data     = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.json({ analysis });

  } catch (err) {
    res.status(500).json({ error: "Analysis failed" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`STRYD API on port ${PORT}`));
