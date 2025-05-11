const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startButton = document.getElementById('start-button');
const dataCountElement = document.getElementById('data-count');
const charLabelInput = document.getElementById('char-label');
const captureSampleButton = document.getElementById('capture-sample-button');
const clearDataButton = document.getElementById('clear-data-button');
const exportDataButton = document.getElementById('export-data-button');
const importFileInput = document.getElementById('import-file');

let mediaPipeHands = null;
let camera = null;
let recognizing = false;
let currentLandmarks = null; // Lưu landmarks hiện tại để thu thập mẫu

// --- KNN và Dữ Liệu ---
let trainingData = []; // { features: [...], label: 'A' }
const K_NEIGHBORS = 3; // Số láng giềng cho KNN (có thể thử nghiệm 3, 5, 7)

// DANH SÁCH CÁC CHỮ CÁI ASL (bỏ J, Z vì chúng động)
const ASL_ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', // Chữ cái (bỏ J, Z) vì kho nhan dien
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const LOCAL_STORAGE_KEY = 'aslTrainingDataKNN_v1';

// --- 1. Khởi Tạo MediaPipe Hands ---
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

// --- 2. Khởi Tạo Camera ---
async function initializeCamera() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                await mediaPipeHands.send({ image: videoElement });
            }
        },
        width: 480, height: 360
    });
    try {
        await camera.start();
        statusText.textContent = 'Webcam đã bật. Thực hiện cử chỉ và thu thập mẫu.';
        captureSampleButton.disabled = false;
        return true;
    } catch (err) {
        console.error("Lỗi camera: ", err);
        statusText.textContent = 'Lỗi bật webcam. Kiểm tra quyền truy cập và console.';
        captureSampleButton.disabled = true;
        return false;
    }
}

// --- 3. Trích Xuất Đặc Trưng Khoảng Cách Đơn Giản ---
function extractDistanceFeatures(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;

    const features = [];
    const wrist = landmarks[0];

    const relativeLandmarks = landmarks.map(lm => ({
        x: lm.x - wrist.x,
        y: lm.y - wrist.y,
        z: (lm.z || 0) - (wrist.z || 0)
    }));

    const refPoint = relativeLandmarks[9]; // Gốc ngón giữa
    let handScale = Math.sqrt(refPoint.x**2 + refPoint.y**2 + refPoint.z**2);
    if (handScale < 0.001) handScale = 0.1; // Tránh chia cho 0 hoặc số quá nhỏ

    // Các cặp điểm để tính khoảng cách
    const PAIRS = [
        [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], // Cổ tay -> đầu các ngón
        [4, 8], [8, 12], [12, 16], [16, 20],       // Đầu ngón -> đầu ngón kế
        [5, 8], [9, 12], [13, 16], [17, 20],       // Khớp gốc -> đầu ngón tương ứng
        [2, 4], [5, 4], [9, 4], [13, 4], [17, 4]   // Các khớp khác -> đầu ngón cái
    ]; // Tổng cộng 15 + 4 = 19 features

    for (const pair of PAIRS) {
        const p1 = relativeLandmarks[pair[0]];
        const p2 = relativeLandmarks[pair[1]];
        if (!p1 || !p2) { // Kiểm tra nếu điểm không tồn tại (dù hiếm với MediaPipe đầy đủ)
            console.warn("Thiếu điểm landmark cho cặp:", pair);
            features.push(0); // Hoặc một giá trị mặc định khác
            continue;
        }
        const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
        features.push(dist / handScale);
    }
    return features;
}

// --- 4. Hàm KNN ---
function euclideanDistance(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        // console.warn("Kích thước vector đặc trưng không khớp cho Euclidean distance.");
        return Infinity; // Trả về vô cực nếu kích thước không khớp
    }
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
        sum += (arr1[i] - arr2[i]) ** 2;
    }
    return Math.sqrt(sum);
}

function predictKNN(currentFeatures, k) {
    if (trainingData.length < k || !currentFeatures) { // Cần ít nhất k mẫu để KNN hoạt động đúng
        return trainingData.length === 0 ? "Chưa có dữ liệu mẫu" : "Cần thêm dữ liệu mẫu";
    }

    const distances = trainingData.map(sample => {
        const dist = euclideanDistance(sample.features, currentFeatures);
        return { label: sample.label, distance: dist };
    });

    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);

    const labelCounts = {};
    for (const neighbor of neighbors) {
        labelCounts[neighbor.label] = (labelCounts[neighbor.label] || 0) + 1;
    }

    let maxCount = 0;
    let predictedLabel = "Không chắc chắn";
    for (const label in labelCounts) {
        if (labelCounts[label] > maxCount) {
            maxCount = labelCounts[label];
            predictedLabel = label;
        }
    }
    // Thêm một ngưỡng tin cậy đơn giản dựa trên khoảng cách trung bình của các neighbor
    let avgDistance = neighbors.reduce((acc, curr) => acc + curr.distance, 0) / k;
    if (avgDistance > 0.35) { // Ngưỡng này cần thử nghiệm, càng nhỏ càng "chắc chắn"
        // console.log("KNN Prediction not confident enough, avg dist:", avgDistance);
        // return "Không chắc chắn";
    }

    return predictedLabel;
}

// --- 5. Xử Lý Kết Quả MediaPipe và Dự Đoán ---
let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 200; // ms

function onHandResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (videoElement.videoWidth > 0) {
        if (canvasElement.width !== videoElement.videoWidth) canvasElement.width = videoElement.videoWidth;
        if (canvasElement.height !== videoElement.videoHeight) canvasElement.height = videoElement.videoHeight;
    }
    canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    currentLandmarks = null;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        currentLandmarks = handLandmarks;

        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });

        const currentTime = Date.now();
        if (recognizing && (currentTime - lastPredictionTime > PREDICTION_INTERVAL)) {
            lastPredictionTime = currentTime;
            const features = extractDistanceFeatures(handLandmarks);
            if (features) {
                const prediction = predictKNN(features, K_NEIGHBORS);
                recognizedCharText.textContent = prediction;
            } else {
                // recognizedCharText.textContent = "Lỗi trích xuất";
            }
        }
    } else {
        if (recognizing) recognizedCharText.textContent = "Không thấy tay";
    }
    // canvasCtx.restore(); // Đã restore sau khi vẽ ảnh, không cần ở đây nữa
}

// --- 6. Thu Thập và Lưu Trữ Dữ Liệu Mẫu (LocalStorage) ---
function loadTrainingData() {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
        try {
            trainingData = JSON.parse(data);
            if (!Array.isArray(trainingData)) trainingData = []; // Đảm bảo là mảng
        } catch(e) {
            console.error("Lỗi parse dữ liệu từ localStorage:", e);
            trainingData = [];
        }
    } else {
        trainingData = []; // Khởi tạo mảng rỗng nếu không có gì trong localStorage
    }
    updateDataCount();
}

function saveTrainingData() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trainingData));
    } catch (e) {
        console.error("Lỗi khi lưu vào localStorage (có thể đầy):", e);
        alert("Lỗi: Không thể lưu dữ liệu, localStorage có thể đã đầy.");
    }
    updateDataCount();
}

function updateDataCount() {
    dataCountElement.textContent = trainingData.length;
}

captureSampleButton.onclick = () => {
    const label = charLabelInput.value.trim().toUpperCase();
    if (!label) {
        alert("Vui lòng nhập nhãn chữ cái!");
        charLabelInput.focus();
        return;
    }
    if (!ASL_ALPHABET.includes(label)) {
        alert(`Nhãn '${label}' không hợp lệ. Chỉ chấp nhận các chữ cái A-Y (không bao gồm J, Z).`);
        charLabelInput.focus();
        return;
    }
    if (currentLandmarks) {
        const features = extractDistanceFeatures(currentLandmarks);
        if (features) {
            trainingData.push({ features: features, label: label });
            saveTrainingData();
            // charLabelInput.value = ''; // Không xóa để người dùng có thể lưu nhiều mẫu cho cùng 1 nhãn
            console.log(`Đã lưu mẫu cho: ${label}`);
            statusText.textContent = `Đã lưu mẫu cho '${label}'. (${trainingData.length} mẫu tổng cộng)`;
        } else {
            alert("Không thể trích xuất đặc trưng từ cử chỉ hiện tại.");
        }
    } else {
        alert("Không có dữ liệu tay để chụp mẫu. Hãy đảm bảo tay bạn trong khung hình và webcam đang chạy.");
    }
};

clearDataButton.onclick = () => {
    if (confirm("Bạn có chắc muốn xóa TẤT CẢ dữ liệu mẫu đã lưu trong trình duyệt này không? Hành động này không thể hoàn tác.")) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        trainingData = [];
        loadTrainingData(); // Cập nhật UI
        statusText.textContent = "Đã xóa tất cả dữ liệu mẫu.";
        recognizedCharText.textContent = "---";
    }
};

exportDataButton.onclick = () => {
    if (trainingData.length === 0) {
        alert("Không có dữ liệu mẫu để xuất.");
        return;
    }
    const jsonData = JSON.stringify(trainingData, null, 2); // null, 2 để format đẹp
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asl_knn_training_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusText.textContent = "Đã xuất dữ liệu mẫu.";
};

importFileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (Array.isArray(importedData) && importedData.every(item => item.features && item.label)) {
                    if (confirm(`Tìm thấy ${importedData.length} mẫu. Bạn có muốn THAY THẾ dữ liệu hiện tại bằng dữ liệu nhập vào không?`)) {
                        trainingData = importedData;
                        saveTrainingData();
                        statusText.textContent = `Đã nhập ${trainingData.length} mẫu.`;
                    }
                } else {
                    alert("File JSON không đúng định dạng dữ liệu mẫu.");
                }
            } catch (err) {
                alert("Lỗi khi đọc hoặc parse file JSON: " + err.message);
            }
             // Reset input file để có thể chọn lại cùng file nếu cần
            importFileInput.value = '';
        };
        reader.readAsText(file);
    }
};


// ... (giữ nguyên tất cả code trước hàm main) ...

// ==================== PHẦN TỪ ĐIỂN ĐÃ ĐƯỢC CẢI TIẾN ====================

// Thêm các biến toàn cục
let currentWord = null;
let currentLetterIndex = 0;
let dictionaryMode = false;
let autoNextTimeout = null;
const LETTER_DELAY = 1500; // 1.5 giây delay trước khi chuyển ký tự

// Hàm bắt đầu từ điển
function startDictionary() {
    const input = document.getElementById('dictionary-input').value.trim().toUpperCase();
    
    if (!input) {
        alert("Vui lòng nhập từ cần thực hiện!");
        return;
    }
    
    // Lọc chỉ giữ lại các ký tự hợp lệ
    currentWord = input.split('').filter(char => 
        ASL_ALPHABET.includes(char)
    ).join('');
    
    if (currentWord.length === 0) {
        alert("Từ nhập vào không chứa ký tự ASL hợp lệ!");
        return;
    }
    
    dictionaryMode = true;
    currentLetterIndex = 0;
    
    // Hiển thị từ và ký tự đầu tiên
    updateDictionaryDisplay();
    
    // Cập nhật trạng thái nút
    document.getElementById('next-letter-button').disabled = false;
    document.getElementById('start-dictionary-button').disabled = true;
    document.getElementById('dictionary-input').disabled = true;
    
    statusText.textContent = `Bắt đầu từ: ${currentWord} - Ký tự đầu tiên: ${currentWord[0]}`;
}

// Cập nhật hiển thị từ điển
function updateDictionaryDisplay() {
    document.getElementById('current-word').textContent = currentWord;
    document.getElementById('current-dict-char').textContent = currentWord[currentLetterIndex];
    document.getElementById('current-progress').textContent = `${currentLetterIndex + 1}/${currentWord.length}`;
    
    // Thêm hiệu ứng
    const charElement = document.getElementById('current-dict-char');
    charElement.classList.add('letter-transition');
    setTimeout(() => charElement.classList.remove('letter-transition'), 300);
}

// Hàm xử lý khi nhận diện đúng ký tự
function handleCorrectLetter(predictedChar) {
    const feedbackElement = document.getElementById('recognized-char');
    feedbackElement.textContent = `Chính xác! Đã nhận diện: ${predictedChar}`;
    feedbackElement.className = "correct";
    
    // Xóa timeout cũ nếu có
    if (autoNextTimeout) clearTimeout(autoNextTimeout);
    
    // Tự động chuyển sau độ trễ
    autoNextTimeout = setTimeout(() => {
        moveToNextLetter();
        feedbackElement.textContent = "";
    }, LETTER_DELAY);
}

// Hàm xử lý khi nhận diện sai
function handleIncorrectLetter(expectedChar, predictedChar) {
    const feedbackElement = document.getElementById('recognized-char');
    
    if (predictedChar === "Không chắc chắn") {
        feedbackElement.textContent = "Không nhận diện được cử chỉ rõ ràng";
    } else {
        feedbackElement.textContent = `Sai! (Nhận diện: ${predictedChar}, Cần: ${expectedChar})`;
    }
    feedbackElement.className = "incorrect";
}

// Di chuyển đến ký tự tiếp theo
function moveToNextLetter() {
    currentLetterIndex++;
    
    if (currentLetterIndex < currentWord.length) {
        updateDictionaryDisplay();
        statusText.textContent = `Từ: ${currentWord} - Ký tự hiện tại: ${currentWord[currentLetterIndex]}`;
    } else {
        finishDictionary();
    }
}

// Hoàn thành từ điển
function finishDictionary() {
    document.getElementById('current-dict-char').textContent = "✓";
    document.getElementById('recognized-char').textContent = `Hoàn thành từ: ${currentWord}`;
    document.getElementById('recognized-char').className = "correct";
    
    // Tự động reset sau 3 giây
    setTimeout(resetDictionary, 3000);
}

// Reset từ điển
function resetDictionary() {
    // Xóa timeout nếu có
    if (autoNextTimeout) {
        clearTimeout(autoNextTimeout);
        autoNextTimeout = null;
    }
    
    dictionaryMode = false;
    currentWord = null;
    currentLetterIndex = 0;
    
    // Reset giao diện
    document.getElementById('current-word').textContent = "---";
    document.getElementById('current-dict-char').textContent = "---";
    document.getElementById('current-progress').textContent = "0/0";
    document.getElementById('dictionary-input').value = "";
    document.getElementById('recognized-char').textContent = "";
    document.getElementById('recognized-char').className = "";
    
    // Reset trạng thái nút
    document.getElementById('next-letter-button').disabled = true;
    document.getElementById('start-dictionary-button').disabled = false;
    document.getElementById('dictionary-input').disabled = false;
}

// Hàm verifySign đã được cải tiến
function verifySign(predictedChar) {
    if (dictionaryMode && currentWord) {
        const expectedChar = currentWord[currentLetterIndex];
        
        if (predictedChar === expectedChar) {
            handleCorrectLetter(predictedChar);
        } else {
            handleIncorrectLetter(expectedChar, predictedChar);
        }
    }
}

// ==================== CẬP NHẬT HÀM MAIN ====================

function main() {
    initializeMediaPipeHands();
    loadTrainingData();
    
    // Khởi tạo sự kiện cho từ điển
    document.getElementById('start-dictionary-button').addEventListener('click', startDictionary);
    document.getElementById('next-letter-button').addEventListener('click', moveToNextLetter);
    document.getElementById('reset-dictionary-button').addEventListener('click', resetDictionary);
    
    startButton.onclick = async () => {
        if (!recognizing) {
            const cameraStarted = await initializeCamera();
            if (cameraStarted) {
                recognizing = true;
                startButton.textContent = "Dừng";
            }
        } else {
            recognizing = false;
            if (camera) camera.stop();
            startButton.textContent = "Bắt đầu";
            statusText.textContent = "Đã dừng. Nhấn 'Bắt đầu' để tiếp tục.";
            recognizedCharText.textContent = "---";
            currentLandmarks = null;
            captureSampleButton.disabled = true;
        }
    };
}




main();