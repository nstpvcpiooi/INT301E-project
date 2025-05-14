// --- 1. Khai báo biến và khởi tạo ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const canvasCtx = canvas.getContext('2d');
const recognizedTextElement = document.getElementById('recognizedText');
const recognizedCharText = document.getElementById('recognized-char');
const responseElement = document.getElementById('response');
const startCameraButton = document.getElementById('startCamera'); // Nút "Bật Camera"
const sendButton = document.getElementById('send-button');
const statusText = document.getElementById('status-text');
const LOCAL_STORAGE_KEY = 'text';
const K_NEIGHBORS = 5; // Có thể điều chỉnh
const ASL_ALPHABET_VALID = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']; // Các ký tự hợp lệ cho game

let currentRecognizedLetter = null;
let recognizedSequence = ''; // Chuỗi ký tự thủ ngữ
let camera = null;
let mediaPipeHands = null;
let trainingData = []; // Dữ liệu huấn luyện cho mô hình
let stablePrediction = null; // Dự đoán ổn định
let stableStartTime = null; // Thời gian bắt đầu dự đoán ổn định
let recognizing = false; // Trạng thái nhận diện
const STABLE_DURATION = 2000; // Thời gian cần giữ ổn định (2 giây)
const INACTIVITY_DURATION = 1000; // Thời gian không hoạt động (1 giây)

function initializeMediaPipeHands() {
    statusText.textContent = "Đang tải MediaPipe...";
    mediaPipeHands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    mediaPipeHands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
    });
    mediaPipeHands.onResults(onHandResults); // Callback khi có kết quả
    statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
    loadTrainingData(); // Tải dữ liệu huấn luyện
}

// --- 2. Khởi Tạo Camera (Giữ nguyên từ ori.js, nhưng cập nhật text) ---
async function initializeCamera() {
    statusText.textContent = 'Đang khởi tạo webcam...';
    camera = new Camera(video, {
        onFrame: async () => {
            // Đảm bảo video sẵn sàng trước khi gửi frame
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
                await mediaPipeHands.send({ image: video });
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
        sendButton.disabled = true;
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
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    // Đảm bảo kích thước canvas khớp với video
    if (video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
      }
      if (canvas.height !== video.videoHeight) {
          canvas.height = video.videoHeight;
      }
    }
    // Lật ngang canvas để hiển thị như gương
    canvasCtx.translate(canvas.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    // Vẽ landmarks lên trên ảnh đã lật
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        // Vẽ các đường nối và điểm landmark (đảm bảo vẽ sau khi lật)
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
    }
    canvasCtx.restore(); // Khôi phục lại trạng thái canvas ban đầu (không lật)

    let predictedLetter = "---";

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        const currentTime = Date.now();

        if (recognizing) {
            const features = extractDistanceFeatures(handLandmarks);
            if (features) {
                const prediction = predictKNN(features, K_NEIGHBORS);

                // Kiểm tra nếu dự đoán giống với dự đoán trước đó
                if (prediction === stablePrediction) {
                    // Nếu dự đoán ổn định, kiểm tra thời gian
                    if (!stableStartTime) {
                        stableStartTime = currentTime; // Bắt đầu đếm thời gian
                    } else if (currentTime - stableStartTime >= STABLE_DURATION) {
                        // Nếu giữ ổn định hơn 2 giây, thêm vào tin nhắn
                        recognizedSequence += prediction;
                        console.log("Dự đoán ổn định:", prediction);
                        recognizedTextElement.textContent = recognizedSequence;
                        stableStartTime = null; // Reset thời gian
                    }
                } else {
                    // Nếu dự đoán thay đổi, reset thời gian
                    stablePrediction = prediction;
                    stableStartTime = null;
                }

                predictedLetter = prediction; // Hiển thị dự đoán hiện tại
            } else {
                predictedLetter = "Lỗi trích xuất";
            }
        }
    } else {
        // Nếu không có cử chỉ nào được nhận diện
        const currentTime = Date.now();
        if (currentTime - lastPredictionTime > INACTIVITY_DURATION) {
            recognizedSequence += " "; // Thêm khoảng cách
            recognizedTextElement.textContent = recognizedSequence;
            console.log("Thêm khoảng cách do không hoạt động");
            lastPredictionTime = currentTime; // Cập nhật thời gian dự đoán cuối cùng
        }
    }

    recognizedCharText.textContent = predictedLetter;
    if (recognizedSequence.length > 0) {
        sendButton.disabled = false; // Bật nút gửi
    }
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

function initState() {
    // Khởi tạo trạng thái ban đầu
    recognizedSequence = '';
    recognizedTextElement.textContent = recognizedSequence;
    responseElement.textContent = '';
    startCameraButton.disabled = false; // Bật nút camera
    sendButton.disabled = true; // Bật nút gửi
    //submitGuessButton.disabled = true; // Bật nút submit
    //gameState = 'waiting'; // Trạng thái chờ
    recognizing = false; // Không nhận diện ngay
}

startCameraButton.onclick = async () => {
    if (!recognizing) {
        if (trainingData.length === 0) {
             alert("Không có dữ liệu huấn luyện. Không thể bắt đầu nhận diện.");
             return;
        }
        const cameraStarted = await initializeCamera();
        if (cameraStarted) {
            recognizing = true;
            startCameraButton.innerHTML = '<i class="fa-solid fa-stop" style="margin-right: 10px;"></i>Dừng';
            // Nút submit sẽ được bật/tắt trong onHandResults
        }
    } else {
        stopRecognition(); // Gọi hàm dừng riêng biệt
    }
};

sendButton.onclick = async () => {
    if (recognizedSequence.length > 0) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}` // Sử dụng API key từ config.js
            },
            body: JSON.stringify({
                model: 'gpt-4', // Hoặc 'gpt-4-turbo' nếu bạn muốn sử dụng phiên bản nhanh hơn
                messages: [
                    { role: 'system', content: 'Bạn là một chatbot hỗ trợ người dùng.' },
                    { role: 'user', content: recognizedSequence }
                ],
                max_tokens: 100,
                temperature: 0.7
            })
        });

        const data = await response.json();
        if (data && data.choices && data.choices.length > 0) {
            responseElement.textContent = data.choices[0].message.content;
            console.log("Phản hồi từ OpenAI:", data.choices[0].message.content);
        } else {
            responseElement.textContent = "Không có phản hồi từ OpenAI.";
        }
    } else {
        alert("Tin nhắn không được rỗng");
    }
}

function toggleInstructions() {
    const instructionBox = document.querySelector('.instruction-box');
    instructionBox.classList.toggle('collapsed');
}

// Hàm chính để khởi tạo khi vào route /chatbot
function main() {
        loadTrainingData(); // Tải dữ liệu huấn luyện
        initializeMediaPipeHands(); // Khởi tạo MediaPipe Hands
        initState();
}

function stopRecognition() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    recognizing = false;
    startCameraButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bắt đầu';
    if (recognizedSequence === '') {
        sendButton.disabled = true; // Tắt nút gửi
    } // Tắt nút gửi
    //submitGuessButton.disabled = true; // Tắt nút submit
}
main();