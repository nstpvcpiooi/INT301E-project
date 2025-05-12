// --- START OF FILE public/ori.js (MODIFIED FOR DUAL KEY IMPORT) ---

// --- DOM Elements ---
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

// --- NEW: DOM Elements for Dataset Selection & Import ---
const datasetKeySelectElement = document.getElementById('dataset-key-select');
const currentDatasetKeyDisplayElement = document.getElementById('current-dataset-key-display');
const importAlphanumericFileInput = document.getElementById('import-alphanumeric-file'); // Input cho chữ/số
const importMathFileInput = document.getElementById('import-math-file');           // Input cho toán học

// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognizing = false;
let currentLandmarks = null;

// --- KNN và Dữ Liệu ---
let trainingData = []; // Dữ liệu cho key hiện tại đang được chọn bởi dropdown
const K_NEIGHBORS = 3;

// --- NEW: Định nghĩa các Key cố định ---
const ALPHANUMERIC_KEY = 'text';
const MATH_KEY = 'math';
let currentWorkingKey = ALPHANUMERIC_KEY; // Key mặc định mà dropdown đang chọn để làm việc (thu thập, xóa, xuất)

// DANH SÁCH KÝ TỰ HỢP LỆ (Có thể điều chỉnh động dựa trên currentWorkingKey nếu cần)
const ASL_ALPHABET_GENERAL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '='];


// --- 1. Khởi Tạo MediaPipe Hands ---
function initializeMediaPipeHands() {
    mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    mediaPipeHands.onResults(onHandResults);
    statusText.textContent = "MediaPipe sẵn sàng. Chọn bộ dữ liệu và nhấn 'Bắt đầu Camera'.";
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
        statusText.textContent = 'Webcam đã bật. Thực hiện cử chỉ để thu thập mẫu.';
        if (captureSampleButton) captureSampleButton.disabled = false;
        return true;
    } catch (err) {
        console.error("Lỗi camera: ", err);
        statusText.textContent = 'Lỗi bật webcam. Kiểm tra quyền truy cập và console.';
        if (captureSampleButton) captureSampleButton.disabled = true;
        return false;
    }
}

// --- 3. Trích Xuất Đặc Trưng (Giữ nguyên) ---
function extractDistanceFeatures(landmarks) {
    // ... (Code giống hệt) ...
    if (!landmarks || landmarks.length !== 21) return null;
    const features = []; const wrist = landmarks[0];
    const relativeLandmarks = landmarks.map(lm => ({ x: lm.x - wrist.x, y: lm.y - wrist.y, z: (lm.z || 0) - (wrist.z || 0) }));
    const refPoint = relativeLandmarks[9];
    let handScale = Math.sqrt(refPoint.x**2 + refPoint.y**2 + refPoint.z**2);
    if (handScale < 0.001) handScale = 0.1;
    const PAIRS = [ [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], [4, 8], [8, 12], [12, 16], [16, 20], [5, 8], [9, 12], [13, 16], [17, 20], [2, 4], [5, 4], [9, 4], [13, 4], [17, 4] ];
    for (const pair of PAIRS) {
        const p1 = relativeLandmarks[pair[0]]; const p2 = relativeLandmarks[pair[1]];
        if (!p1 || !p2) { console.warn("Thiếu landmark:", pair); features.push(0); continue; }
        const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
        features.push(dist / handScale);
    } return features;
}

// --- 4. Hàm KNN (Giữ nguyên) ---
function euclideanDistance(arr1, arr2) {
    // ... (Code giống hệt) ...
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
    return Math.sqrt(sum);
}
function predictKNN(currentFeatures, k) {
    // ... (Code giống hệt, đảm bảo trainingData được tải từ currentWorkingKey) ...
     if (!Array.isArray(trainingData) || trainingData.length < k || !currentFeatures) {
         return trainingData?.length === 0 ? "Chưa có dữ liệu" : "Cần thêm dữ liệu";
     }
     const distances = trainingData
        .map(sample => {
             if (!sample || !Array.isArray(sample.features)) return { label: null, distance: Infinity };
             return { label: sample.label, distance: euclideanDistance(sample.features, currentFeatures)};
        })
        .filter(item => item.label !== null && isFinite(item.distance));
     if (distances.length === 0) return "Lỗi khoảng cách";
     distances.sort((a, b) => a.distance - b.distance);
     const neighbors = distances.slice(0, k);
     if (neighbors.length === 0) return "Không thấy láng giềng";
     const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
     let maxCount = 0; let predictedLabel = "Không chắc";
     for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
     let avgDistance = neighbors.reduce((acc, curr) => acc + curr.distance, 0) / k;
     if (avgDistance > 0.38) { /* predictedLabel = "?"; */ }
     return predictedLabel;
}

// --- 5. Xử Lý Kết Quả MediaPipe (Giữ nguyên) ---
let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 200;
function onHandResults(results) {
    // ... (Giữ nguyên code vẽ và gọi predictKNN) ...
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

        canvasCtx.save();
        canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
        canvasCtx.restore();

        const currentTime = Date.now();
        if (recognizing && (currentTime - lastPredictionTime > PREDICTION_INTERVAL)) {
            lastPredictionTime = currentTime;
            const features = extractDistanceFeatures(handLandmarks);
            if (features) {
                const prediction = predictKNN(features, K_NEIGHBORS); // Dùng trainingData của currentWorkingKey
                if(recognizedCharText) recognizedCharText.textContent = prediction;
            }
        }
    } else {
        if (recognizing && recognizedCharText) recognizedCharText.textContent = "Không thấy tay";
    }
}

// --- 6. Thu Thập và Lưu Trữ Dữ Liệu (MODIFIED) ---
function loadTrainingDataForCurrentKey() { // Đổi tên hàm cho rõ
    console.log(`Loading data for current working key: ${currentWorkingKey}`);
    const data = localStorage.getItem(currentWorkingKey);
    trainingData = []; // Reset dữ liệu trong bộ nhớ
    if (data) {
        try {
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                trainingData = parsedData.filter(item => item?.features?.length > 0 && typeof item.label === 'string');
            } else { console.warn(`Data in ${currentWorkingKey} is not an array.`); }
        } catch(e) {
            console.error(`Error parsing data from ${currentWorkingKey}:`, e);
        }
    } else {
        console.log(`No training data found for key ${currentWorkingKey}.`);
    }
    updateDataCount(); // Cập nhật số lượng mẫu cho key hiện tại
    if (currentDatasetKeyDisplayElement && datasetKeySelectElement) {
        const selectedOption = datasetKeySelectElement.options[datasetKeySelectElement.selectedIndex];
        currentDatasetKeyDisplayElement.textContent = selectedOption ? selectedOption.text : currentWorkingKey;
    }
}

function saveTrainingDataToCurrentKey() { // Đổi tên hàm cho rõ
    try {
        localStorage.setItem(currentWorkingKey, JSON.stringify(trainingData));
        console.log(`Data saved to ${currentWorkingKey}. Total samples for this key: ${trainingData.length}`);
    } catch (e) {
        console.error("Lỗi khi lưu vào localStorage:", e);
        console.warn("Lỗi: Không thể lưu dữ liệu, localStorage có thể đã đầy.");
    }
    updateDataCount();
}

// Hàm này riêng để lưu dữ liệu đã import vào key CỤ THỂ
function saveDataToSpecificKey(key, dataToSave) {
    try {
        localStorage.setItem(key, JSON.stringify(dataToSave));
        console.log(`Imported data saved to specific key: ${key}. Total samples: ${dataToSave.length}`);
        // Nếu key được import vào là key đang làm việc, cập nhật UI
        if (key === currentWorkingKey) {
            trainingData = dataToSave; // Cập nhật trainingData trong bộ nhớ
            updateDataCount();
        }
    } catch (e) {
        console.error(`Lỗi khi lưu dữ liệu vào key ${key}:`, e);
    }
}


function updateDataCount() {
    if (dataCountElement) {
        dataCountElement.textContent = trainingData.length; // trainingData là của currentWorkingKey
    }
}

// --- Event listener cho Dataset Selector ---
if (datasetKeySelectElement) {
    datasetKeySelectElement.onchange = (event) => {
        currentWorkingKey = event.target.value;
        console.log(`Switched to working dataset key: ${currentWorkingKey}`);
        loadTrainingDataForCurrentKey(); // Tải dữ liệu cho key mới
        if (recognizing) {
            if(startButton) startButton.click(); // Dừng nhận diện nếu đang chạy
        }
        if(recognizedCharText) recognizedCharText.textContent = "---";
        statusText.textContent = `Đã chuyển sang làm việc với bộ dữ liệu: ${currentWorkingKey}.`;
    };
}

// --- Xử lý sự kiện nút ---
if (captureSampleButton) {
    captureSampleButton.onclick = () => {
        if (!recognizing || !currentLandmarks) {
            console.warn("Bật camera và đảm bảo tay trong khung hình.");
            return;
        }
        const label = charLabelInput.value.trim().toUpperCase();
        if (!label) { console.warn("Nhập nhãn!"); charLabelInput.focus(); return; }
        if (!ASL_ALPHABET_GENERAL.includes(label)) {
            console.warn(`Nhãn '${label}' không hợp lệ.`); charLabelInput.focus(); return;
        }
        const features = extractDistanceFeatures(currentLandmarks);
        if (features) {
            // trainingData ở đây là của currentWorkingKey
            trainingData.push({ features: features, label: label });
            saveTrainingDataToCurrentKey(); // Lưu vào key đang làm việc
            console.log(`Lưu mẫu: ${label} vào ${currentWorkingKey}`);
            statusText.textContent = `Lưu mẫu '${label}'. (${trainingData.length} mẫu trong ${currentWorkingKey})`;
        } else { console.warn("Không trích xuất được đặc trưng."); }
    };
}

if (clearDataButton) {
    clearDataButton.onclick = () => {
        if (confirm(`Xóa TẤT CẢ dữ liệu cho bộ "${currentWorkingKey}"?`)) {
            localStorage.removeItem(currentWorkingKey);
            trainingData = []; // Clear mảng trong bộ nhớ
            loadTrainingDataForCurrentKey(); // Tải lại (sẽ là rỗng) và cập nhật UI
            statusText.textContent = `Đã xóa dữ liệu cho "${currentWorkingKey}".`;
            if(recognizedCharText) recognizedCharText.textContent = "---";
        }
    };
}

if (exportDataButton) {
    exportDataButton.onclick = () => {
        // trainingData ở đây là của currentWorkingKey
        if (trainingData.length === 0) { console.warn("Không có dữ liệu để xuất."); return; }
        const jsonData = JSON.stringify(trainingData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asl_training_data_${currentWorkingKey}.json`; // Tên file kèm key
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusText.textContent = `Đã xuất dữ liệu từ "${currentWorkingKey}".`;
    };
}

// --- Hàm xử lý nhập file chung ---
function handleImportFile(file, targetKey, fileInputElement) {
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedDataFromFile = JSON.parse(e.target.result);
                if (Array.isArray(importedDataFromFile) && importedDataFromFile.every(item => item.features && item.label)) {
                    if (confirm(`Tìm thấy ${importedDataFromFile.length} mẫu. THAY THẾ dữ liệu cho key "${targetKey}"?`)) {
                        saveDataToSpecificKey(targetKey, importedDataFromFile); // Lưu vào key cụ thể
                        statusText.textContent = `Đã nhập ${importedDataFromFile.length} mẫu vào key "${targetKey}".`;
                        // Nếu key được import là key đang làm việc, load lại để UI cập nhật
                        if (targetKey === currentWorkingKey) {
                            loadTrainingDataForCurrentKey();
                        }
                    }
                } else { console.warn("File JSON không đúng định dạng."); }
            } catch (err) { console.error("Lỗi đọc/parse file JSON:", err.message); }
            if(fileInputElement) fileInputElement.value = ''; // Reset input
        };
        reader.readAsText(file);
    }
}

// --- Event Listeners cho các nút Import riêng biệt ---
if (importAlphanumericFileInput) {
    importAlphanumericFileInput.onchange = (event) => {
        handleImportFile(event.target.files[0], ALPHANUMERIC_KEY, importAlphanumericFileInput);
    };
}

if (importMathFileInput) {
    importMathFileInput.onchange = (event) => {
        handleImportFile(event.target.files[0], MATH_KEY, importMathFileInput);
    };
}


// --- 7. Hàm Chính và Điều Khiển ---
async function main() {
    initializeMediaPipeHands();
    if (datasetKeySelectElement) {
        currentWorkingKey = datasetKeySelectElement.value; // Lấy key từ dropdown khi tải
    }
    loadTrainingDataForCurrentKey(); // Tải dữ liệu cho key đang làm việc

    if (startButton) {
        startButton.onclick = async () => {
            if (!recognizing) {
                const cameraStarted = await initializeCamera();
                if (cameraStarted) {
                    recognizing = true;
                    startButton.textContent = "Dừng Camera";
                }
            } else {
                recognizing = false;
                if (camera) camera.stop();
                startButton.textContent = "Bắt đầu Camera";
                statusText.textContent = "Đã dừng. Nhấn 'Bắt đầu Camera' để tiếp tục.";
                if(recognizedCharText) recognizedCharText.textContent = "---";
                currentLandmarks = null;
                if (captureSampleButton) captureSampleButton.disabled = true;
            }
        };
    }
}

main();
// --- END OF FILE public/ori.js (MODIFIED FOR DUAL KEY IMPORT) ---