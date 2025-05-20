const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");
const app = express();
const port = 8080;

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certificates", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certificates", "cert.pem")),
};

// Hardcoded Q&A pairs in both Arabic and English
const qaData = [
    {
        questions: ['محاصيل', 'محاصيل المزرعة', 'ما هي المحاصيل', 'زراعة', 'ماذا تزرع'],
        answer: 'تزرع المزرعة 14 مجموعة متنوعة من المحاصيل تشمل الخضروات والفواكه. من أهم المحاصيل: الطماطم، الخيار، الفلفل، الباذنجان، والفراولة. كما نزرع أيضاً الأعشاب الطبية مثل النعناع والريحان.'
    },
    {
        questions: ['crops', 'what crops', 'what do you grow', 'farming', 'agriculture'],
        answer: 'Farm 14 grows a variety of crops including vegetables and fruits. Our main crops include tomatoes, cucumbers, peppers, eggplants, and strawberries. We also grow medicinal herbs such as mint and basil.'
    },
    {
        questions: ['تاريخ', 'متى تأسست', 'متى بدأت', 'تاريخ المزرعة'],
        answer: 'تأسست المزرعة 14 في عام 2005 في منطقة ليوا بأبوظبي. منذ ذلك الحين، قمنا بتطوير عملياتنا الزراعية وتوسيع نطاق إنتاجنا.'
    },
    {
        questions: ['history', 'when founded', 'when started', 'farm history'],
        answer: 'Farm 14 was established in 2005 in Liwa, Abu Dhabi. Since then, we have developed our agricultural operations and expanded our production.'
    }
];

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Something broke!');
});

// Handle POST requests to the root
app.post("/", (req, res) => {
    try {
        const { query } = req.body;
        console.log("Received query:", query);

        // Determine if the query is in Arabic
        const isArabic = /[\u0600-\u06FF]/.test(query);

        // Find matching Q&A
        const matched = qaData.find(item =>
            item.questions.some(q => query.trim().toLowerCase().includes(q.toLowerCase()))
        );

        const response = matched
            ? matched.answer
            : isArabic
                ? "عذراً، لم أفهم سؤالك. الرجاء المحاولة مرة أخرى."
                : "Sorry, I didn't understand your question. Please try again.";

        console.log("Sending response:", response);
        res.json({ response });
    } catch (error) {
        console.error("Error processing query:", error);
        res.status(500).json({ error: "Failed to process your request" });
    }
});

// Handle GET requests to the root
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server with error handling
const server = https.createServer(httpsOptions, app).listen(port, "0.0.0.0", () => {
    const address = server.address();
    console.log(`Server running at:`);
    console.log(`- Local: https://localhost:${port}`);
    console.log(`- Network: https://172.20.10.11:${port}`);
    console.log(`\nTo access from your phone:`);
    console.log(`1. Make sure your phone is on the same WiFi network`);
    console.log(`2. Open your phone's browser and go to: https://172.20.10.11:${port}`);
    console.log(`3. Accept the security warning (self-signed certificate)`);
    console.log(`\nServer details:`);
    console.log(`- Address: ${address.address}`);
    console.log(`- Port: ${address.port}`);
    console.log(`- Family: ${address.family}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`);
    } else {
        console.error('Server error:', err);
    }
});
