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

// Speech queue management
let speechQueue = [];
let isSpeaking = false;
let speechTimeout = null;

// Voice detection configuration
const VOICE_CONFIG = {
  confidenceThreshold: 0.1,
  minWordsForConfidence: 1,
  maxRetries: 2,
  retryDelay: 1500,
  recoveryDelay: 1000,
  speechDelay: 800, // Delay between speech segments
  recognitionDelay: 1200 // Delay before starting recognition after speech
};

// Update mobile-specific speech synthesis configuration
const MOBILE_SPEECH_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  checkInterval: 2000,
  resumeInterval: 500,
  forceResumeAttempts: 2,
  maxQueueSize: 5,
  recoveryTimeout: 5000,
  voiceLoadTimeout: 3000
};

// Enhanced mobile speech synthesis state tracking
let mobileSpeechState = {
  isPaused: false,
  retryCount: 0,
  lastResumeAttempt: 0,
  forceResumeCount: 0,
  lastError: null,
  recoveryInProgress: false,
  voiceLoadAttempts: 0,
  lastVoiceCheck: 0
};

// ==== ROTATING QUESTIONS ====
const rotatingQuestions = [
  "What crops do you grow?",
  "What's the farm's history?",
  "ما هي المحاصيل المزروعة؟",
  "متى تأسست المزرعة؟",
  "How do you grow your crops?",
  "What makes Farm 14 special?",
  "كيف تزرعون المحاصيل؟",
  "ما الذي يميز مزرعة 14؟",
  "Are your crops organic?",
  "What's the best time to visit?",
  "هل المحاصيل عضوية؟",
  "ما هو أفضل وقت للزيارة؟",
  "How big is the farm?",
  "What's your farming method?",
  "ما هي مساحة المزرعة؟",
  "ما هي طريقة الزراعة المستخدمة؟"
];

let currentQuestionIndex = 0;
let questionRotationInterval;

function startQuestionRotation() {
  const questionContainer = document.querySelector('.question-container');
  const questionText = document.querySelector('.question-text');
  
  if (!questionContainer || !questionText) return;

  function updateQuestion() {
    // Fade out
    questionContainer.classList.remove('visible');
    
    // Wait for fade out, then update and fade in
    setTimeout(() => {
      questionText.textContent = rotatingQuestions[currentQuestionIndex];
      currentQuestionIndex = (currentQuestionIndex + 1) % rotatingQuestions.length;
      questionContainer.classList.add('visible');
    }, 500);
  }

  // Initial question
  questionText.textContent = rotatingQuestions[0];
  questionContainer.classList.add('visible');

  // Start rotation
  questionRotationInterval = setInterval(updateQuestion, 5000);
}

function stopQuestionRotation() {
  if (questionRotationInterval) {
    clearInterval(questionRotationInterval);
  }
}

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
    questions: ["ما هي المحاصيل المزروعة", "شو المحاصيل المزروعة", "ما هي أنواع المحاصيل", "شو تزرعون", "ما هي المحاصيل المزروعة؟"],
    answer: "تزرع المزرعة 14 مجموعة متنوعة من المحاصيل تشمل الخضروات والفواكه. من أهم المحاصيل: الطماطم، الخيار، الفلفل، الباذنجان، والفراولة. كما نزرع أيضاً الأعشاب الطبية مثل النعناع والريحان."
  },
  {
    questions: ["what crops is it", "what crops do you grow", "what do you grow", "which crops", "crops", "how do you grow your crops"],
    answer: "Farm 14 grows a variety of crops including tomatoes, cucumbers, peppers, eggplants, strawberries, and medicinal herbs such as mint and basil. We use sustainable farming methods and focus on quality over quantity."
  },
  {
    questions: ["ما هو تاريخ المزرعة", "شو هوه تاريخ المزرعة", "متى تأسست المزرعة", "متى تأسست المزرعة؟"],
    answer: "تأسست مزرعتنا في عام 2005 في منطقة ليوا. بدأنا بمشروع صغير وتمكنا من التوسع تدريجياً حتى أصبحت من أكبر المزارع في المنطقة. نحن نفتخر بتاريخنا وتراثنا الزراعي."
  },
  {
    questions: ["what's the farm's history", "farm history", "when was the farm established", "how old is the farm"],
    answer: "Farm 14 was established in 2005 in the Liwa region. We started as a small project and gradually expanded to become one of the largest farms in the area. We take pride in our agricultural heritage and sustainable farming practices."
  },
  {
    questions: ["what makes farm 14 special", "what's special about farm 14", "why is farm 14 unique", "ما الذي يميز مزرعة 14؟"],
    answer: {
      en: "Farm 14 is special because we combine traditional farming wisdom with modern sustainable practices. We focus on organic methods, water conservation, and maintaining biodiversity. Our commitment to quality and environmental responsibility sets us apart.",
      ar: "تتميز مزرعة 14 بجمعها بين الحكمة الزراعية التقليدية والممارسات المستدامة الحديثة. نركز على الأساليب العضوية، وترشيد استهلاك المياه، والحفاظ على التنوع البيولوجي. التزامنا بالجودة والمسؤولية البيئية هو ما يميزنا."
    }
  },
  {
    questions: ["are your crops organic", "is it organic", "هل المحاصيل عضوية؟", "هل تستخدمون الزراعة العضوية"],
    answer: {
      en: "Yes, we practice organic farming methods. We avoid synthetic pesticides and fertilizers, focusing instead on natural pest control and organic soil enrichment. Our crops are grown with care for both quality and environmental sustainability.",
      ar: "نعم، نستخدم أساليب الزراعة العضوية. نتجنب المبيدات والأسمدة الاصطناعية، وبدلاً من ذلك نركز على مكافحة الآفات الطبيعية وإثراء التربة العضوية. يتم زراعة محاصيلنا بعناية من حيث الجودة والاستدامة البيئية."
    }
  },
  {
    questions: ["what's the best time to visit", "when should i visit", "best time to visit", "ما هو أفضل وقت للزيارة؟"],
    answer: {
      en: "The best time to visit Farm 14 is during the cooler months from October to April. During this period, you can see our crops at their best, and the weather is perfect for a farm tour. We're open daily from 8 AM to 6 PM.",
      ar: "أفضل وقت لزيارة مزرعة 14 هو خلال الأشهر الباردة من أكتوبر إلى أبريل. خلال هذه الفترة، يمكنك رؤية محاصيلنا في أفضل حالاتها، والطقس مثالي لجولة في المزرعة. نحن مفتوحون يومياً من الساعة 8 صباحاً حتى 6 مساءً."
    }
  },
  {
    questions: ["how big is the farm", "farm size", "what's the farm's size", "ما هي مساحة المزرعة؟"],
    answer: {
      en: "Farm 14 spans over 50 acres of cultivated land. We have dedicated sections for different types of crops, greenhouses for year-round production, and a visitor center. Our size allows us to maintain diverse crops while ensuring quality control.",
      ar: "تمتد مزرعة 14 على مساحة تزيد عن 50 فدان من الأراضي المزروعة. لدينا أقسام مخصصة لأنواع مختلفة من المحاصيل، وبيوت بلاستيكية للإنتاج على مدار العام، ومركز للزوار. حجمنا يسمح لنا بالحفاظ على تنوع المحاصيل مع ضمان مراقبة الجودة."
    }
  },
  {
    questions: ["what's your farming method", "how do you farm", "farming techniques", "ما هي طريقة الزراعة المستخدمة؟"],
    answer: {
      en: "We use a combination of traditional and modern sustainable farming methods. This includes crop rotation, natural pest control, drip irrigation, and soil conservation techniques. We focus on maintaining soil health and biodiversity while maximizing water efficiency.",
      ar: "نستخدم مزيجاً من الطرق الزراعية التقليدية والحديثة المستدامة. وهذا يشمل تناوب المحاصيل، ومكافحة الآفات الطبيعية، والري بالتنقيط، وتقنيات الحفاظ على التربة. نركز على الحفاظ على صحة التربة والتنوع البيولوجي مع تعظيم كفاءة استخدام المياه."
    }
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
    lookingForVisitor: "Looking for a visitor...",
    visitorDetected: "Visitor detected!",
    askButton: "Ask about Farm 14",
    listening: "Listening...",
    answer: "Answer",
    thinking: "Thinking...",
    chooseLanguage: "Please choose a language: English or Arabic",
    whatToKnow: "What do you want to know about our farm?"
  },
  ar: {
    welcome: "مرحباً بك في مزرعة 14",
    lookingForVisitor: "جاري البحث عن زائر...",
    visitorDetected: "تم اكتشاف زائر!",
    askButton: "اسأل عن مزرعة 14",
    listening: "جاري الاستماع...",
    answer: "الإجابة",
    thinking: "جاري التفكير...",
    chooseLanguage: "من فضلك اختر اللغة: العربية أم الإنجليزية",
    whatToKnow: "ماذا تريد أن تعرف عن مزرعتنا؟"
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
      startQuestionRotation(); // Start rotating questions
      
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
  
  // Step 2: Ask for language choice after appropriate delay
  const welcomeDelay = calculateDelay(translations.en.welcome, 'en');
  speechTimeout = setTimeout(() => {
    speak(translations.en.chooseLanguage);
    hasAskedForLanguage = true;
    // Add a delay after speech synthesis before starting recognition
    speechTimeout = setTimeout(() => {
      if (!isRecognitionActive && !isSpeaking) {
        startRecognitionSafely();
      }
    }, VOICE_CONFIG.recognitionDelay);
  }, welcomeDelay);
}

function resetVisitorState() {
  isFacePresent = false;
  hasWelcomed = false;
  hasAskedForLanguage = false;
  hasAskedForQuestion = false;
  isRecognitionActive = false;
  if (recognition) recognition.stop();
  clearSpeechQueue();
  updateMicButton(false);
  document.querySelector('.scanning-text').textContent = translations[currentLanguage].lookingForVisitor;
}

// ==== SPEECH RECOGNITION ====
function initializeSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
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
    
    // Only auto-restart if we're still in the conversation flow and not speaking
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion) && !isSpeaking) {
      if (voiceDetectionRetries < VOICE_CONFIG.maxRetries) {
        voiceDetectionRetries++;
        console.log(`[SpeechRecognition] Retry attempt ${voiceDetectionRetries} of ${VOICE_CONFIG.maxRetries}`);
        setTimeout(() => {
          startRecognitionSafely();
        }, VOICE_CONFIG.retryDelay);
      } else {
        console.log('[SpeechRecognition] Max retries reached, waiting for face detection');
        voiceDetectionRetries = 0;
      }
    }
  };

  recognition.onresult = (e) => {
    // Get the most confident result
    let bestResult = null;
    let bestConfidence = 0;

    // Update live transcript with interim results
    const liveTranscript = document.getElementById('live-transcript');
    if (liveTranscript) {
      const interimTranscript = Array.from(e.results)
        .filter(result => !result.isFinal)
        .map(result => result[0].transcript)
        .join('');
      
      if (interimTranscript) {
        liveTranscript.textContent = interimTranscript;
      }
    }

    for (let i = 0; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) {
        for (let j = 0; j < result.length; j++) {
          if (result[j].confidence > bestConfidence) {
            bestResult = result[j];
            bestConfidence = result[j].confidence;
          }
        }
      }
    }

    if (!bestResult) {
      console.log('[SpeechRecognition] No final results yet');
      return;
    }

    const transcript = bestResult.transcript.trim();
    const confidence = bestResult.confidence;
    
    // 🔍 Log the transcript live on screen
    const transcriptDisplay = document.getElementById('live-transcript');
    if (transcriptDisplay) {
      transcriptDisplay.textContent = `"${transcript}" (conf: ${confidence.toFixed(2)})`;
    }
    
    console.log('[SpeechRecognition] Result:', {
      transcript,
      confidence,
      isFinal: true
    });
    
    // Process any result with confidence above threshold
    if (confidence >= VOICE_CONFIG.confidenceThreshold) {
      // Reset retry counter on any result
      voiceDetectionRetries = 0;
      
      if (hasAskedForLanguage && !hasAskedForQuestion) {
        // Handle language selection with confidence check
        const languageSelection = detectLanguageSelection(transcript);
        console.log('[LanguageDetection] Raw:', transcript);
        console.log('[LanguageDetection] Detected:', languageSelection);
        
        if (languageSelection) {
          currentLanguage = languageSelection;
          hasAskedForQuestion = true;

          const languageDelay = calculateDelay(translations[currentLanguage].chooseLanguage, currentLanguage);
          setTimeout(() => {
            speak(translations[currentLanguage].whatToKnow);
            recognition.lang = currentLanguage === 'ar' ? 'ar-SA' : 'en-US';
            startRecognitionSafely();
          }, languageDelay);
        } else {
          // Language not detected — retry prompt
          speak(translations[currentLanguage].chooseLanguage);
          setTimeout(() => {
            startRecognitionSafely(); // Restart listening again
          }, calculateDelay(translations[currentLanguage].chooseLanguage, currentLanguage));
        }
      } else {
        // Handle the actual question
        processUserQuery(transcript);
      }
    } else {
      console.log(`[SpeechRecognition] Low confidence (${confidence}), waiting for better result`);
    }
  };

  recognition.onerror = (e) => {
    isRecognitionActive = false;
    updateMicButton(false);
    document.body.classList.remove('mic-pulsing');
    console.error('[SpeechRecognition] Error ❌:', e.error);
    
    // Handle specific error types
    switch (e.error) {
      case 'no-speech':
        console.log('[SpeechRecognition] No speech detected, retrying...');
        break;
      case 'audio-capture':
        console.error('[SpeechRecognition] Audio capture failed');
        break;
      case 'network':
        console.error('[SpeechRecognition] Network error');
        break;
      default:
        console.error('[SpeechRecognition] Unknown error:', e.error);
    }
    
    // If we're still in conversation and not speaking, try to recover
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion) && !isSpeaking) {
      if (voiceDetectionRetries < VOICE_CONFIG.maxRetries) {
        voiceDetectionRetries++;
        console.log(`[SpeechRecognition] Retry attempt ${voiceDetectionRetries} of ${VOICE_CONFIG.maxRetries}`);
        setTimeout(() => {
          startRecognitionSafely();
        }, VOICE_CONFIG.retryDelay);
      } else {
        console.log('[SpeechRecognition] Max retries reached, waiting for face detection');
        voiceDetectionRetries = 0;
      }
    }
  };
}

function startRecognitionSafely() {
  if (isRecognitionActive) {
    console.log('[SpeechRecognition] Already active, skipping start');
    return;
  }

  if (isSpeaking) {
    console.log('[SpeechRecognition] Speaking in progress, will start after speech');
    return;
  }

  try {
    recognition.start();
    isRecognitionActive = true;
    console.log('[SpeechRecognition] Started safely ✅');
  } catch (err) {
    console.error('[SpeechRecognition] Failed to start:', err);
    isRecognitionActive = false;
  }
}

function stopRecognitionSafely() {
  if (!isRecognitionActive) {
    console.warn('[SpeechRecognition] Attempted to stop while inactive. Ignored. ⚠️');
    return;
  }

  try {
    recognition.stop();
    isRecognitionActive = false;
    console.log('[SpeechRecognition] Stopped safely ✅');
  } catch (err) {
    console.error('[SpeechRecognition] Failed to stop:', err);
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
        resetVisitorState();
      }, calculateDelay(response, detectedLang));
      return;
    }

    // Check for other Q&A
    const qa = qaData.find(qa =>
      qa.questions.some(q =>
        query.toLowerCase().includes(q.toLowerCase())
      )
    );
    
    if (qa) {
      const response = typeof qa.answer === 'object' ? 
        qa.answer[detectedLang] : 
        qa.answer;
      
      // Update answer box with response
      if (answerBox) {
        answerBox.textContent = response;
        answerBox.style.opacity = '1';
      }
      
      speak(response, detectedLang);
      
      // After speaking the answer, reset for next visitor
      setTimeout(() => {
        resetVisitorState();
      }, calculateDelay(response, detectedLang));
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
        resetVisitorState();
      }, calculateDelay(fallback, detectedLang));
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
  // Check for Arabic characters with a more comprehensive range
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicPattern.test(text) ? 'ar' : 'en';
}

// Calculate appropriate delay based on message length and language
function calculateDelay(text, lang) {
  // Average speaking rate (words per minute)
  const wordsPerMinute = lang === 'ar' ? 120 : 150;
  
  // Count words (rough estimation)
  const words = text.trim().split(/\s+/).length;
  
  // Calculate time in milliseconds (add 1 second buffer)
  const baseTime = (words / wordsPerMinute) * 60 * 1000;
  return Math.max(baseTime + 1000, 2000); // Minimum 2 seconds delay
}

function speak(text) {
  console.log('[Speak] Adding to queue:', text);
  if (!voiceReady) {
    console.warn('[Speak] Voices not ready yet');
    return;
  }

  // Clear any existing speech timeout
  if (speechTimeout) {
    clearTimeout(speechTimeout);
  }

  // Split text into sentences and language parts
  const parts = text.split(/[–.]/).filter(Boolean);
  
  // Add each part to the queue
  parts.forEach(part => {
    const trimmedPart = part.trim();
    if (trimmedPart) {
      speechQueue.push(trimmedPart);
    }
  });

  // Start processing queue if not already speaking
  if (!isSpeaking) {
    processSpeechQueue();
  }
}

function processSpeechQueue() {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    // Enhanced mobile speech state reset
    mobileSpeechState = {
      isPaused: false,
      retryCount: 0,
      lastResumeAttempt: 0,
      forceResumeCount: 0,
      lastError: null,
      recoveryInProgress: false,
      voiceLoadAttempts: 0,
      lastVoiceCheck: Date.now()
    };
    
    if (isFacePresent && (hasAskedForLanguage || hasAskedForQuestion)) {
      speechTimeout = setTimeout(() => {
        if (!isRecognitionActive && !isSpeaking) {
          startRecognitionSafely();
        }
      }, VOICE_CONFIG.recognitionDelay);
    }
    return;
  }

  // Check queue size for mobile devices
  if (isMobileDevice && speechQueue.length > MOBILE_SPEECH_CONFIG.maxQueueSize) {
    console.warn('[MobileSpeech] Queue too large, trimming...');
    speechQueue = speechQueue.slice(0, MOBILE_SPEECH_CONFIG.maxQueueSize);
  }

  isSpeaking = true;
  if (isRecognitionActive) {
    try {
      recognition.stop();
      isRecognitionActive = false;
    } catch (err) {
      console.error('[SpeechRecognition] Error stopping recognition:', err);
    }
  }

  const part = speechQueue.shift();
  const isArabic = /[\u0600-\u06FF]/.test(part);
  const lang = isArabic ? 'ar' : 'en';
  const config = voiceConfig[lang];
  const voice = selectedVoices[lang];

  if (!voice) {
    console.warn(`[Speak] No voice available for ${lang}`);
    if (isMobileDevice) {
      handleMobileVoiceLoadFailure(lang);
    }
    processSpeechQueue();
    return;
  }

  const utter = new SpeechSynthesisUtterance(part);
  utter.voice = voice;
  utter.lang = isArabic ? 'ar-SA' : 'en-US';
  utter.rate = config.rate;
  utter.pitch = config.pitch;
  utter.volume = config.volume;

  // Enhanced mobile device handling
  if (isMobileDevice) {
    setupMobileSpeechHandling(utter, part, lang);
  }

  utter.onstart = () => {
    console.log(`[Speak] Started speaking (${lang}):`, part);
    document.body.classList.add('speaking');
    if (isMobileDevice) {
      mobileSpeechState.isPaused = false;
      mobileSpeechState.retryCount = 0;
      mobileSpeechState.lastError = null;
    }
  };

  utter.onend = () => {
    console.log(`[Speak] Finished speaking (${lang}):`, part);
    document.body.classList.remove('speaking');
    if (isMobileDevice) {
      clearInterval(resumeCheckInterval);
      // Reset error state on successful completion
      mobileSpeechState.lastError = null;
    }
    speechTimeout = setTimeout(() => {
      processSpeechQueue();
    }, VOICE_CONFIG.speechDelay);
  };

  utter.onerror = (event) => {
    console.error('[Speak] Error:', event);
    document.body.classList.remove('speaking');
    if (isMobileDevice) {
      clearInterval(resumeCheckInterval);
      mobileSpeechState.lastError = event;
      if (mobileSpeechState.forceResumeCount < MOBILE_SPEECH_CONFIG.forceResumeAttempts) {
        handleMobileSpeechError(event);
      }
    }
    speechTimeout = setTimeout(() => {
      processSpeechQueue();
    }, VOICE_CONFIG.speechDelay);
  };

  try {
    speechSynthesisEngine.speak(utter);
    if (isMobileDevice) {
      ensureMobileSpeechStart(utter);
    }
  } catch (error) {
    console.error('[Speak] Error starting speech:', error);
    if (utter.voice) {
      handleFallbackVoice(utter, error);
    }
  }
}

// New function to handle mobile voice load failures
function handleMobileVoiceLoadFailure(lang) {
  console.warn(`[MobileSpeech] Voice load failure for ${lang}`);
  mobileSpeechState.voiceLoadAttempts++;
  
  if (mobileSpeechState.voiceLoadAttempts <= 3) {
    setTimeout(() => {
      loadVoices();
    }, MOBILE_SPEECH_CONFIG.voiceLoadTimeout);
  } else {
    console.error('[MobileSpeech] Max voice load attempts reached');
    // Fall back to default voice
    selectedVoices[lang] = null;
  }
}

// New function to handle mobile speech errors
function handleMobileSpeechError(error) {
  console.error('[MobileSpeech] Handling speech error:', error);
  
  if (mobileSpeechState.recoveryInProgress) {
    console.log('[MobileSpeech] Recovery already in progress');
    return;
  }
  
  mobileSpeechState.recoveryInProgress = true;
  
  // Attempt recovery based on error type
  switch (error.error) {
    case 'interrupted':
    case 'canceled':
      forceMobileSpeechRecovery();
      break;
    case 'network':
      // Wait longer for network issues
      setTimeout(forceMobileSpeechRecovery, MOBILE_SPEECH_CONFIG.recoveryTimeout);
      break;
    default:
      forceMobileSpeechRecovery();
  }
}

// New function to ensure mobile speech starts
function ensureMobileSpeechStart(utter) {
  let startAttempts = 0;
  const maxStartAttempts = 3;
  
  const checkStart = () => {
    if (speechSynthesisEngine.speaking) {
      console.log('[MobileSpeech] Speech started successfully');
      return;
    }
    
    startAttempts++;
    if (startAttempts <= maxStartAttempts) {
      console.log(`[MobileSpeech] Attempting to start speech (${startAttempts}/${maxStartAttempts})`);
      speechSynthesisEngine.speak(utter);
      setTimeout(checkStart, MOBILE_SPEECH_CONFIG.resumeInterval);
    } else {
      console.error('[MobileSpeech] Failed to start speech after multiple attempts');
      processSpeechQueue();
    }
  };
  
  setTimeout(checkStart, MOBILE_SPEECH_CONFIG.resumeInterval);
}

// New function to handle fallback voice
function handleFallbackVoice(utter, originalError) {
  console.log('[MobileSpeech] Attempting fallback voice');
  utter.voice = null; // Use default voice
  
  try {
    speechSynthesisEngine.speak(utter);
    if (isMobileDevice) {
      ensureMobileSpeechStart(utter);
    }
  } catch (fallbackError) {
    console.error('[MobileSpeech] Fallback voice also failed:', fallbackError);
    speechTimeout = setTimeout(() => {
      processSpeechQueue();
    }, VOICE_CONFIG.speechDelay);
  }
}

// Enhanced mobile speech recovery function
function forceMobileSpeechRecovery() {
  console.log('[MobileSpeech] Starting forced recovery');
  mobileSpeechState.forceResumeCount++;
  mobileSpeechState.recoveryInProgress = true;
  
  // Cancel all current speech
  speechSynthesisEngine.cancel();
  
  // Clear any existing timeouts
  if (speechTimeout) {
    clearTimeout(speechTimeout);
  }
  
  // Reset speech synthesis with enhanced error handling
  try {
    speechSynthesisEngine.pause();
    
    setTimeout(() => {
      try {
        speechSynthesisEngine.resume();
        mobileSpeechState.lastResumeAttempt = Date.now();
        
        // If still paused after resume, try one more time
        setTimeout(() => {
          if (speechSynthesisEngine.paused) {
            console.log('[MobileSpeech] Final resume attempt');
            try {
              speechSynthesisEngine.resume();
            } catch (error) {
              console.error('[MobileSpeech] Final resume attempt failed:', error);
            }
          }
          
          // Reset recovery state
          mobileSpeechState.recoveryInProgress = false;
          
          // Continue with next part in queue
          processSpeechQueue();
        }, MOBILE_SPEECH_CONFIG.resumeInterval);
      } catch (error) {
        console.error('[MobileSpeech] Resume failed:', error);
        mobileSpeechState.recoveryInProgress = false;
        processSpeechQueue();
      }
    }, MOBILE_SPEECH_CONFIG.retryDelay);
  } catch (error) {
    console.error('[MobileSpeech] Recovery failed:', error);
    mobileSpeechState.recoveryInProgress = false;
    processSpeechQueue();
  }
}

function clearSpeechQueue() {
  // Clear any existing intervals
  if (isMobileDevice) {
    speechQueue.forEach(part => {
      if (part._resumeCheckInterval) {
        clearInterval(part._resumeCheckInterval);
      }
    });
  }
  
  speechQueue = [];
  if (speechTimeout) {
    clearTimeout(speechTimeout);
  }
  if (speechSynthesisEngine) {
    speechSynthesisEngine.cancel();
  }
  isSpeaking = false;
  
  // Reset mobile state
  if (isMobileDevice) {
    mobileSpeechState = {
      isPaused: false,
      retryCount: 0,
      lastResumeAttempt: 0,
      forceResumeCount: 0,
      lastError: null,
      recoveryInProgress: false,
      voiceLoadAttempts: 0,
      lastVoiceCheck: Date.now()
    };
  }
}

function loadVoices() {
  // Handle Chrome's async voice loading
  if (speechSynthesisEngine.getVoices().length === 0) {
    speechSynthesisEngine.addEventListener('voiceschanged', () => {
      handleVoicesLoaded();
    });
  } else {
    handleVoicesLoaded();
  }
}

function handleVoicesLoaded() {
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
    
    // Reset mobile voice load attempts on successful load
    if (isMobileDevice) {
      mobileSpeechState.voiceLoadAttempts = 0;
    }
  } else if (isMobileDevice) {
    // Handle voice loading failure on mobile
    handleMobileVoiceLoadFailure('en'); // Try English first
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
      stopRecognitionSafely();
    }
  });

  // Make rotating questions clickable
  const questionContainer = document.querySelector('.question-container');
  if (questionContainer) {
    questionContainer.addEventListener('click', () => {
      const questionText = document.querySelector('.question-text');
      if (questionText) {
        processUserQuery(questionText.textContent);
      }
    });
  }
}

// Helper function to detect language selection with confidence
function detectLanguageSelection(transcriptRaw) {
  const transcript = transcriptRaw.toLowerCase().trim();

  const arabicKeywords = [
    'arabic', 'العربية', 'عربي', 'عربية', 'بالعربي', 'بالعربية'
  ];
  const englishKeywords = [
    'english', 'الإنجليزية', 'انجليزي', 'انجليزية', 'بالانجليزي', 'بالانجليزية'
  ];

  const cleanTranscript = transcript.replace(/[^\p{L}\p{N}\s]/gu, ''); // Remove punctuation
  const words = cleanTranscript.split(/\s+/); // Split into words

  const hasArabic = words.some(word =>
    arabicKeywords.some(keyword => word.includes(keyword))
  );

  const hasEnglish = words.some(word =>
    englishKeywords.some(keyword => word.includes(keyword))
  );

  if (hasArabic && !hasEnglish) return 'ar';
  if (hasEnglish && !hasArabic) return 'en';

  // Fallback: detect Arabic characters
  if (/[\u0600-\u06FF]/.test(transcript)) return 'ar';

  return null;
}

// Add new function for mobile speech handling setup
function setupMobileSpeechHandling(utter, part, lang) {
  // Set up periodic resume check for mobile devices
  const resumeCheckInterval = setInterval(() => {
    if (speechSynthesisEngine.paused) {
      console.log('[MobileSpeech] Detected pause, attempting resume');
      mobileSpeechState.isPaused = true;
      mobileSpeechState.retryCount++;
      
      if (mobileSpeechState.retryCount <= MOBILE_SPEECH_CONFIG.maxRetries) {
        try {
          speechSynthesisEngine.resume();
          mobileSpeechState.lastResumeAttempt = Date.now();
        } catch (error) {
          console.error('[MobileSpeech] Resume attempt failed:', error);
          clearInterval(resumeCheckInterval);
          handleMobileSpeechError(error);
        }
      } else {
        console.warn('[MobileSpeech] Max retries reached, forcing recovery');
        clearInterval(resumeCheckInterval);
        forceMobileSpeechRecovery();
      }
    }
  }, MOBILE_SPEECH_CONFIG.checkInterval);

  // Force initial resume after a short delay
  setTimeout(() => {
    if (speechSynthesisEngine.paused) {
      console.log('[MobileSpeech] Forcing initial resume');
      try {
        speechSynthesisEngine.resume();
        mobileSpeechState.lastResumeAttempt = Date.now();
      } catch (error) {
        console.error('[MobileSpeech] Initial resume failed:', error);
        clearInterval(resumeCheckInterval);
        handleMobileSpeechError(error);
      }
    }
  }, MOBILE_SPEECH_CONFIG.resumeInterval);

  // Add mobile-specific event handlers
  utter.onboundary = (event) => {
    if (isMobileDevice && event.name === 'word') {
      // Check if speech is still active
      if (!speechSynthesisEngine.speaking) {
        console.log('[MobileSpeech] Speech stopped unexpectedly');
        clearInterval(resumeCheckInterval);
        handleMobileSpeechError({ error: 'interrupted' });
      }
    }
  };

  // Store interval ID for cleanup
  utter._resumeCheckInterval = resumeCheckInterval;
}
