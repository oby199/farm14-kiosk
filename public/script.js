// ==== GLOBAL STATE ====
let recognition;
let currentLanguage = 'en';
let isRecognitionActive = false;
let isFacePresent = false;
let hasWelcomed = false;
let hasAskedForLanguage = false;
let hasAskedForQuestion = false;
let isRecoveryInProgress = false;
let faceDetectionInitialized = false;
let speechSynthesisEngine = window.speechSynthesis;
let voiceReady = true; // No overlay, always ready
let availableVoices = [];

// ==== Q&A DATABASE ====
const qaData = [
  {
    questions: ["ما هي المحاصيل المزروعة", "شو المحاصيل المزروعة", "ما هي أنواع المحاصيل", "شو تزرعون"],
    answer: "تزرع المزرعة 14 مجموعة متنوعة من المحاصيل تشمل الخضروات والفواكه. من أهم المحاصيل: الطماطم، الخيار، الفلفل، الباذنجان، والفراولة. كما نزرع أيضاً الأعشاب الطبية مثل النعناع والريحان."
  },
  {
    questions: ["what crops is it", "what crops do you grow", "what do you grow", "which crops", "crops"],
    answer: "Farm 14 grows a variety of crops including tomatoes, cucumbers, peppers, eggplants, strawberries, and medicinal herbs such as mint and basil."
  },
  {
    questions: ["ما هو تاريخ المزرعة", "شو هوه تاريخ المزرعة", "متى تأسست المزرعة"],
    answer: "تأسست مزرعتنا في عام 2005 في منطقة ليوا. دعني أخبرك المزيد عن رحلتنا…"
  },
  {
    questions: ["شكرا", "شكراً", "شكرا جزيلا", "شكراً جزيلاً", "thank you", "thanks", "thank you very much"],
    answer: {
      ar: "شكراً جزيلاً لزيارتكم. نتمنى لكم يوماً سعيداً!",
      en: "Thank you for visiting. Have a great day!"
    }
  }
];

// ==== UI TRANSLATIONS ====
const translations = {
  en: {
    welcome: "Welcome to Farm 14",
    lookingForVisitor: "🔍 Looking for a visitor...",
    visitorDetected: "👋 Visitor detected!",
    askButton: "🎤 Ask about Farm 14",
    listening: "🎤 Listening...",
    answer: "Answer",
    thinking: "Thinking..."
  },
  ar: {
    welcome: "مرحباً بك في مزرعة 14",
    lookingForVisitor: "🔍 جاري البحث عن زائر...",
    visitorDetected: "👋 تم اكتشاف زائر!",
    askButton: "🎤 اسأل عن مزرعة 14",
    listening: "🎤 جاري الاستماع...",
    answer: "الإجابة",
    thinking: "جاري التفكير..."
  }
};

// ==== INITIALIZER ====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadVoices();

  await initializeFaceDetection();
  initializeSpeechRecognition();
  setupEventListeners();
  updateUIText();

  setInterval(updateDateTime, 1000);
  setInterval(updateEnvironmentData, 30000);

  updateEnvironmentData();
  updateDateTime();
}

// ==== FACE DETECTION ====
async function initializeFaceDetection() {
  if (faceDetectionInitialized) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');

  const video = document.getElementById('video');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    video.srcObject = stream;
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera access failed. Please allow camera permissions.');
    return;
  }

  await new Promise((res) => {
    video.onloadedmetadata = () => {
      video.play();
      res();
    };
  });

  faceDetectionInitialized = true;
  detectFace();
}

async function detectFace() {
  const canvas = document.getElementById('overlay');
  const cameraBox = document.getElementById('cameraBox');
  const scanningText = document.querySelector('.scanning-text');
  const displaySize = {
    width: cameraBox?.offsetWidth || 640,
    height: cameraBox?.offsetHeight || 480
  };

  faceapi.matchDimensions(canvas, displaySize);
  canvas.width = displaySize.width;
  canvas.height = displaySize.height;
  canvas.style.display = 'block';

  const video = document.getElementById('video');
  if (!video) return;

  const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
  const resized = faceapi.resizeResults(detections, displaySize);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (resized.length > 0) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    resized.forEach(d => {
      const box = d.box;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    });
    if (scanningText) scanningText.style.visibility = 'hidden';
    if (!isFacePresent) {
      isFacePresent = true;
      handleNewVisitor();
    }
  } else {
    if (scanningText) scanningText.style.visibility = 'visible';
    if (isFacePresent) {
      resetVisitorState();
    }
  }
  requestAnimationFrame(detectFace);
}

// ==== VISITOR FLOW ====
function handleNewVisitor() {
  speak("مرحبًا بك في مزرعة 14. Welcome to Farm 14");
  setTimeout(() => {
    speak("من فضلك اختر اللغة التي ترغب باستخدامها: العربية أم الإنجليزية؟ Please select the language you want: Arabic or English");
    hasAskedForLanguage = true;
    startRecognitionSafely();
  }, 6000);
}

function resetVisitorState() {
  isFacePresent = false;
  hasWelcomed = false;
  hasAskedForLanguage = false;
  hasAskedForQuestion = false;
  isRecognitionActive = false;
  if (recognition) recognition.stop();
  if (speechSynthesisEngine) speechSynthesisEngine.cancel();
  updateMicButton(false);
  document.querySelector('.scanning-text').textContent = translations[currentLanguage].lookingForVisitor;
}

// ==== SPEECH RECOGNITION ====
function initializeSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    isRecognitionActive = true;
    updateMicButton(true);
    document.body.classList.add('mic-pulsing');
    console.log('[SpeechRecognition] Started ✅');
  };
  
  recognition.onend = () => {
    isRecognitionActive = false;
    updateMicButton(false);
    document.body.classList.remove('mic-pulsing');
    console.log('[SpeechRecognition] Ended ❎');
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion)) {
      setTimeout(() => {
        startRecognitionSafely();
      }, 2000);
    }
  };

  recognition.onerror = (e) => {
    isRecognitionActive = false;
    updateMicButton(false);
    document.body.classList.remove('mic-pulsing');
    console.error('[SpeechRecognition] Error ❌:', e.error);
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase();
    console.log('[SpeechRecognition] onresult:', transcript);
    if (hasAskedForLanguage && !hasAskedForQuestion) {
      if (transcript.includes('arabic') || transcript.includes('العربية')) {
        currentLanguage = 'ar';
      } else if (transcript.includes('english') || transcript.includes('الإنجليزية')) {
        currentLanguage = 'en';
      } else {
        speak("Please say Arabic or English");
        return;
      }
      hasAskedForQuestion = true;
      setTimeout(() => {
        speak(currentLanguage === 'ar' ? "ماذا تريد أن تعرف عن مزرعة 14؟" : "What do you want to know about Farm 14?");
        recognition.lang = currentLanguage === 'ar' ? 'ar-SA' : 'en-US';
        if (!isRecognitionActive) {
          startRecognitionSafely();
        }
      }, 6000);
    } else {
      processUserQuery(transcript);
    }
  };
}

function startRecognitionSafely() {
  if (isRecognitionActive) {
    console.warn('[SpeechRecognition] Attempted to start while active. Ignored. ⚠️');
    return;
  }

  try {
    recognition.start();
  } catch (err) {
    console.error('[SpeechRecognition] Failed to start:', err);
  }
}

// ==== QUERY MATCHING ====
async function processUserQuery(query) {
  try {
    // Detect language
    const detectedLang = detectLanguage(query);
    currentLanguage = detectedLang;
    const t = translations[detectedLang];
    
    // Show loader/animated ellipsis
    const answerBox = document.getElementById('answer');
    if (answerBox) {
      answerBox.innerHTML = '<span class="thinking">...</span>';
      answerBox.style.opacity = '0.7';
    }

    // Check for thank you messages first
    const thankYouResponse = qaData.find(qa =>
      qa.questions.some(q =>
        query.toLowerCase().includes(q.toLowerCase())
      )
    );
    
    if (thankYouResponse && thankYouResponse.answer.ar) {
      // This is a thank you response
      const response = detectedLang === 'ar' ?
        thankYouResponse.answer.ar :
        thankYouResponse.answer.en;
      
      // Update answer box with response
      if (answerBox) {
        answerBox.textContent = response;
        answerBox.style.opacity = '1';
      }
      
      speak(response, detectedLang);
      
      // After speaking the answer, reset for next visitor
      setTimeout(() => {
        isFacePresent = false;
        hasWelcomed = false;
        const micButton = document.getElementById('micButton');
        if (micButton) micButton.disabled = true;
        const scanningText = document.querySelector('.scanning-text');
        if (scanningText) scanningText.textContent = 'Looking for a visitor...';
      }, 5000);
      return;
    }

    // Check for other Q&A
    const qa = qaData.find(qa =>
      qa.questions.some(q =>
        query.toLowerCase().includes(q.toLowerCase())
      )
    );
    
    if (qa) {
      // Update answer box with response
      if (answerBox) {
        answerBox.textContent = qa.answer;
        answerBox.style.opacity = '1';
      }
      
      speak(qa.answer, detectedLang);
      
      // After speaking the answer, reset for next visitor
      setTimeout(() => {
        isFacePresent = false;
        hasWelcomed = false;
        const micButton = document.getElementById('micButton');
        if (micButton) micButton.disabled = true;
        const scanningText = document.querySelector('.scanning-text');
        if (scanningText) scanningText.textContent = 'Looking for a visitor...';
      }, 5000);
    } else {
      const fallback = detectedLang === 'ar'
        ? 'عذراً، لم أفهم سؤالك. يرجى المحاولة مرة أخرى.'
        : "Sorry, I didn't understand your question. Please try again.";
      
      // Update answer box with fallback message
      if (answerBox) {
        answerBox.textContent = fallback;
        answerBox.style.opacity = '1';
      }
      
      speak(fallback, detectedLang);
      
      // After speaking the answer, reset for next visitor
      setTimeout(() => {
        isFacePresent = false;
        hasWelcomed = false;
        const micButton = document.getElementById('micButton');
        if (micButton) micButton.disabled = true;
        const scanningText = document.querySelector('.scanning-text');
        if (scanningText) scanningText.textContent = 'Looking for a visitor...';
      }, 5000);
    }
  } catch (error) {
    console.error('Error processing query:', error);
    const answerBox = document.getElementById('answer');
    if (answerBox) {
      answerBox.textContent = 'Sorry, I encountered an error. Please try again.';
      answerBox.style.opacity = '1';
    }
  }
}

// ==== HELPERS ====
function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

function speak(text) {
  console.log('[Speak] text:', text);
  if (!voiceReady) return;
  const parts = text.split(/[–.]/).filter(Boolean);
  let index = 0;
  const speakPart = () => {
    if (index >= parts.length) return;
    const lang = /[\u0600-\u06FF]/.test(parts[index]) ? 'ar-SA' : 'en-US';
    const utter = new SpeechSynthesisUtterance(parts[index].trim());
    utter.lang = lang;
    utter.voice = getBestVoice(lang);
    utter.onend = () => speakPart(++index);
    speechSynthesisEngine.cancel();
    setTimeout(() => speechSynthesisEngine.speak(utter), 100);
  };
  speakPart();
}

function getBestVoice(lang) {
  return availableVoices.find(v => v.lang === lang && v.localService)
    || availableVoices.find(v => v.lang === lang)
    || availableVoices.find(v => v.lang.startsWith(lang.split('-')[0]));
}

function loadVoices() {
  availableVoices = speechSynthesisEngine.getVoices();
  if (availableVoices.length) voiceReady = true;
}
speechSynthesisEngine.onvoiceschanged = loadVoices;

// ==== UI / MISC ====
function updateMicButton(active) {
  const btn = document.getElementById('micButton');
  if (!btn) return;
  btn.textContent = active ? translations[currentLanguage].listening : translations[currentLanguage].askButton;
  btn.style.background = active ? '#ff4444' : '#4CAF50';
}

function updateUIText() {
  const scanText = document.querySelector('.scanning-text');
  const micButton = document.getElementById('micButton');
  const answerHeader = document.querySelector('.answer-box h3');
  const t = translations[currentLanguage];
  if (scanText) scanText.textContent = t.lookingForVisitor;
  if (micButton) micButton.textContent = t.askButton;
  if (answerHeader) answerHeader.textContent = t.answer;
}

function updateDateTime() {
  const now = new Date();
  const el = document.getElementById('current-time');
  if (el) el.textContent = now.toLocaleString(currentLanguage === 'ar' ? 'ar-SA' : 'en-US');
}

function updateEnvironmentData() {
  document.getElementById('tempValue').textContent = '27.5';
  document.getElementById('humidityValue').textContent = '62';
}

function setupEventListeners() {
  document.getElementById('micButton')?.addEventListener('click', () => {
    if (!isRecognitionActive) {
      startRecognitionSafely();
    } else {
      recognition?.stop();
    }
  });
}
