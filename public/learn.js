// --- START OF FILE public/learn.js ---

// --- DOM Elements ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startCameraButton = document.getElementById('start-camera-button');
const wordInputElement = document.getElementById('word-input');
const useWordButton = document.getElementById('use-word-button');
const randomWordButton = document.getElementById('random-word-button');
const targetWordDisplayElement = document.getElementById('target-word-display');
const currentLetterInstructionElement = document.getElementById('current-letter-instruction');
const currentLetterTargetElement = document.getElementById('current-letter-target');
const feedbackMessageElement = document.getElementById('feedback-message');
const completionMessageElement = document.getElementById('completion-message');
const resetLearnButton = document.getElementById('reset-learn-button');


// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognizing = false; // Chỉ trạng thái camera/mediapipe đang chạy
let currentLandmarks = null;

// --- ASL Recognition (KNN) ---
let trainingData = [];
const K_NEIGHBORS = 5; // Có thể điều chỉnh
// DANH SÁCH CÁC KÝ TỰ HỢP LỆ CHO TỪ (Có thể bỏ số nếu chỉ muốn học chữ)
const VALID_LEARN_CHARS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const LOCAL_STORAGE_KEY = 'text'; // Dùng chung data đã huấn luyện
let currentRecognizedLetter = null; // Ký tự đang nhận diện được

// --- Learning Logic ---
const LEARN_WORD_LIST = ["HELLO", "WORLD", "LEARN", "SIGN", "CODE", "WATER", "HAPPY", "PYTHON", "YES", "NO", "NAME"]; // Danh sách từ mẫu
let targetWord = '';
let currentLetterIndex = 0;
let isLearningActive = false; // Đánh dấu đang trong quá trình học 1 từ
let lastCorrectRecognitionTime = 0;
const MIN_HOLD_TIME_MS = 800; // Miligiây cần giữ đúng ký tự để xác nhận

// --- 1. Khởi Tạo MediaPipe Hands (Giữ nguyên) ---
function initializeMediaPipeHands() {
    console.log("Initializing MediaPipe Hands...");
    statusText.textContent = "Đang tải MediaPipe...";
    try {
        mediaPipeHands = new Hands({ /* ... options ... */
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        mediaPipeHands.onResults(onHandResults);
        console.log("MediaPipe Hands initialized.");
        statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
        loadTrainingData(); // Tải dữ liệu huấn luyện
    } catch (error) {
        console.error("Failed to initialize MediaPipe Hands:", error);
        statusText.textContent = "Lỗi: Không thể khởi tạo MediaPipe.";
        alert("Lỗi tải thư viện MediaPipe. Kiểm tra mạng và thử lại.");
        startCameraButton.disabled = true;
    }
}

// --- 2. Khởi Tạo Camera (Giữ nguyên, có thể bỏ logging bớt nếu muốn) ---
async function initializeCamera() {
    console.log("Initializing camera...");
    statusText.textContent = 'Đang khởi tạo webcam...';
    if (!videoElement) { console.error("Video element not found!"); return false; }
     if (typeof Camera === 'undefined') { console.error("Camera utility library not loaded!"); return false; }

    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (!mediaPipeHands) return;
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch (sendError) { console.error("Error sending frame:", sendError); }
            }
        },
        width: 480, height: 360
    });

    try {
        console.log("Calling camera.start()...");
        await camera.start();
        console.log("camera.start() successful.");
        statusText.textContent = 'Webcam đang chạy. Bắt đầu học!';
        return true;
    } catch (err) {
        console.error("Failed to start camera:", err);
        let userMessage = `Lỗi bật webcam: ${err.name}. Xem console (F12).`;
        if (err.name === "NotAllowedError") userMessage = "Lỗi: Cần cấp quyền camera.";
        else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") userMessage = "Lỗi: Không tìm thấy webcam.";
        else if (err.name === "NotReadableError" || err.name === "TrackStartError") userMessage = "Lỗi: Webcam có thể đang được dùng bởi ứng dụng khác.";
        statusText.textContent = userMessage;
        alert(userMessage);
        // Reset trạng thái nếu camera lỗi
        recognizing = false;
        isLearningActive = false; // Dừng học nếu camera lỗi
        startCameraButton.textContent = "Bật Camera & Bắt Đầu Học";
        startCameraButton.disabled = (trainingData.length === 0); // Chỉ bật nếu có data
        updateLearnUI(); // Reset UI học
        return false;
    }
}

// --- 3. Trích Xuất Đặc Trưng (Giữ nguyên) ---
function extractDistanceFeatures(landmarks) {
    // ... (code giữ nguyên từ hangman.js hoặc ori.js) ...
    if (!landmarks || landmarks.length !== 21) return null;
    const features = []; const wrist = landmarks[0];
    const relativeLandmarks = landmarks.map(lm => ({ x: lm.x - wrist.x, y: lm.y - wrist.y, z: (lm.z || 0) - (wrist.z || 0) }));
    const refPoint = relativeLandmarks[9];
    let handScale = Math.sqrt(refPoint.x**2 + refPoint.y**2 + refPoint.z**2);
    if (handScale < 0.001) handScale = 0.1;
    const PAIRS = [ [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], [4, 8], [8, 12], [12, 16], [16, 20], [5, 8], [9, 12], [13, 16], [17, 20], [2, 4], [5, 4], [9, 4], [13, 4], [17, 4] ];
    for (const pair of PAIRS) {
        const p1 = relativeLandmarks[pair[0]]; const p2 = relativeLandmarks[pair[1]];
        if (!p1 || !p2) { features.push(0); continue; }
        const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
        features.push(dist / handScale);
    } return features;
}


// --- 4. Hàm KNN (Giữ nguyên) ---
function euclideanDistance(arr1, arr2) { /* ... */
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
    return Math.sqrt(sum);
}
function predictKNN(currentFeatures, k) { /* ... */
    if (trainingData.length < k || !currentFeatures) return trainingData.length === 0 ? "Chưa có dữ liệu" : "Cần thêm dữ liệu";
    const distances = trainingData.map(sample => ({ label: sample.label, distance: euclideanDistance(sample.features, currentFeatures) })).filter(item => isFinite(item.distance));
    if (distances.length === 0) return "Lỗi khoảng cách";
    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);
    if (neighbors.length === 0) return "Không thấy láng giềng";
    const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
    let maxCount = 0; let predictedLabel = "Không chắc";
    for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
    // Optional: Add confidence threshold based on distance if needed
    // let avgDistance = neighbors.reduce((acc, curr) => acc + curr.distance, 0) / neighbors.length;
    // if (avgDistance > 0.35) { return "Không chắc"; }
    return predictedLabel;
}


// --- 5. Xử Lý Kết Quả MediaPipe và Logic Học ---
let debounceTimer = null; // Timer để tránh xử lý quá nhanh

function onHandResults(results) {
    // Vẽ camera và landmarks (Giữ nguyên)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (videoElement.videoWidth > 0) {
        if (canvasElement.width !== videoElement.videoWidth) canvasElement.width = videoElement.videoWidth;
        if (canvasElement.height !== videoElement.videoHeight) canvasElement.height = videoElement.videoHeight;
    }
    canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
    }
    canvasCtx.restore();

    // Xử lý nhận diện và logic học
    currentLandmarks = null;
    let prediction = "---";

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        currentLandmarks = handLandmarks;
        const features = extractDistanceFeatures(handLandmarks);
        if (features) {
            prediction = predictKNN(features, K_NEIGHBORS);
        } else {
            prediction = "Lỗi FE"; // Feature Extraction error
        }
    } else {
        prediction = "Không thấy tay";
    }

    // Cập nhật UI ký tự nhận diện real-time
    recognizedCharText.textContent = prediction;
    currentRecognizedLetter = prediction; // Lưu lại để xử lý

    // --- Logic Học Từ ---
    // Chỉ xử lý nếu camera đang chạy VÀ đang trong quá trình học VÀ có ký tự hợp lệ được nhận diện
    if (recognizing && isLearningActive && VALID_LEARN_CHARS.includes(currentRecognizedLetter)) {
        handleLearningRecognition(currentRecognizedLetter);
    } else if (recognizing && isLearningActive) {
         // Nếu không nhận diện được ký tự hợp lệ, reset thời gian giữ
         lastCorrectRecognitionTime = 0;
         // Có thể thêm feedback "Giữ tay trong khung hình" hoặc "Không nhận diện được"
         updateFeedback("Hãy biểu diễn ký tự...", ""); // Xóa feedback cũ
    }
}

// Hàm xử lý logic khi có nhận diện hợp lệ trong lúc học
function handleLearningRecognition(recognizedLetter) {
     if (!isLearningActive) return; // Thoát nếu không học

     const targetChar = targetWord[currentLetterIndex];

     if (recognizedLetter === targetChar) {
          // --- Ký tự nhận diện ĐÚNG với ký tự mục tiêu ---
          if (lastCorrectRecognitionTime === 0) {
               // Lần đầu nhận diện đúng ký tự này
               lastCorrectRecognitionTime = Date.now();
               console.log(`Correct char '${targetChar}' detected. Holding...`);
               updateFeedback(`Đúng rồi! Giữ yên '${targetChar}'...`, "feedback-correct");
          } else {
               // Đã nhận diện đúng trước đó, kiểm tra thời gian giữ
               const holdDuration = Date.now() - lastCorrectRecognitionTime;
               if (holdDuration >= MIN_HOLD_TIME_MS) {
                    // --- ĐỦ THỜI GIAN GIỮ ---
                    console.log(`Character '${targetChar}' confirmed!`);
                    updateFeedback(`✅ ${targetChar} - Tốt!`, "feedback-correct");

                    // Đánh dấu ký tự đã hoàn thành trong hiển thị
                    highlightCompletedLetter(currentLetterIndex);

                    // Chuyển sang ký tự tiếp theo
                    currentLetterIndex++;
                    lastCorrectRecognitionTime = 0; // Reset thời gian giữ cho ký tự mới

                    // Kiểm tra xem đã hoàn thành từ chưa
                    if (currentLetterIndex >= targetWord.length) {
                         // --- HOÀN THÀNH TỪ ---
                         console.log("Word completed!");
                         isLearningActive = false; // Dừng trạng thái học
                         completionMessageElement.textContent = `🎉 Hoàn thành từ "${targetWord}"!`;
                         currentLetterTargetElement.textContent = '🏆';
                         currentLetterInstructionElement.textContent = "Tuyệt vời!";
                         // Cân nhắc dừng camera tự động? Hoặc để người dùng tự bấm
                         // stopRecognition();
                         // Hoặc chỉ đổi text nút camera
                          if (recognizing) {
                              startCameraButton.textContent = "Học Từ Khác (Camera vẫn bật)";
                          }
                         // Vô hiệu hóa input khi hoàn thành?
                         wordInputElement.disabled = true;
                         useWordButton.disabled = true;
                         randomWordButton.disabled = true;

                    } else {
                         // --- Chưa hoàn thành, cập nhật cho ký tự mới ---
                         updateLearnUI(); // Cập nhật ký tự mục tiêu tiếp theo
                          // Xóa feedback cũ sau 1 giây để chuẩn bị cho ký tự mới
                         setTimeout(() => {
                             updateFeedback("Tiếp theo...", "");
                         }, 1000);
                    }
               } else {
                    // Vẫn đang trong thời gian giữ, tiếp tục hiển thị feedback giữ yên
                     updateFeedback(`Đúng rồi! Giữ yên '${targetChar}' (${Math.round((MIN_HOLD_TIME_MS - holdDuration)/1000)}s)...`, "feedback-correct");
               }
          }
     } else {
          // --- Ký tự nhận diện SAI với ký tự mục tiêu ---
          console.log(`Incorrect. Target: ${targetChar}, Recognized: ${recognizedLetter}`);
          lastCorrectRecognitionTime = 0; // Reset thời gian giữ nếu nhận diện sai
          updateFeedback(`Sai rồi! Cần '${targetChar}', thấy '${recognizedLetter}' ❌`, "feedback-incorrect");
     }
}


// --- 6. Tải Dữ Liệu Mẫu (Giữ nguyên) ---
function loadTrainingData() {
    // ... (code giống hệt hangman.js, có thể thêm logging) ...
    console.log("Loading training data...");
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    let loadedCount = 0;
    trainingData = [];
    if (data) {
        try {
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                 trainingData = parsedData.filter(item => item && typeof item === 'object' && Array.isArray(item.features) && typeof item.label === 'string' && item.features.length > 0);
                 loadedCount = trainingData.length;
                 if (loadedCount !== parsedData.length) console.warn("Filtered invalid entries from data.");
            } else { console.warn("localStorage data not a valid array."); }
        } catch(e) {
             console.error("Error parsing training data:", e);
             alert("Lỗi dữ liệu huấn luyện. Dữ liệu bị reset.");
             localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    } else { console.log("No training data in localStorage."); }

    console.log(`Loaded ${loadedCount} samples.`);
    if (loadedCount === 0) {
         statusText.textContent = "Cảnh báo: Không có dữ liệu mẫu. Không thể học.";
         alert("Không tìm thấy dữ liệu huấn luyện ASL. Bạn cần huấn luyện hoặc nhập dữ liệu trước.");
         startCameraButton.disabled = true;
         wordInputElement.disabled = true;
         useWordButton.disabled = true;
         randomWordButton.disabled = true;
         return false;
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu). Chọn từ và bật camera.`;
        startCameraButton.disabled = false; // Cho phép bật camera nếu có data
        wordInputElement.disabled = false;
        useWordButton.disabled = false;
        randomWordButton.disabled = false;
        return true;
    }
}

// --- 7. Logic Học Từ & UI ---

function setTargetWord(word) {
    const upperWord = word.toUpperCase().trim();
    // Lọc bỏ các ký tự không hợp lệ
    const validWord = upperWord.split('').filter(char => VALID_LEARN_CHARS.includes(char)).join('');

    if (validWord.length === 0) {
        alert("Từ không hợp lệ hoặc không chứa ký tự ASL nào (A-Y, 0-9).");
        return;
    }

     if (validWord !== upperWord) {
          alert(`Một số ký tự đã bị loại bỏ. Từ sẽ học là: "${validWord}"`);
     }


    targetWord = validWord;
    currentLetterIndex = 0;
    isLearningActive = false; // Chưa active cho đến khi camera bật và người dùng sẵn sàng
    lastCorrectRecognitionTime = 0; // Reset hold time

    console.log("New target word:", targetWord);
    completionMessageElement.textContent = ''; // Xóa thông báo hoàn thành cũ
    wordInputElement.value = targetWord; // Cập nhật input nếu từ bị thay đổi

    // Cho phép bật camera (nếu có data)
     startCameraButton.disabled = (trainingData.length === 0);
     startCameraButton.textContent = "Bật Camera & Bắt Đầu Học";


    updateLearnUI(); // Cập nhật hiển thị từ và ký tự đầu tiên
    updateFeedback("Nhấn 'Bật Camera' khi sẵn sàng.", "");
}

function selectRandomWord() {
    const word = LEARN_WORD_LIST[Math.floor(Math.random() * LEARN_WORD_LIST.length)];
    setTargetWord(word);
}

// Cập nhật giao diện phần học tập
function updateLearnUI() {
    if (!targetWord) {
        targetWordDisplayElement.textContent = '---';
        currentLetterTargetElement.textContent = '?';
        currentLetterInstructionElement.textContent = "Chọn hoặc nhập từ để bắt đầu.";
        feedbackMessageElement.textContent = '';
        completionMessageElement.textContent = '';
        return;
    }

    // Hiển thị từ với highlight
    targetWordDisplayElement.innerHTML = targetWord.split('')
        .map((char, index) => {
            let className = '';
            if (isLearningActive && index === currentLetterIndex) {
                className = 'current-letter';
            } else if (isLearningActive && index < currentLetterIndex) {
                 className = 'done-letter'; // Đánh dấu ký tự đã qua
            }
            return `<span class="${className}">${char}</span>`;
        })
        .join('');

    // Hiển thị ký tự mục tiêu hiện tại
    if (isLearningActive && currentLetterIndex < targetWord.length) {
        currentLetterTargetElement.textContent = targetWord[currentLetterIndex];
        currentLetterInstructionElement.textContent = `Biểu diễn ký tự:`;
    } else if (!isLearningActive && targetWord) {
         currentLetterTargetElement.textContent = targetWord[0]; // Hiển thị chữ cái đầu tiên khi chưa bắt đầu
         currentLetterInstructionElement.textContent = "Chuẩn bị biểu diễn:";
    } else {
        // Đã hoàn thành hoặc chưa có từ
         if (!completionMessageElement.textContent) { // Chỉ reset nếu chưa có thông báo hoàn thành
             currentLetterTargetElement.textContent = '?';
             currentLetterInstructionElement.textContent = "Chọn từ để học.";
         }
    }

    // Xóa feedback cũ khi chuyển ký tự (trừ khi đang giữ)
    if (lastCorrectRecognitionTime === 0) {
     //    updateFeedback("", ""); // Có thể xóa feedback ngay hoặc để handleLearningRecognition xóa
    }

}

// Hàm cập nhật feedback
function updateFeedback(message, className) {
     feedbackMessageElement.textContent = message;
     feedbackMessageElement.className = className || ''; // Gán class CSS (ví dụ: 'feedback-correct')
}

// Hàm tô màu chữ cái đã hoàn thành
function highlightCompletedLetter(index) {
     const spans = targetWordDisplayElement.querySelectorAll('span');
     if (spans[index]) {
          spans[index].classList.remove('current-letter');
          spans[index].classList.add('done-letter');
     }
}

// --- 8. Hàm dừng camera/nhận diện ---
function stopRecognition() {
     console.log("Stopping recognition...");
     if (recognizing) {
        recognizing = false;
        isLearningActive = false; // Cũng dừng trạng thái học
        if (camera && typeof camera.stop === 'function') {
            try { camera.stop(); console.log("Camera stopped."); }
            catch (stopError) { console.error("Error stopping camera:", stopError); }
        }
        startCameraButton.textContent = "Bật Camera & Bắt Đầu Học";
        statusText.textContent = "Đã dừng camera.";
        recognizedCharText.textContent = "---";
        currentLandmarks = null;
        currentRecognizedLetter = null;
        lastCorrectRecognitionTime = 0; // Reset hold time
        startCameraButton.disabled = (trainingData.length === 0); // Chỉ bật lại nếu có data
        // Kích hoạt lại input/button chọn từ
        wordInputElement.disabled = false;
        useWordButton.disabled = false;
        randomWordButton.disabled = false;

        updateLearnUI(); // Reset UI về trạng thái chờ
        updateFeedback("Camera đã tắt.", "");

     } else {
         console.log("Recognition was not active.");
     }
}


// --- 9. Event Listeners ---
useWordButton.onclick = () => {
    const word = wordInputElement.value;
    if (word) {
        setTargetWord(word);
    } else {
        alert("Vui lòng nhập một từ.");
    }
};

randomWordButton.onclick = () => {
    selectRandomWord();
};

wordInputElement.addEventListener('keyup', (event) => {
     if (event.key === 'Enter') {
          useWordButton.click(); // Gọi sự kiện click của nút kia khi nhấn Enter
     }
});

startCameraButton.onclick = async () => {
    console.log("Start/Stop Camera button clicked. Recognizing:", recognizing);

    if (!recognizing) {
        // --- Bật Camera ---
        if (trainingData.length === 0) {
             alert("Không có dữ liệu huấn luyện.");
             return;
        }
        if (!targetWord) {
            alert("Vui lòng chọn hoặc nhập một từ để học trước!");
            return;
        }

        startCameraButton.disabled = true;
        startCameraButton.textContent = "Đang bật...";

        const cameraStarted = await initializeCamera();

        if (cameraStarted) {
            recognizing = true;
            isLearningActive = true; // Bắt đầu học khi camera bật
            startCameraButton.textContent = "Dừng Học & Tắt Camera";
            startCameraButton.disabled = false;
            // Vô hiệu hóa input khi đang học
            wordInputElement.disabled = true;
            useWordButton.disabled = true;
            randomWordButton.disabled = true;

            updateLearnUI(); // Cập nhật UI để hiển thị ký tự hiện tại
            updateFeedback("Bắt đầu biểu diễn ký tự!", "");
            console.log("Recognition and learning started.");
        } else {
            // Lỗi đã được xử lý trong initializeCamera
            recognizing = false;
            isLearningActive = false;
            startCameraButton.textContent = "Bật Camera & Bắt Đầu Học";
            startCameraButton.disabled = (trainingData.length === 0);
             // Kích hoạt lại input
            wordInputElement.disabled = false;
            useWordButton.disabled = false;
            randomWordButton.disabled = false;
        }

    } else {
        // --- Dừng Camera ---
        stopRecognition(); // Gọi hàm dừng đã tạo
    }
};

resetLearnButton.onclick = () => {
     console.log("Resetting learning process...");
     stopRecognition(); // Dừng camera nếu đang chạy
     targetWord = '';   // Xóa từ mục tiêu
     isLearningActive = false;
     currentLetterIndex = 0;
     wordInputElement.value = ''; // Xóa input
     // Kích hoạt lại input/button chọn từ
     wordInputElement.disabled = (trainingData.length === 0);
     useWordButton.disabled = (trainingData.length === 0);
     randomWordButton.disabled = (trainingData.length === 0);
     updateLearnUI(); // Cập nhật UI về trạng thái ban đầu
     updateFeedback("Chọn từ mới để học.", "");
     statusText.textContent = `Sẵn sàng (${trainingData.length} mẫu). Chọn từ và bật camera.`;
}


// --- 10. Khởi chạy ---
function main() {
    console.log("Learn Mode Main function started.");
    initializeMediaPipeHands(); // Tải MP và data
    // Không setTargetWord ban đầu, đợi người dùng chọn
    updateLearnUI(); // Cập nhật UI ban đầu
    // Đảm bảo các nút chọn từ bị vô hiệu hóa nếu không có data
    if (trainingData.length === 0) {
         wordInputElement.disabled = true;
         useWordButton.disabled = true;
         randomWordButton.disabled = true;
    }
    console.log("Initialization complete. Waiting for user action.");
}

main();

// --- END OF FILE public/learn.js ---