// public/dictionary.js

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startButton = document.getElementById('start-button');

// Elements for target character display
const targetCharImageElement = document.getElementById('target-char-image');
const targetCharTextElement = document.getElementById('target-char-text'); // Fallback text
const targetCharBoxElement = document.querySelector('.target-char-box'); // The container div

// Buttons for practice
const nextCharButton = document.getElementById('next-char-button');
const randomCharButton = document.getElementById('random-char-button');

let mediaPipeHands = null;
let camera = null;
let recognizing = false;
// currentLandmarks is only needed if you have data collection active on this page.
// Since data-collection div is display:none, we might not need it.
// let currentLandmarks = null;

let trainingData = [];
const K_NEIGHBORS = 3;

// IMPORTANT: Update this list to ONLY include characters for which you have images
// in public/dictionary_image/ (e.g., a.png, b.png, 0.png, 1.png)
// The names must match the image filenames (e.g., 'A' for 'a.png')
const ASL_ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
// If you add numbers: '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'

const LOCAL_STORAGE_KEY = 'text'; // Key to load KNN training data from

let targetChar = null;
let currentCharIndex = -1; // Start at -1 so first getNextChar() picks index 0
let verificationTimeout = null;

function initializeMediaPipeHands() {
    mediaPipeHands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    mediaPipeHands.setOptions({
        maxNumHands: 1, modelComplexity: 1,
        minDetectionConfidence: 0.6, minTrackingConfidence: 0.6
    });
    mediaPipeHands.onResults(onHandResults);
    statusText.textContent = "MediaPipe đã sẵn sàng. Nhấn 'Bắt đầu'.";
}

async function initializeCamera() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    if (!videoElement || typeof Camera === 'undefined') {
        console.error("Video element or Camera library missing!");
        statusText.textContent = 'Lỗi: Thiếu thành phần camera.';
        return false;
    }
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0 && mediaPipeHands) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch(e) { console.error("Error sending frame to MediaPipe", e); }
            }
        },
        width: 640, // Match canvas width in HTML
        height: 480 // Match canvas height in HTML
    });
    try {
        await camera.start();
        statusText.textContent = 'Webcam đã bật. Thực hiện cử chỉ.';
        return true;
    } catch (err) {
        console.error("Lỗi camera: ", err);
        statusText.textContent = `Lỗi bật webcam: ${err.name}. Kiểm tra quyền truy cập.`;
        return false;
    }
}

function extractDistanceFeatures(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;
    const features = [];
    const wrist = landmarks[0];
    const relativeLandmarks = landmarks.map(lm => ({
        x: lm.x - wrist.x, y: lm.y - wrist.y, z: (lm.z || 0) - (wrist.z || 0)
    }));
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
        return trainingData && trainingData.length === 0 ? "Chưa có dữ liệu" : "Cần thêm dữ liệu";
    }
    const distances = trainingData.map(sample => {
        if (!sample || !sample.features) return { label: null, distance: Infinity };
        const dist = euclideanDistance(sample.features, currentFeatures);
        return { label: sample.label, distance: dist };
    }).filter(item => item.label !== null && isFinite(item.distance));

    if (distances.length === 0) return "Lỗi khoảng cách";
    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);
    if (neighbors.length === 0) return "Không có láng giềng";

    const labelCounts = {};
    for (const neighbor of neighbors) {
        labelCounts[neighbor.label] = (labelCounts[neighbor.label] || 0) + 1;
    }
    let maxCount = 0;
    let predictedLabel = "Không chắc";
    for (const label in labelCounts) {
        if (labelCounts[label] > maxCount) {
            maxCount = labelCounts[label];
            predictedLabel = label;
        }
    }
    // Optional: Add confidence check
    // let avgDistance = neighbors.reduce((acc, curr) => acc + curr.distance, 0) / k;
    // if (avgDistance > 0.35) { predictedLabel = "Không chắc"; }
    return predictedLabel;
}

let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 250; // ms, can adjust

function onHandResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    // The canvas is already flipped by CSS: style="-webkit-transform: scaleX(-1); transform: scaleX(-1);"
    // So, drawImage directly. The landmarks will also be drawn on this flipped canvas.
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        // Draw landmarks and connectors directly onto the CSS-flipped canvas
        if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
            drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        }
        if (typeof drawLandmarks === 'function') {
            drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
        }
    }
    canvasCtx.restore(); // Restore any transformations if needed, though likely not if only drawImage was used on base.

    // --- Recognition Logic ---
    let currentRecognizedGesture = recognizedCharText.textContent || "---"; // Keep previous if not time for new one
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        const currentTime = Date.now();
        if (recognizing && (currentTime - lastPredictionTime > PREDICTION_INTERVAL)) {
            lastPredictionTime = currentTime;
            const features = extractDistanceFeatures(handLandmarks);
            if (features) {
                const prediction = predictKNN(features, K_NEIGHBORS);
                currentRecognizedGesture = prediction;
                if (targetChar) {
                    verifySign(prediction);
                }
            } else {
                currentRecognizedGesture = "Lỗi FE";
                if (targetChar) resetTargetBoxColor();
            }
        }
    } else {
        if (recognizing) {
            currentRecognizedGesture = "---";
            if (targetChar) resetTargetBoxColor();
        }
    }
    recognizedCharText.textContent = currentRecognizedGesture;
}

function resetTargetBoxColor() {
    if (targetCharBoxElement) {
        targetCharBoxElement.classList.remove('correct', 'incorrect');
    }
}

function loadTrainingData() {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    trainingData = [];
    if (data) {
        try {
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                trainingData = parsedData.filter(item => item && item.features && typeof item.label === 'string');
            }
        } catch(e) { console.error("Lỗi parse data từ localStorage:", e); }
    }
    // const dataCountElement = document.getElementById('data-count'); // If re-enabled
    // if (dataCountElement) dataCountElement.textContent = trainingData.length;

    if (trainingData.length < K_NEIGHBORS) { // Need at least K samples to make a prediction
        statusText.textContent = "Cảnh báo: Không đủ dữ liệu huấn luyện!";
        // startButton.disabled = true; // Keep enabled to allow camera start, but KNN might not work well
    } else {
        statusText.textContent = "MediaPipe sẵn sàng. Nhấn 'Bắt đầu'.";
        // startButton.disabled = false;
    }
}


function updateTargetDisplay() {
    if (targetCharImageElement && targetChar) {
        const imageName = targetChar.toLowerCase() + '.png'; // e.g., a.png, b.png
        targetCharImageElement.src = `/dictionary_image/${imageName}`;
        targetCharImageElement.alt = `Ký tự ASL: ${targetChar}`;
        targetCharImageElement.style.display = 'block';
        if(targetCharTextElement) targetCharTextElement.style.display = 'none'; // Hide text if image loads
        targetCharImageElement.onerror = () => { // Fallback if image fails to load
            console.error(`Không thể tải ảnh: /dictionary_image/${imageName}`);
            targetCharImageElement.style.display = 'none';
            if(targetCharTextElement) {
                targetCharTextElement.textContent = targetChar;
                targetCharTextElement.style.display = 'block';
            }
        };
    }
    resetTargetBoxColor();
}

function getNextChar() {
    if (ASL_ALPHABET.length === 0) return;
    currentCharIndex = (currentCharIndex + 1) % ASL_ALPHABET.length;
    targetChar = ASL_ALPHABET[currentCharIndex];
    updateTargetDisplay();
}

function getRandomChar() {
    if (ASL_ALPHABET.length === 0) return;
    currentCharIndex = Math.floor(Math.random() * ASL_ALPHABET.length);
    targetChar = ASL_ALPHABET[currentCharIndex];
    updateTargetDisplay();
}

function verifySign(predictedChar) {
    if (!targetChar || !targetCharBoxElement) return;

    if (predictedChar === targetChar) {
        targetCharBoxElement.classList.add('correct');
        targetCharBoxElement.classList.remove('incorrect');
        clearTimeout(verificationTimeout);
        verificationTimeout = setTimeout(() => {
            resetTargetBoxColor();
            getNextChar(); // Automatically move to next char
        }, 800); // 2 seconds delay
    } else {
        targetCharBoxElement.classList.add('incorrect');
        targetCharBoxElement.classList.remove('correct');
    }
}

function toggleInstructions() {
    const instructionBox = document.querySelector('.instruction-box');
    if (instructionBox) instructionBox.classList.toggle('collapsed');
}

function main() {
    initializeMediaPipeHands();
    loadTrainingData();

    if (nextCharButton) nextCharButton.addEventListener('click', getNextChar);
    if (randomCharButton) randomCharButton.addEventListener('click', getRandomChar);

    getNextChar(); // Initialize with the first character image

    startButton.onclick = async () => {
        if (!recognizing) {
            if (trainingData.length === 0 && ASL_ALPHABET.length > 0) { // Allow starting even if KNN data is little, but alphabet exists
                console.warn("Bắt đầu với ít hoặc không có dữ liệu huấn luyện KNN.");
            }
            const cameraStarted = await initializeCamera();
            if (cameraStarted) {
                recognizing = true;
                startButton.innerHTML = '<i class="fa-solid fa-stop" style="margin-right: 10px;"></i>Dừng';
            }
        } else {
            recognizing = false;
            if (camera && camera.stop) camera.stop();
            startButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bắt đầu';
            statusText.textContent = "Đã dừng. Nhấn 'Bắt đầu' để tiếp tục.";
            recognizedCharText.textContent = "---";
            resetTargetBoxColor();
        }
    };
}

main();