// public/hangman.js

// --- DOM Elements ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char-hangman'); // Specific ID
const startCameraButton = document.getElementById('start-camera-button');
// const submitGuessButton = document.getElementById('submit-guess-button-hangman'); // No longer needed
const restartGameButton = document.getElementById('restart-game-button');
const wordToGuessElement = document.getElementById('word-to-guess');
const guessesLeftElement = document.getElementById('guesses-left-display'); // Specific ID
const wrongGuessesElement = document.getElementById('wrong-guesses-display'); // Specific ID
const gameStatusElement = document.getElementById('game-status-message'); // Specific ID
const holdIndicatorElement = document.getElementById('hold-indicator-hangman'); // Specific ID

// Hangman Figure Parts
const hangmanParts = [
    document.querySelector('.hangman-figure-container .head'),
    document.querySelector('.hangman-figure-container .body'),
    document.querySelector('.hangman-figure-container .arm-left'),
    document.querySelector('.hangman-figure-container .arm-right'),
    document.querySelector('.hangman-figure-container .leg-left'),
    document.querySelector('.hangman-figure-container .leg-right')
];
// Also hide gallows initially if you want them to appear with the first wrong guess, or show them always.
const gallowsParts = document.querySelectorAll('.hangman-figure-container .gallows');


// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognitionActive = false; // Changed from 'recognizing' for clarity

// --- ASL Recognition (KNN) ---
let trainingData = [];
const K_NEIGHBORS = 5;
const ASL_ALPHABET_VALID_FOR_GAME = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y']; // Only letters for typical Hangman
const LOCAL_STORAGE_KEY = 'text'; // Or 'aslAlphanumericData_v1' - ensure this matches your main data
let currentRecognizedLetter = null;

// --- Hangman Game Logic ---
const WORD_LIST = ["PYTHON", "JAVASCRIPT", "HANGMAN", "MEDIAPIPE", "CAMERA", "NODEJS", "EXPRESS", "GITHUB", "APPLE", "BANANA", "ORANGE", "COMPUTER", "SCIENCE"];
const MAX_WRONG_GUESSES = 6;
let currentWord = '';
let guessedLetters = new Set();
let wrongGuessesCount = 0; // Renamed for clarity
let displayWord = '';
let gameState = 'playing'; // 'playing', 'won', 'lost'

// --- Hold Logic for Guessing ---
let heldCharForGuess = null;
let holdStartTimeForGuess = 0;
const HOLD_DURATION_FOR_GUESS_MS = 1000; // 1 second
let isProcessingGuessHold = false;


// --- 1. Initialize MediaPipe Hands ---
function initializeMediaPipeHands() {
    statusText.textContent = "Đang tải MediaPipe...";
    mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    mediaPipeHands.onResults(onHandResultsHangman);
    statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
    loadTrainingDataHangman();
}

// --- 2. Initialize Camera ---
async function initializeCameraHangman() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    if (!videoElement || typeof Camera === 'undefined') {
        statusText.textContent = 'Lỗi: Thiếu thành phần camera.'; return false;
    }
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (!mediaPipeHands || !recognitionActive) return;
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch (e) { console.error("Lỗi gửi frame (hangman):", e); }
            }
        },
        width: 400, height: 300 // Match canvas in HTML
    });
    try {
        await camera.start();
        statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ để đoán.';
        return true;
    } catch (err) {
        console.error("Lỗi camera (hangman): ", err);
        statusText.textContent = `Lỗi camera: ${err.name}.`;
        return false;
    }
}

// --- 3. Feature Extraction & 4. KNN (Identical to your other scripts) ---
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
function euclideanDistance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
    return Math.sqrt(sum);
}
function predictKNN(currentFeatures, k) {
    if (!trainingData || trainingData.length < k || !currentFeatures) {
        return trainingData && trainingData.length === 0 ? "Chưa có data" : "Cần data";
    }
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
function onHandResultsHangman(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.image) { // Draw camera feed
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        // Draw landmarks on the non-mirrored canvas (as CSS handles mirroring)
        if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
            drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        }
        if (typeof drawLandmarks === 'function') {
            drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
        }
    }
    canvasCtx.restore();

    let prediction = "---";
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const features = extractDistanceFeatures(results.multiHandLandmarks[0]);
        prediction = features ? predictKNN(features, K_NEIGHBORS) : "Lỗi FE";
    } else {
        prediction = "Không thấy tay";
    }
    recognizedCharText.textContent = prediction;

    if (!recognitionActive || gameState !== 'playing') {
        holdIndicatorElement.textContent = '';
        return;
    }

    const isValidGuessChar = ASL_ALPHABET_VALID_FOR_GAME.includes(prediction);

    if (isValidGuessChar && prediction === heldCharForGuess) {
        const holdDuration = Date.now() - holdStartTimeForGuess;
        const remainingTime = Math.max(0, HOLD_DURATION_FOR_GUESS_MS - holdDuration);

        if (holdDuration >= HOLD_DURATION_FOR_GUESS_MS && !isProcessingGuessHold) {
            isProcessingGuessHold = true;
            holdIndicatorElement.textContent = `Đã đoán: ${heldCharForGuess}`;
            console.log(`Guess '${heldCharForGuess}' held. Submitting.`);
            handleGuess(heldCharForGuess);
            
            // Reset for next potential hold, even if it's the same character again after a pause
            heldCharForGuess = null; 
            holdStartTimeForGuess = 0;
            // isProcessingGuessHold will be reset when the sign changes
        } else if (!isProcessingGuessHold) {
            holdIndicatorElement.textContent = `Giữ '${heldCharForGuess}' (${(remainingTime/1000).toFixed(1)}s)...`;
        }
    } else {
        if (isValidGuessChar || prediction === "---" || prediction === "Không thấy tay") {
            if (heldCharForGuess !== null && heldCharForGuess !== prediction) {
                 console.log(`Sign for guess changed from ${heldCharForGuess} to ${prediction}. Resetting hold.`);
            }
            heldCharForGuess = prediction;
            holdStartTimeForGuess = Date.now();
            isProcessingGuessHold = false;
            holdIndicatorElement.textContent = '';
        } else {
            holdIndicatorElement.textContent = ''; // Not a valid char for guessing
        }
    }
}

// --- 6. Load Training Data ---
function loadTrainingDataHangman() {
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
    console.log(`Đã tải ${loadedCount} mẫu huấn luyện cho Hangman.`);
    if (loadedCount < K_NEIGHBORS) { // Need at least K samples
         statusText.textContent = "Cảnh báo: Không đủ dữ liệu mẫu!";
         alert("Không đủ dữ liệu huấn luyện ASL. Vui lòng huấn luyện thêm ở trang chính.");
         startCameraButton.disabled = true;
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu). Nhấn 'Bật Camera'`;
        startCameraButton.disabled = false;
    }
}

// --- 7. Hangman Game Logic ---
function selectWord() {
    return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)].toUpperCase();
}

function updateHangmanFigure() {
    gallowsParts.forEach(part => part.style.display = 'block'); // Show gallows
    for (let i = 0; i < hangmanParts.length; i++) {
        hangmanParts[i].style.display = (i < wrongGuessesCount) ? 'block' : 'none';
    }
}

function updateDisplay() {
    displayWord = currentWord.split('').map(letter => (guessedLetters.has(letter) ? letter : '_')).join(' ');
    wordToGuessElement.textContent = displayWord;
    guessesLeftElement.textContent = MAX_WRONG_GUESSES - wrongGuessesCount;
    wrongGuessesElement.textContent = [...guessedLetters].filter(letter => !currentWord.includes(letter)).join(', ');
    updateHangmanFigure();

    gameStatusElement.textContent = '';
    gameStatusElement.className = 'game-status-message'; // Reset class
    if (gameState === 'won') {
        gameStatusElement.textContent = '🎉 Bạn đã thắng! 🎉';
        gameStatusElement.classList.add('won');
        stopGameRecognition();
    } else if (gameState === 'lost') {
        gameStatusElement.textContent = `💀 Bạn đã thua! Từ cần đoán là: ${currentWord} 💀`;
        gameStatusElement.classList.add('lost');
        stopGameRecognition();
    }
}

function checkGameState() {
    const wordComplete = currentWord.split('').every(letter => guessedLetters.has(letter));
    if (wordComplete) {
        gameState = 'won';
    } else if (wrongGuessesCount >= MAX_WRONG_GUESSES) {
        gameState = 'lost';
    } else {
        gameState = 'playing';
    }
}

function handleGuess(letter) {
    if (!letter || gameState !== 'playing' || !ASL_ALPHABET_VALID_FOR_GAME.includes(letter)) return;

    letter = letter.toUpperCase();
    if (guessedLetters.has(letter)) {
        statusText.textContent = `Bạn đã đoán chữ '${letter}' rồi.`;
        setTimeout(() => { if(recognitionActive) statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...'; }, 2000);
        return;
    }
    guessedLetters.add(letter);

    if (currentWord.includes(letter)) {
        statusText.textContent = `Đoán đúng: '${letter}'!`;
    } else {
        wrongGuessesCount++;
        statusText.textContent = `Đoán sai: '${letter}'!`;
    }
    setTimeout(() => { if(recognitionActive && gameState === 'playing') statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...'; }, 2000);

    checkGameState();
    updateDisplay();
}

function startGame() {
    currentWord = selectWord();
    guessedLetters = new Set();
    wrongGuessesCount = 0;
    gameState = 'playing';
    heldCharForGuess = null;
    holdStartTimeForGuess = 0;
    isProcessingGuessHold = false;
    recognizedCharText.textContent = "---";
    holdIndicatorElement.textContent = "";

    console.log("Hangman - New Word (dev only):", currentWord);
    updateDisplay(); // Initial display setup

    if (recognitionActive) {
        statusText.textContent = 'Game mới! Thực hiện thủ ngữ...';
    } else {
        statusText.textContent = `Game mới! Nhấn 'Bật Camera'`;
    }
}

function stopGameRecognition() { // Called when game ends (win/lose)
    if (recognitionActive) {
        recognitionActive = false; // Stop processing new gestures for game
        // Camera can remain on if user wants to restart, or stop it:
        // if (camera) camera.stop();
        // startCameraButton.textContent = "Bật Camera";
        holdIndicatorElement.textContent = "Game đã kết thúc.";
    }
}
function fullStopRecognitionAndCamera() { // Called by button or if leaving page
     if (camera) {
        try { camera.stop(); } catch(e) { console.error("Error stopping camera", e); }
     }
     recognitionActive = false;
     isProcessingGuessHold = false;
     heldCharForGuess = null;
     startCameraButton.innerHTML = '<i class="fa-solid fa-camera" style="margin-right: 8px;"></i>Bật Camera';
     statusText.textContent = "Đã dừng camera. Nhấn Bật Camera để chơi.";
     recognizedCharText.textContent = "---";
     holdIndicatorElement.textContent = "";
}


// --- Event Listeners ---
startCameraButton.onclick = async () => {
    if (!recognitionActive) {
        if (trainingData.length === 0) {
             alert("Không có dữ liệu huấn luyện. Không thể bắt đầu nhận diện.");
             return;
        }
        startCameraButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i>Đang bật...';
        startCameraButton.disabled = true;
        const cameraStarted = await initializeCameraHangman();
        if (cameraStarted) {
            recognitionActive = true;
            startCameraButton.innerHTML = '<i class="fa-solid fa-video-slash" style="margin-right: 8px;"></i>Tắt Camera';
            if (gameState !== 'playing') startGame(); // Start a new game if previous one ended
            else statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
        } else {
            startCameraButton.innerHTML = '<i class="fa-solid fa-camera" style="margin-right: 8px;"></i>Bật Camera';
        }
        startCameraButton.disabled = false;
    } else {
        fullStopRecognitionAndCamera();
    }
};

restartGameButton.onclick = () => {
    startGame();
    // If camera was off, user still needs to turn it on.
    // If camera was on, it continues for the new game.
    if (recognitionActive) {
        statusText.textContent = 'Game mới! Thực hiện thủ ngữ...';
    }
};

// --- Initialization ---
function mainHangman() {
    initializeMediaPipeHands(); // Loads MP and then calls loadTrainingData
    startGame(); // Setup initial game state
}

// Helper for instructions
function toggleInstructions() {
    const instructionBox = document.querySelector('.instruction-box');
    if (instructionBox) instructionBox.classList.toggle('collapsed');
}


mainHangman();