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
let voiceReady = false;
let availableVoices = [];
let selectedVoices = {
  en: null,
  ar: null
};
let voiceDetectionRetries = 0;
const MAX_VOICE_RETRIES = 3;
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ==== VOICE CONFIGURATION ====
const voiceConfig = {
  en: {
    rate: isMobileDevice ? 0.9 : 1.0,
    pitch: isMobileDevice ? 0.9 : 1.0,
    volume: 1.0,
    preferredNames: ['Google UK English Female', 'Microsoft David Desktop', 'Samantha', 'Karen', 'Daniel']
  },
  ar: {
    rate: isMobileDevice ? 0.8 : 0.9,
    pitch: isMobileDevice ? 0.9 : 1.0,
    volume: 1.0,
    preferredNames: ['Google العربية', 'Microsoft Hoda Desktop', 'Tarik', 'Laila', 'Amira']
  }
};

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
    welcome: "👋 Welcome to Farm 14",
    lookingForVisitor: "🔍 Looking for a visitor...",
    visitorDetected: "👋 Visitor detected!",
    askButton: "🎤 Ask about Farm 14",
    listening: "🎤 Listening...",
    answer: "Answer",
    thinking: "Thinking...",
    chooseLanguage: "🌐 Please choose a language: English or Arabic",
    whatToKnow: "🔍 What do you want to know about our farm?"
  },
  ar: {
    welcome: "👋 مرحباً بك في مزرعة 14",
    lookingForVisitor: "🔍 جاري البحث عن زائر...",
    visitorDetected: "👋 تم اكتشاف زائر!",
    askButton: "🎤 اسأل عن مزرعة 14",
    listening: "🎤 جاري الاستماع...",
    answer: "الإجابة",
    thinking: "جاري التفكير...",
    chooseLanguage: "🌐 من فضلك اختر اللغة: العربية أم الإنجليزية",
    whatToKnow: "🔍 ماذا تريد أن تعرف عن مزرعتنا؟"
  }
};

// ==== INITIALIZER ====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Handle tap to begin overlay
  const tapOverlay = document.getElementById('tap-to-begin-overlay');
  if (tapOverlay) {
    tapOverlay.addEventListener('click', async () => {
      tapOverlay.style.display = 'none';
      
      // Initialize all components after tap
      await loadVoices();
      await initializeFaceDetection();
      initializeSpeechRecognition();
      setupEventListeners();
      updateUIText();
      
      // Start periodic updates
      setInterval(updateDateTime, 1000);
      setInterval(updateEnvironmentData, 30000);
      
      // Initial updates
      updateEnvironmentData();
      updateDateTime();
    });
  }
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
      // Reset voice detection retries when new face is detected
      voiceDetectionRetries = 0;
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
  // Step 1: Welcome message
  speak(translations.en.welcome);
  
  // Step 2: Ask for language choice after 3 seconds
  setTimeout(() => {
    speak(translations.en.chooseLanguage);
    hasAskedForLanguage = true;
    startRecognitionSafely();
  }, 3000);
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
    
    // Only auto-restart if we're still in the conversation flow
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion)) {
      if (voiceDetectionRetries < MAX_VOICE_RETRIES) {
        voiceDetectionRetries++;
        console.log(`[SpeechRecognition] Retry attempt ${voiceDetectionRetries} of ${MAX_VOICE_RETRIES}`);
        setTimeout(() => {
          startRecognitionSafely();
        }, 2000);
      } else {
        console.log('[SpeechRecognition] Max retries reached, waiting for face detection');
        voiceDetectionRetries = 0;
        // Stop speaking and wait for new face detection
        if (speechSynthesisEngine) {
          speechSynthesisEngine.cancel();
        }
      }
    }
  };

  recognition.onerror = (e) => {
    isRecognitionActive = false;
    updateMicButton(false);
    document.body.classList.remove('mic-pulsing');
    console.error('[SpeechRecognition] Error ❌:', e.error);
    
    // If we're still in conversation, try to recover
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion)) {
      if (voiceDetectionRetries < MAX_VOICE_RETRIES) {
        voiceDetectionRetries++;
        console.log(`[SpeechRecognition] Retry attempt ${voiceDetectionRetries} of ${MAX_VOICE_RETRIES}`);
        setTimeout(() => {
          startRecognitionSafely();
        }, 2000);
      } else {
        console.log('[SpeechRecognition] Max retries reached, waiting for face detection');
        voiceDetectionRetries = 0;
        // Stop speaking and wait for new face detection
        if (speechSynthesisEngine) {
          speechSynthesisEngine.cancel();
        }
      }
    }
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase();
    console.log('[SpeechRecognition] Result:', transcript);
    
    // Reset retry counter on successful voice detection
    voiceDetectionRetries = 0;
    
    if (hasAskedForLanguage && !hasAskedForQuestion) {
      // Handle language selection
      if (transcript.includes('arabic') || transcript.includes('العربية')) {
        currentLanguage = 'ar';
      } else if (transcript.includes('english') || transcript.includes('الإنجليزية')) {
        currentLanguage = 'en';
      } else {
        // If language not recognized, ask again
        speak(translations[currentLanguage].chooseLanguage);
        return;
      }
      
      // Language selected, now ask for question
      hasAskedForQuestion = true;
      setTimeout(() => {
        speak(translations[currentLanguage].whatToKnow);
        recognition.lang = currentLanguage === 'ar' ? 'ar-SA' : 'en-US';
        startRecognitionSafely();
      }, 2000);
    } else {
      // Handle the actual question
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
  if (!voiceReady) {
    console.warn('[Speak] Voices not ready yet');
    return;
  }

  // Split text into sentences and language parts
  const parts = text.split(/[–.]/).filter(Boolean);
  let index = 0;

  const speakPart = () => {
    if (index >= parts.length) return;
    
    const part = parts[index].trim();
    const isArabic = /[\u0600-\u06FF]/.test(part);
    const lang = isArabic ? 'ar' : 'en';
    const config = voiceConfig[lang];
    const voice = selectedVoices[lang];
    
    if (!voice) {
      console.warn(`[Speak] No voice available for ${lang}`);
      index++;
      speakPart();
      return;
    }

    const utter = new SpeechSynthesisUtterance(part);
    utter.voice = voice;
    utter.lang = isArabic ? 'ar-SA' : 'en-US';
    utter.rate = config.rate;
    utter.pitch = config.pitch;
    utter.volume = config.volume;

    // Add event listeners for better control
    utter.onstart = () => {
      console.log(`[Speak] Started speaking (${lang}):`, part);
      document.body.classList.add('speaking');
    };

    utter.onend = () => {
      console.log(`[Speak] Finished speaking (${lang}):`, part);
      document.body.classList.remove('speaking');
      index++;
      speakPart();
    };

    utter.onerror = (event) => {
      console.error('[Speak] Error:', event);
      document.body.classList.remove('speaking');
      index++;
      speakPart();
    };

    // Cancel any ongoing speech
    speechSynthesisEngine.cancel();
    
    // Small delay to ensure clean start
    setTimeout(() => {
      try {
        speechSynthesisEngine.speak(utter);
        // Force resume on mobile devices
        if (isMobileDevice) {
          speechSynthesisEngine.resume();
        }
      } catch (error) {
        console.error('[Speak] Error starting speech:', error);
        // Try fallback voice if available
        if (utter.voice) {
          utter.voice = null; // Use default voice
          try {
            speechSynthesisEngine.speak(utter);
            if (isMobileDevice) {
              speechSynthesisEngine.resume();
            }
          } catch (fallbackError) {
            console.error('[Speak] Fallback voice also failed:', fallbackError);
          }
        }
      }
    }, 100);
  };

  speakPart();
}

function loadVoices() {
  // Handle Chrome's async voice loading
  if (speechSynthesisEngine.getVoices().length === 0) {
    speechSynthesisEngine.addEventListener('voiceschanged', () => {
      availableVoices = speechSynthesisEngine.getVoices();
      console.log('[Voices] Available voices:', availableVoices.length);
      
      // Select best voices for each language
      selectedVoices.en = findBestVoice('en-US', voiceConfig.en.preferredNames);
      selectedVoices.ar = findBestVoice('ar-SA', voiceConfig.ar.preferredNames);
      
      if (selectedVoices.en || selectedVoices.ar) {
        voiceReady = true;
        console.log('[Voices] Selected voices:', {
          en: selectedVoices.en?.name,
          ar: selectedVoices.ar?.name
        });
      }
    });
  } else {
    availableVoices = speechSynthesisEngine.getVoices();
    console.log('[Voices] Available voices:', availableVoices.length);
    
    // Select best voices for each language
    selectedVoices.en = findBestVoice('en-US', voiceConfig.en.preferredNames);
    selectedVoices.ar = findBestVoice('ar-SA', voiceConfig.ar.preferredNames);
    
    if (selectedVoices.en || selectedVoices.ar) {
      voiceReady = true;
      console.log('[Voices] Selected voices:', {
        en: selectedVoices.en?.name,
        ar: selectedVoices.ar?.name
      });
    }
  }
}

function findBestVoice(lang, preferredNames) {
  // First try preferred voices
  for (const name of preferredNames) {
    const voice = availableVoices.find(v => v.name === name);
    if (voice) return voice;
  }
  
  // Then try any voice with exact language match
  const exactMatch = availableVoices.find(v => v.lang === lang && v.localService);
  if (exactMatch) return exactMatch;
  
  // Then try any voice with language match
  const langMatch = availableVoices.find(v => v.lang === lang);
  if (langMatch) return langMatch;
  
  // Finally try any voice with language prefix match
  const prefixMatch = availableVoices.find(v => v.lang.startsWith(lang.split('-')[0]));
  return prefixMatch || null;
}

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

  // Setup suggested questions click handlers
  const suggestedQuestions = document.querySelectorAll('.suggested-questions li');
  suggestedQuestions.forEach(question => {
    question.addEventListener('click', () => {
      const text = question.textContent.trim();
      // Remove emoji from the text
      const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      processUserQuery(cleanText);
    });
  });
}
