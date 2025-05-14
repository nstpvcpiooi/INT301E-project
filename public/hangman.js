// --- START OF FILE public/hangman.js ---

// --- DOM Elements ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startCameraButton = document.getElementById('start-camera-button');
const submitGuessButton = document.getElementById('submit-guess-button');
const restartGameButton = document.getElementById('restart-game-button');
const wordToGuessElement = document.getElementById('word-to-guess');
const guessesLeftElement = document.getElementById('guesses-left');
const wrongGuessesElement = document.getElementById('wrong-guesses');
const gameStatusElement = document.getElementById('game-status');
// --- Loại bỏ các element liên quan đến thu thập dữ liệu ---
// const dataCountElement = document.getElementById('data-count');
// const charLabelInput = document.getElementById('char-label');
// const captureSampleButton = document.getElementById('capture-sample-button');
// const clearDataButton = document.getElementById('clear-data-button');
// const exportDataButton = document.getElementById('export-data-button');
// const importFileInput = document.getElementById('import-file');

// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognizing = false;
let currentLandmarks = null; // Vẫn cần để trích xuất đặc trưng

// --- ASL Recognition (KNN) ---
let trainingData = []; // { features: [...], label: 'A' }
const K_NEIGHBORS = 5; // Có thể điều chỉnh
const ASL_ALPHABET_VALID = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y']; // Các ký tự hợp lệ cho game
const LOCAL_STORAGE_KEY = 'text'; // Giữ nguyên key để load data cũ
let currentRecognizedLetter = null; // Lưu trữ chữ cái nhận diện được gần nhất

// --- Hangman Game Logic ---
const WORD_LIST = ["PYTHON", "JAVASCRIPT", "HANGMAN", "MEDIAPIPE", "CAMERA", "NODEJS", "EXPRESS", "GITHUB"]; // Thêm nhiều từ hơn
const MAX_WRONG_GUESSES = 6;
let currentWord = '';
let guessedLetters = new Set();
let wrongGuesses = 0;
let displayWord = '';
let gameState = 'playing'; // 'playing', 'won', 'lost'

// --- 1. Khởi Tạo MediaPipe Hands (Giữ nguyên từ ori.js) ---
function initializeMediaPipeHands() {
    statusText.textContent = "Đang tải MediaPipe...";
    mediaPipeHands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    mediaPipeHands.setOptions({
        maxNumHands: 1, modelComplexity: 1,
        minDetectionConfidence: 0.6, minTrackingConfidence: 0.6
    });
    mediaPipeHands.onResults(onHandResults); // Callback khi có kết quả
    statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
    loadTrainingData(); // Tải dữ liệu huấn luyện
}

// --- 2. Khởi Tạo Camera (Giữ nguyên từ ori.js, nhưng cập nhật text) ---
async function initializeCamera() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    camera = new Camera(videoElement, {
        onFrame: async () => {
            // Đảm bảo video sẵn sàng trước khi gửi frame
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                await mediaPipeHands.send({ image: videoElement });
            }
        },
        width: 480, height: 360
    });
    try {
        await camera.start();
        statusText.textContent = 'Webcam đang chạy. Thực hiện thủ ngữ...';
        // Không cần enable nút capture nữa
        return true;
    } catch (err) {
        console.error("Lỗi camera: ", err);
        statusText.textContent = 'Lỗi bật webcam. Kiểm tra quyền truy cập.';
        submitGuessButton.disabled = true;
        return false;
    }
}

// --- 3. Trích Xuất Đặc Trưng (Giữ nguyên từ ori.js) ---
function extractDistanceFeatures(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;

    const features = [];
    const wrist = landmarks[0];

    // Chuẩn hóa tọa độ tương đối với cổ tay
    const relativeLandmarks = landmarks.map(lm => ({
        x: lm.x - wrist.x,
        y: lm.y - wrist.y,
        z: (lm.z || 0) - (wrist.z || 0) // Z có thể không luôn có
    }));

    // Tính toán tỷ lệ bàn tay dựa trên khoảng cách từ cổ tay đến gốc ngón giữa (MCP)
    const refPoint = relativeLandmarks[9]; // Ví dụ: Middle finger MCP
    let handScale = Math.sqrt(refPoint.x**2 + refPoint.y**2 + refPoint.z**2);
    if (handScale < 0.001) handScale = 0.1; // Tránh chia cho 0 hoặc số quá nhỏ

    // Các cặp điểm để tính khoảng cách (có thể giữ nguyên hoặc thử nghiệm thêm/bớt)
    const PAIRS = [
        [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], // Cổ tay -> đầu các ngón
        [4, 8], [8, 12], [12, 16], [16, 20],       // Đầu ngón -> đầu ngón kế
        [5, 8], [9, 12], [13, 16], [17, 20],       // Khớp gốc -> đầu ngón tương ứng
        [2, 4], [5, 4], [9, 4], [13, 4], [17, 4]   // Các khớp khác -> đầu ngón cái
    ]; // Tổng cộng 19 features

    for (const pair of PAIRS) {
        const p1 = relativeLandmarks[pair[0]];
        const p2 = relativeLandmarks[pair[1]];
        if (!p1 || !p2) {
             // console.warn("Thiếu điểm landmark cho cặp:", pair); // Có thể log lỗi nếu cần
             features.push(0); // Hoặc giá trị mặc định khác
             continue;
        }
        const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
        features.push(dist / handScale); // Chuẩn hóa theo tỷ lệ bàn tay
    }
    return features;
}


// --- 4. Hàm KNN (Giữ nguyên từ ori.js) ---
function euclideanDistance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length) {
        // console.warn("Kích thước vector không khớp hoặc không hợp lệ:", arr1, arr2);
        return Infinity;
    }
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
        sum += (arr1[i] - arr2[i]) ** 2;
    }
    return Math.sqrt(sum);
}

function predictKNN(currentFeatures, k) {
    if (trainingData.length < k || !currentFeatures) {
        return trainingData.length === 0 ? "Chưa có dữ liệu" : "Cần thêm dữ liệu";
    }

    const distances = trainingData
        .map(sample => ({
            label: sample.label,
            distance: euclideanDistance(sample.features, currentFeatures)
        }))
        .filter(item => isFinite(item.distance)); // Lọc bỏ các khoảng cách Infinity

    if (distances.length === 0) return "Lỗi tính khoảng cách";

    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);

    if (neighbors.length === 0) return "Không tìm thấy láng giềng";

    const labelCounts = {};
    neighbors.forEach(neighbor => {
        labelCounts[neighbor.label] = (labelCounts[neighbor.label] || 0) + 1;
    });

    let maxCount = 0;
    let predictedLabel = "Không chắc chắn";
    for (const label in labelCounts) {
        if (labelCounts[label] > maxCount) {
            maxCount = labelCounts[label];
            predictedLabel = label;
        }
    }

     // Ngưỡng tin cậy đơn giản (tùy chọn, cần thử nghiệm)
     let avgDistance = neighbors.reduce((acc, curr) => acc + curr.distance, 0) / neighbors.length;
     if (avgDistance > 0.35) { // Giá trị ngưỡng cần tinh chỉnh
        // console.log("KNN Prediction might be uncertain, avg dist:", avgDistance.toFixed(3));
        // return "Không chắc chắn"; // Có thể trả về không chắc chắn nếu khoảng cách lớn
     }


    return predictedLabel;
}

// --- 5. Xử Lý Kết Quả MediaPipe và Dự Đoán (Cập nhật để lưu chữ cái) ---
let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 150; // Giảm interval để phản hồi nhanh hơn một chút

function onHandResults(results) {
    // Vẽ camera và landmarks (Giữ nguyên phần vẽ)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    // Đảm bảo kích thước canvas khớp với video
    if (videoElement.videoWidth > 0) {
      if (canvasElement.width !== videoElement.videoWidth) {
          canvasElement.width = videoElement.videoWidth;
      }
      if (canvasElement.height !== videoElement.videoHeight) {
          canvasElement.height = videoElement.videoHeight;
      }
    }
    // Lật ngang canvas để hiển thị như gương
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    // Vẽ landmarks lên trên ảnh đã lật
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        // Vẽ các đường nối và điểm landmark (đảm bảo vẽ sau khi lật)
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
    }
    canvasCtx.restore(); // Khôi phục lại trạng thái canvas ban đầu (không lật)

    // Xử lý nhận diện
    currentLandmarks = null; // Reset landmarks
    let predictedLetter = "---"; // Giá trị mặc định hiển thị

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        currentLandmarks = handLandmarks; // Lưu lại để có thể dùng nếu cần

        const currentTime = Date.now();
        if (recognizing && (currentTime - lastPredictionTime > PREDICTION_INTERVAL)) {
            lastPredictionTime = currentTime;
            const features = extractDistanceFeatures(handLandmarks);
            if (features) {
                const prediction = predictKNN(features, K_NEIGHBORS);
                predictedLetter = prediction; // Hiển thị kết quả KNN

                // Chỉ cập nhật và bật nút Submit nếu là ký tự hợp lệ và game đang chạy
                if (ASL_ALPHABET_VALID.includes(prediction) && gameState === 'playing') {
                    currentRecognizedLetter = prediction; // Lưu chữ cái hợp lệ để Submit
                    submitGuessButton.disabled = false;
                } else {
                    currentRecognizedLetter = null; // Không có ký tự hợp lệ
                    submitGuessButton.disabled = true;
                }

            } else {
                predictedLetter = "Lỗi trích xuất";
                currentRecognizedLetter = null;
                submitGuessButton.disabled = true;
            }
        } else if (recognizing) {
             // Giữ lại ký tự cuối cùng hợp lệ nếu chưa đến interval mới
             predictedLetter = currentRecognizedLetter || "---";
             submitGuessButton.disabled = !currentRecognizedLetter || gameState !== 'playing';
        }
    } else {
        // Không thấy tay
        predictedLetter = "---";
        currentRecognizedLetter = null;
        if (recognizing) submitGuessButton.disabled = true;
    }

    // Cập nhật UI nhận diện (luôn cập nhật để người dùng thấy)
    recognizedCharText.textContent = predictedLetter;

}


// --- 6. Tải Dữ Liệu Mẫu (Giữ nguyên từ ori.js, chỉ load) ---
function loadTrainingData() {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    let loadedCount = 0;
    if (data) {
        try {
            trainingData = JSON.parse(data);
            if (!Array.isArray(trainingData)) {
                console.warn("Dữ liệu localStorage không phải mảng, reset.");
                trainingData = [];
            } else {
                 // Kiểm tra sơ bộ cấu trúc dữ liệu
                 trainingData = trainingData.filter(item =>
                    item && typeof item === 'object' && Array.isArray(item.features) && typeof item.label === 'string'
                 );
                 loadedCount = trainingData.length;
            }
        } catch(e) {
            console.error("Lỗi parse dữ liệu từ localStorage:", e);
            trainingData = [];
        }
    } else {
        trainingData = [];
    }
    console.log(`Đã tải ${loadedCount} mẫu huấn luyện.`);
    if (loadedCount === 0) {
         statusText.textContent = "Cảnh báo: Không tìm thấy dữ liệu mẫu trong localStorage!";
         alert("Không tìm thấy dữ liệu huấn luyện ASL đã lưu. Bạn cần huấn luyện mô hình ở trang gốc hoặc nhập file JSON trước.");
         // Cân nhắc vô hiệu hóa game nếu không có data
         startCameraButton.disabled = true;
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu). Nhấn 'Bật Camera'`;
    }
    // Không cần updateDataCount vì element đó đã bị xóa
}

// --- Loại bỏ các hàm save, capture, clear, export, import ---

// --- 7. Logic Game Hangman ---
function selectWord() {
    return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

function updateDisplay() {
    // Cập nhật từ cần đoán
    displayWord = currentWord.split('')
        .map(letter => (guessedLetters.has(letter) ? letter : '_'))
        .join(' ');
    wordToGuessElement.textContent = displayWord;

    // Cập nhật số lượt đoán sai
    guessesLeftElement.textContent = MAX_WRONG_GUESSES - wrongGuesses;

    // Cập nhật danh sách chữ đoán sai
    wrongGuessesElement.textContent = [...guessedLetters]
        .filter(letter => !currentWord.includes(letter))
        .join(', ');

    // Cập nhật trạng thái game
    gameStatusElement.textContent = ''; // Xóa thông báo cũ
    if (gameState === 'won') {
        gameStatusElement.textContent = '🎉 Bạn đã thắng! 🎉';
        gameStatusElement.style.color = 'green';
        stopRecognition(); // Dừng nhận diện khi game kết thúc
    } else if (gameState === 'lost') {
        gameStatusElement.textContent = `💀 Bạn đã thua! Từ cần đoán là: ${currentWord} 💀`;
        gameStatusElement.style.color = 'red';
        stopRecognition(); // Dừng nhận diện khi game kết thúc
    }
}

function checkGameState() {
    // Kiểm tra thắng: tất cả các chữ trong currentWord đều có trong guessedLetters
    const wordComplete = currentWord.split('').every(letter => guessedLetters.has(letter));
    if (wordComplete) {
        gameState = 'won';
    }
    // Kiểm tra thua: hết lượt đoán sai
    else if (wrongGuesses >= MAX_WRONG_GUESSES) {
        gameState = 'lost';
    } else {
        gameState = 'playing';
    }
}

function handleGuess(letter) {
    if (!letter || gameState !== 'playing') return; // Không xử lý nếu game đã kết thúc hoặc không có chữ

    letter = letter.toUpperCase(); // Đảm bảo là chữ hoa

    // Kiểm tra nếu chữ này đã đoán rồi
    if (guessedLetters.has(letter)) {
        // Có thể thêm thông báo nhỏ "Bạn đã đoán chữ này rồi"
        console.log(`Chữ '${letter}' đã được đoán.`);
        return;
    }

    // Thêm vào danh sách đã đoán
    guessedLetters.add(letter);

    // Kiểm tra xem chữ có trong từ không
    if (currentWord.includes(letter)) {
        // Đoán đúng, không làm gì thêm ở đây, updateDisplay sẽ xử lý
    } else {
        // Đoán sai
        wrongGuesses++;
    }

    // Kiểm tra lại trạng thái thắng/thua
    checkGameState();

    // Cập nhật giao diện
    updateDisplay();
}

function startGame() {
    // Reset trạng thái game
    currentWord = selectWord();
    guessedLetters = new Set();
    wrongGuesses = 0;
    gameState = 'playing';
    currentRecognizedLetter = null; // Reset chữ nhận diện
    recognizedCharText.textContent = "---";
    submitGuessButton.disabled = true; // Vô hiệu hóa nút submit ban đầu

    console.log("Game mới! Từ cần đoán (dev only):", currentWord);

    // Cập nhật giao diện ban đầu
    updateDisplay();

    // Nếu camera đang chạy, giữ nguyên
    // Nếu chưa chạy, người dùng cần nhấn nút "Bật Camera"
    statusText.textContent = recognizing ? 'Webcam đang chạy. Thực hiện thủ ngữ...' : `Game mới! Nhấn 'Bật Camera'`;
}

function stopRecognition() {
     if (recognizing) {
        recognizing = false;
        if (camera) camera.stop();
        startCameraButton.textContent = "Bật Camera & Nhận Diện";
        statusText.textContent = "Đã dừng camera.";
        recognizedCharText.textContent = "---";
        currentLandmarks = null;
        currentRecognizedLetter = null;
        submitGuessButton.disabled = true;
     }
}


// --- 8. Event Listeners ---
startCameraButton.onclick = async () => {
    if (!recognizing) {
        if (trainingData.length === 0) {
             alert("Không có dữ liệu huấn luyện. Không thể bắt đầu nhận diện.");
             return;
        }
        const cameraStarted = await initializeCamera();
        if (cameraStarted) {
            recognizing = true;
            startCameraButton.textContent = "Dừng Camera";
            // Nút submit sẽ được bật/tắt trong onHandResults
        }
    } else {
        stopRecognition(); // Gọi hàm dừng riêng biệt
    }
};

submitGuessButton.onclick = () => {
    if (currentRecognizedLetter && gameState === 'playing') {
        console.log("Submitting guess:", currentRecognizedLetter);
        handleGuess(currentRecognizedLetter);
        // Reset tạm thời để tránh submit nhầm liên tục
        currentRecognizedLetter = null;
        recognizedCharText.textContent = "---"; // Có thể giữ lại chữ vừa submit hoặc xóa đi
        submitGuessButton.disabled = true; // Vô hiệu hóa lại cho đến khi nhận diện được chữ mới
    } else {
         console.warn("Cannot submit guess. No valid letter recognized or game not playing.");
    }
};

restartGameButton.onclick = () => {
    startGame();
};

// --- 9. Khởi chạy ---
function main() {
    initializeMediaPipeHands(); // Tải MP và data trước
    startGame(); // Khởi tạo game lần đầu
}

main();

// --- END OF FILE public/hangman.js ---
