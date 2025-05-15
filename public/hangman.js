// public/hangman.js

// --- DOM Elements ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startCameraButton = document.getElementById('start-camera-button');
// const submitGuessButton = document.getElementById('submit-guess-button'); // REMOVED - using hold logic
const restartGameButton = document.getElementById('restart-game-button');
const wordToGuessElement = document.getElementById('word-to-guess');
const guessesLeftElement = document.getElementById('guesses-left');
const wrongGuessesElement = document.getElementById('wrong-guesses');
const gameStatusElement = document.getElementById('game-status');
const hangmanFigureElement = document.getElementById('hangman-figure'); // NEW
const holdIndicatorElement = document.getElementById('hold-indicator-hangman'); // NEW

// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognizing = false; // Is camera & MediaPipe active?

// --- ASL Recognition (KNN) ---
let trainingData = [];
const K_NEIGHBORS = 5;
// Only letters for Hangman, no numbers. Ensure your 'text' dataset has these.
const ASL_ALPHABET_VALID_HANGMAN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
const LOCAL_STORAGE_KEY = 'text'; // Load from the main alphanumeric dataset

// --- Hold Logic for Guessing ---
let heldLetterHangman = null;
let holdStartTimeHangman = 0;
const HOLD_DURATION_MS_HANGMAN = 1000; // 1 second
let isProcessingHoldHangman = false;
let lastRecognizedLetterForHold = null; // To track if the letter changes during hold

// --- Hangman Game Logic ---
const WORD_LIST = ["PYTHON", "JAVASCRIPT", "HANGMAN", "MEDIAPIPE", "CAMERA", "NODEJS", "EXPRESS", "GITHUB", "APPLE", "BANANA", "ORANGE", "COMPUTER", "SCIENCE"];
const MAX_WRONG_GUESSES = 6;
let currentWord = '';
let guessedLetters = new Set();
let wrongGuessesCount = 0; // Renamed from wrongGuesses to avoid conflict
let displayWord = '';
let gameState = 'playing'; // 'playing', 'won', 'lost'

// --- Hangman Figure Stages ---
const HANGMAN_STAGES = [
`
  +---+
  |   |
      |
      |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========`,
];


// --- 1. Initialize MediaPipe Hands ---
function initializeMediaPipeHands() {
    statusText.textContent = "Đang tải MediaPipe...";
    mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    mediaPipeHands.onResults(onHandResults);
    statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
    loadTrainingData();
}

// --- 2. Initialize Camera ---
async function initializeCamera() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    if (!videoElement || typeof Camera === 'undefined') {
        statusText.textContent = 'Lỗi: Thiếu thành phần camera.'; return false;
    }
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (!mediaPipeHands || !recognizing) return;
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch (e) { console.error("Lỗi gửi frame (hangman):", e); }
            }
        },
        width: 640, height: 480
    });
    try {
        await camera.start();
        statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ để đoán.';
        return true;
    } catch (err) {
        console.error("Lỗi camera (hangman): ", err);
        statusText.textContent = `Lỗi bật webcam: ${err.name}.`;
        return false;
    }
}

// --- 3. Feature Extraction (Identical) ---
function extractDistanceFeatures(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;
    const features = []; const wrist = landmarks[0];
    const relativeLandmarks = landmarks.map(lm => ({ x: lm.x - wrist.x, y: lm.y - wrist.y, z: (lm.z || 0) - (wrist.z || 0) }));
    const refPoint = relativeLandmarks[9];
    let handScale = Math.sqrt(refPoint.x**2 + refPoint.y**2 + refPoint.z**2);
    if (handScale < 0.001) handScale = 0.1;
    const PAIRS = [[0,4],[0,8],[0,12],[0,16],[0,20],[4,8],[8,12],[12,16],[16,20],[5,8],[9,12],[13,16],[17,20],[2,4],[5,4],[9,4],[13,4],[17,4]];
    for (const pair of PAIRS) {
        const p1 = relativeLandmarks[pair[0]]; const p2 = relativeLandmarks[pair[1]];
        if (!p1 || !p2) { features.push(0); continue; }
        const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
        features.push(dist / handScale);
    } return features;
}

// --- 4. KNN Prediction (Identical) ---
function euclideanDistance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
    return Math.sqrt(sum);
}
function predictKNN(currentFeatures, k) {
    if (trainingData.length < k || !currentFeatures) return trainingData.length === 0 ? "Chưa có data" : "Cần data";
    const distances = trainingData.map(sample => ({ label: sample.label, distance: euclideanDistance(sample.features, currentFeatures) })).filter(item => isFinite(item.distance));
    if (distances.length === 0) return "Lỗi khoảng cách";
    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);
    if (neighbors.length === 0) return "Không láng giềng";
    const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
    let maxCount = 0; let predictedLabel = "?";
    for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
    return predictedLabel;
}

// --- 5. Process Hand Results & Hold Logic ---
let lastPredictionTimeHangman = 0;
const PREDICTION_INTERVAL_HANGMAN = 200; // Check more frequently for responsiveness

function onHandResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.image) { // Draw camera feed
        // Canvas is already flipped by CSS, so draw directly
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    let prediction = "---";
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
            drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
            drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
        }
        canvasCtx.restore(); // Restore after drawing landmarks if canvas was transformed for it

        const currentTime = Date.now();
        if (recognizing && (currentTime - lastPredictionTimeHangman > PREDICTION_INTERVAL_HANGMAN)) {
            lastPredictionTimeHangman = currentTime;
            const features = extractDistanceFeatures(handLandmarks);
            prediction = features ? predictKNN(features, K_NEIGHBORS) : "Lỗi FE";
        } else if (recognizing) {
            prediction = recognizedCharText.textContent; // Keep last prediction if not interval
        }
    } else {
        prediction = "Không thấy tay";
        canvasCtx.restore(); // Ensure restore if no landmarks
    }
    recognizedCharText.textContent = prediction;
    lastRecognizedLetterForHold = prediction; // Update for hold logic

    // Hold Logic for Guessing
    if (!recognizing || gameState !== 'playing') {
        holdIndicatorElement.textContent = '';
        return;
    }

    const isValidGuessChar = ASL_ALPHABET_VALID_HANGMAN.includes(lastRecognizedLetterForHold);

    if (isValidGuessChar && lastRecognizedLetterForHold === heldLetterHangman) {
        const holdDuration = Date.now() - holdStartTimeHangman;
        const remainingTime = Math.max(0, HOLD_DURATION_MS_HANGMAN - holdDuration);

        if (holdDuration >= HOLD_DURATION_MS_HANGMAN && !isProcessingHoldHangman) {
            isProcessingHoldHangman = true;
            holdIndicatorElement.textContent = `Đã đoán: ${heldLetterHangman}`;
            console.log(`Guess '${heldLetterHangman}' confirmed.`);
            handleGuess(heldLetterHangman); // Process the guess

            // Reset for next potential hold, even if it's the same letter again
            // This prevents immediate re-guessing of the same letter if hand doesn't move
            heldLetterHangman = null;
            holdStartTimeHangman = 0;
            // isProcessingHoldHangman will be reset when the recognized sign changes
        } else if (!isProcessingHoldHangman) {
            holdIndicatorElement.textContent = `Giữ '${heldLetterHangman}' (${(remainingTime/1000).toFixed(1)}s)...`;
        }
    } else {
        // Sign changed or is not a valid guess character
        if (isValidGuessChar || lastRecognizedLetterForHold === "---" || lastRecognizedLetterForHold === "Không thấy tay") {
            if (heldLetterHangman !== null && heldLetterHangman !== lastRecognizedLetterForHold) {
                 console.log(`Hangman: Sign changed from ${heldLetterHangman} to ${lastRecognizedLetterForHold}. Resetting hold.`);
            }
            heldLetterHangman = lastRecognizedLetterForHold; // Start tracking new char
            holdStartTimeHangman = Date.now();
            isProcessingHoldHangman = false; // Allow processing for new hold
            holdIndicatorElement.textContent = '';
        } else {
            // If prediction is "?", "Lỗi FE", etc.
            holdIndicatorElement.textContent = '';
        }
    }
}

// --- 6. Load Training Data ---
function loadTrainingData() {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    trainingData = [];
    let loadedCount = 0;
    if (data) {
        try {
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                trainingData = parsedData.filter(item => item?.features?.length > 0 && typeof item.label === 'string');
                loadedCount = trainingData.length;
            }
        } catch(e) { console.error("Lỗi parse data (hangman):", e); }
    }
    console.log(`Hangman: Đã tải ${loadedCount} mẫu từ key '${LOCAL_STORAGE_KEY}'.`);
    if (loadedCount < K_NEIGHBORS) {
         statusText.textContent = "Cảnh báo: Ít dữ liệu mẫu. Cần huấn luyện thêm.";
         // alert("Không đủ dữ liệu huấn luyện ASL. Trò chơi có thể không chính xác.");
         startCameraButton.disabled = true; // Disable if not enough data
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu). Nhấn 'Bật Camera'`;
        startCameraButton.disabled = false;
    }
}

// --- 7. Hangman Game Logic (Adhering to Rules) ---
function selectWord() {
    return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)].toUpperCase();
}

function updateHangmanFigure() {
    hangmanFigureElement.textContent = HANGMAN_STAGES[wrongGuessesCount];
}

function updateDisplay() {
    // Rule 7: Display current word, guesses left, wrong letters
    displayWord = currentWord.split('')
        .map(letter => (guessedLetters.has(letter) ? ` ${letter} ` : ' _ '))
        .join('');
    wordToGuessElement.textContent = displayWord.trim();
    guessesLeftElement.textContent = MAX_WRONG_GUESSES - wrongGuessesCount;
    wrongGuessesElement.textContent = [...guessedLetters]
        .filter(letter => !currentWord.includes(letter))
        .join(', ');
    updateHangmanFigure();
}

function checkGameState() {
    const wordComplete = currentWord.split('').every(letter => guessedLetters.has(letter));
    if (wordComplete) {
        gameState = 'won'; // Rule 6: Win
        gameStatusElement.textContent = '🎉 CHÚC MỪNG! BẠN ĐÃ THẮNG! 🎉';
        gameStatusElement.className = 'game-message success';
        stopGameRecognition();
    } else if (wrongGuessesCount >= MAX_WRONG_GUESSES) {
        gameState = 'lost'; // Rule 3 & 6: Lose
        gameStatusElement.textContent = `💀 RẤT TIẾC! BẠN ĐÃ THUA. Từ cần đoán là: ${currentWord} 💀`;
        gameStatusElement.className = 'game-message error';
        stopGameRecognition();
    } else {
        gameState = 'playing';
    }
}

function handleGuess(letter) { // Rule 4: Player guesses a letter
    if (!letter || gameState !== 'playing' || !ASL_ALPHABET_VALID_HANGMAN.includes(letter)) {
        console.log("Invalid guess or game not playing:", letter, gameState);
        return;
    }
    letter = letter.toUpperCase();

    if (guessedLetters.has(letter)) { // Rule 5: Already guessed
        statusText.textContent = `Bạn đã đoán chữ '${letter}' rồi. Thử chữ khác.`;
        // No penalty for re-guessing
        return;
    }
    guessedLetters.add(letter);

    if (currentWord.includes(letter)) { // Rule 5: Correct guess
        statusText.textContent = `Chính xác! Chữ '${letter}' có trong từ.`;
    } else { // Rule 5: Incorrect guess
        wrongGuessesCount++;
        statusText.textContent = `Sai rồi! Chữ '${letter}' không có trong từ.`;
    }
    checkGameState();
    updateDisplay();
}

function startGame() { // Rule 1 & 2
    currentWord = selectWord();
    guessedLetters = new Set();
    wrongGuessesCount = 0;
    gameState = 'playing';
    heldLetterHangman = null; // Reset hold state
    holdStartTimeHangman = 0;
    isProcessingHoldHangman = false;
    lastRecognizedLetterForHold = null;

    recognizedCharText.textContent = "---";
    holdIndicatorElement.textContent = "";
    gameStatusElement.textContent = "";
    gameStatusElement.className = 'game-message';

    console.log("Hangman: New game! Word (dev only):", currentWord);
    updateDisplay(); // Initial display

    if (recognizing) {
        statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
    } else {
        statusText.textContent = `Game mới! Nhấn 'Bật Camera'`;
    }
}

function stopGameRecognition() { // Called when game ends (win/lose)
     if (recognizing) {
        recognizing = false; // Stop recognition processing
        // Don't stop camera here, user might want to restart
        // if (camera && camera.stop) camera.stop();
        // startCameraButton.textContent = "Bật Camera & Nhận Diện";
        statusText.textContent = "Game đã kết thúc. Nhấn 'Chơi Lại'.";
        recognizedCharText.textContent = "---";
        holdIndicatorElement.textContent = "";
     }
}
function stopFullRecognitionAndCamera() { // Called by "Dừng Camera" button
     if (recognizing) { // If it was active
        recognizing = false;
        if (camera && camera.stop) {
            try { camera.stop(); } catch(e) { console.error("Error stopping camera", e); }
        }
     }
     // Reset UI regardless of previous state if button is "Dừng Camera"
    startCameraButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bật Camera';
    statusText.textContent = "Đã dừng camera. Nhấn 'Bật Camera' để chơi.";
    recognizedCharText.textContent = "---";
    holdIndicatorElement.textContent = "";
    heldLetterHangman = null;
    isProcessingHoldHangman = false;
}


// --- 8. Event Listeners ---
startCameraButton.onclick = async () => {
    if (!recognizing) {
        if (trainingData.length === 0) {
             alert("Không có dữ liệu huấn luyện. Không thể bắt đầu nhận diện.");
             return;
        }
        startCameraButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 10px;"></i>Đang bật...';
        startCameraButton.disabled = true;
        const cameraStarted = await initializeCamera();
        if (cameraStarted) {
            recognizing = true;
            startCameraButton.innerHTML = '<i class="fa-solid fa-stop" style="margin-right: 10px;"></i>Dừng Camera';
            if (gameState !== 'playing') startGame(); // Start a new game if previous one ended
            else statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
        } else {
            startCameraButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bật Camera';
        }
        startCameraButton.disabled = false;
    } else {
        stopFullRecognitionAndCamera();
    }
};

restartGameButton.onclick = () => {
    startGame();
    // If camera was stopped due to game end, re-enable recognition if camera is still technically on
    if (camera && camera.stream && camera.stream.active && !recognizing) {
        recognizing = true; // Allow recognition for the new game
        statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
        startCameraButton.innerHTML = '<i class="fa-solid fa-stop" style="margin-right: 10px;"></i>Dừng Camera';
    } else if (!camera || !camera.stream || !camera.stream.active) {
        // If camera was fully stopped, user needs to click "Bật Camera" again
        statusText.textContent = `Game mới! Nhấn 'Bật Camera'`;
        startCameraButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bật Camera';
        recognizing = false; // Ensure it's off
    }
};

// --- 9. Initialization ---
function mainHangman() {
    initializeMediaPipeHands(); // Loads MP and then calls loadTrainingData
    startGame(); // Setup game state and UI
}

mainHangman();