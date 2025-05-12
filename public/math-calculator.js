// --- START OF FILE public/math-calculator-hold.js (FIXED Calculation & Alerts) ---

// --- DOM Elements ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startRecognitionButton = document.getElementById('start-recognition-button');
const expressionDisplayElement = document.getElementById('expression-display');
const resultDisplayElement = document.getElementById('result-display');
const clearButton = document.getElementById('clear-button');
const holdIndicatorElement = document.getElementById('hold-indicator');

// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognitionActive = false;
let currentLandmarks = null;

// --- ASL Recognition (KNN) ---
let trainingData = [];
const K_NEIGHBORS = 5;
const LOCAL_STORAGE_KEY = 'math'; // <<<<< Dùng key gốc

// --- Math Calculator Hold Logic (with Letter Mapping) ---
const VALID_DIGITS_ONLY = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#'];

const SYMBOL_MAP = {
    '+': '+',
    '-': '-',
    '*': '*',
    '/': '/', // Thêm 'V' cho chia, bạn CẦN huấn luyện ký hiệu này
};
const MAPPED_OPERATOR_LETTERS = Object.keys(SYMBOL_MAP); // ['A', 'S', 'M', 'V']
const DISPLAY_OPERATORS = Object.values(SYMBOL_MAP);      // ['+', '-', '*', '/']

const EQUALS_LETTER = '='; // Chữ cái ánh xạ cho dấu '='
const BACKSPACE_LETTER = '#'; // Chữ cái cho xóa

// Các ký tự hợp lệ có thể được *nhận diện* và *xử lý*
const RECOGNIZABLE_LETTERS = [...VALID_DIGITS_ONLY, ...MAPPED_OPERATOR_LETTERS, EQUALS_LETTER, BACKSPACE_LETTER];

let currentExpression = "";
let heldLetter = null;
let holdStartTime = 0;
const HOLD_DURATION_MS = 1000;
let isProcessingHold = false;
let isBackspaceTriggeredOnHold = false;
let calculationResult = null;
let isResultDisplayed = false;

// --- 1. Initialize MediaPipe Hands ---
function initializeMediaPipeHands() {
    console.log("Initializing MediaPipe Hands (Pseudo Math Calc)...");
    statusText.textContent = "Đang tải MediaPipe...";
    try {
        mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        mediaPipeHands.onResults(onHandResults);
        console.log("MediaPipe Hands initialized.");
        statusText.textContent = "MediaPipe sẵn sàng. Tải data...";
        loadTrainingData();
    } catch (error) {
        console.error("Failed to initialize MP Hands:", error);
        statusText.textContent = "Lỗi: Không thể khởi tạo MP.";
        startRecognitionButton.disabled = true;
    }
}

// --- 2. Initialize Camera ---
async function initializeCamera() {
    console.log("Initializing camera...");
    statusText.textContent = 'Đang khởi tạo webcam...';
     if (!videoElement || typeof Camera === 'undefined') { console.error("Video or Camera lib missing!"); return false; }

    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (!mediaPipeHands || !recognitionActive) return;
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch (sendError) { console.error("Frame send error:", sendError); }
            }
        },
        width: 480, height: 360
    });

    try {
        await camera.start();
        console.log("Camera started.");
        statusText.textContent = 'Webcam đang chạy.';
        return true;
    } catch (err) {
        console.error("Failed to start camera:", err);
        let userMessage = `Lỗi webcam: ${err.name}.`;
         if (err.name === "NotAllowedError") userMessage = "Lỗi: Cần cấp quyền camera.";
         else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") userMessage = "Lỗi: Không tìm thấy webcam.";
         else if (err.name === "NotReadableError" || err.name === "TrackStartError") userMessage = "Lỗi: Webcam có thể đang được dùng.";
        statusText.textContent = userMessage;
        console.warn(userMessage); // Thay alert bằng console.warn
        recognitionActive = false;
        startRecognitionButton.textContent = "Bật Nhận Diện";
        startRecognitionButton.disabled = (trainingData.length === 0);
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
        if (!p1 || !p2) { features.push(0); continue; }
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
     // ... (Code giống hệt, bao gồm kiểm tra data) ...
     if (!Array.isArray(trainingData) || trainingData.length < k || !currentFeatures) {
         return trainingData?.length === 0 ? "No Data" : "Need Data";
     }
     const distances = trainingData
        .map(sample => {
             if (!sample || !Array.isArray(sample.features)) return { label: null, distance: Infinity };
             return { label: sample.label, distance: euclideanDistance(sample.features, currentFeatures)};
        })
        .filter(item => item.label !== null && isFinite(item.distance));

     if (distances.length === 0) return "Dist Err";
     distances.sort((a, b) => a.distance - b.distance);
     const neighbors = distances.slice(0, k);
     if (neighbors.length === 0) return "No Nbrs";
     const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
     let maxCount = 0; let predictedLabel = "?";
     for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
     return predictedLabel;
}


// --- 5. Xử Lý Kết Quả MediaPipe ---
// --- 5. Xử Lý Kết Quả MediaPipe ---
function onHandResults(results) {
    // Vẽ camera (giữ nguyên)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
     if (videoElement.videoWidth > 0) { /* Sync canvas */
         if (canvasElement.width !== videoElement.videoWidth) canvasElement.width = videoElement.videoWidth;
         if (canvasElement.height !== videoElement.videoHeight) canvasElement.height = videoElement.videoHeight;
     }
    canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) { /* Draw landmarks */
        const handLandmarks = results.multiHandLandmarks[0];
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });
    }
    canvasCtx.restore();

    // Nhận diện
    let prediction = "---";
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const features = extractDistanceFeatures(results.multiHandLandmarks[0]);
        prediction = features ? predictKNN(features, K_NEIGHBORS) : "FE Err";
    } else {
        prediction = "No Hand";
    }

    recognizedCharText.textContent = prediction; // Cập nhật ký tự nhận diện real-time

    if (!recognitionActive || isResultDisplayed) {
        holdIndicatorElement.textContent = isResultDisplayed ? 'Nhấn Clear để tính tiếp' : '';
        return;
    }

    const isPotentiallyValidHold = RECOGNIZABLE_LETTERS.includes(prediction);

    if (isPotentiallyValidHold && prediction === heldLetter) {
        const holdDuration = Date.now() - holdStartTime;
        const remainingTime = Math.max(0, HOLD_DURATION_MS - holdDuration);

        if (holdDuration >= HOLD_DURATION_MS && !isProcessingHold) {
            isProcessingHold = true;
            holdIndicatorElement.textContent = `Đã nhận: ${heldLetter}`;
            console.log(`Letter/Digit '${heldLetter}' held for ${HOLD_DURATION_MS}ms. Processing.`);

            let symbolProcessed = false; // Cờ để biết ký hiệu đã được xử lý và cần reset hold hay chưa

            if (heldLetter === BACKSPACE_LETTER) {
                if (!isBackspaceTriggeredOnHold && currentExpression.length > 0) {
                    console.log("Executing backspace.");
                    currentExpression = currentExpression.slice(0, -1);
                    updateExpressionDisplay();
                    isBackspaceTriggeredOnHold = true;
                } else { console.log("Backspace ignored."); }
                symbolProcessed = true;

            } else if (heldLetter === EQUALS_LETTER) {
                console.log("Equals letter ('E') confirmed. Calculating...");
                calculateExpression(); // Hàm này sẽ đặt isResultDisplayed = true
                symbolProcessed = true;

            } else if (MAPPED_OPERATOR_LETTERS.includes(heldLetter)) {
                const operator = SYMBOL_MAP[heldLetter];
                const lastCharInExpr = currentExpression.slice(-1);
                const isLastCharOperator = DISPLAY_OPERATORS.includes(lastCharInExpr);
                let canAdd = true;

                if (isLastCharOperator) { canAdd = false; console.log(`Ignoring consecutive operator`);}
                else if (currentExpression.length === 0 && operator !== '-') { canAdd = false; console.log(`Ignoring operator at start`);}
                else if (currentExpression === '-' && isLastCharOperator) { canAdd = false; console.log(`Ignoring op after starting '-'`);}


                if (canAdd) {
                    console.log(`Adding operator: ${operator} (from letter ${heldLetter})`);
                    currentExpression += operator;
                    updateExpressionDisplay();
                }
                symbolProcessed = true;

            } else if (VALID_DIGITS_ONLY.includes(heldLetter)) {
                 let canAddDigit = true;
                 if (currentExpression === '0' && heldLetter !== '0') { currentExpression = heldLetter; }
                 else if (currentExpression === '' && heldLetter === '0') { currentExpression = '0'; }
                 else if (currentExpression !== '' || heldLetter !== '0'){ currentExpression += heldLetter; }
                 else { canAddDigit = false; }

                 if(canAddDigit) {
                    console.log(`Adding digit: ${heldLetter}`);
                    updateExpressionDisplay();
                 } else { console.log(`Ignoring leading zero: ${heldLetter}`); }
                 symbolProcessed = true;
            }

            // --- QUAN TRỌNG: Reset trạng thái giữ SAU KHI ký hiệu đã được xử lý ---
            if (symbolProcessed) {
                heldLetter = null;
                holdStartTime = 0;
                // isProcessingHold sẽ được reset khi ký hiệu tay thay đổi (ở khối else dưới)
            }

        } else if (!isProcessingHold) {
            holdIndicatorElement.textContent = `Giữ '${heldLetter}' (${(remainingTime / 1000).toFixed(1)}s)...`;
        }
    } else {
        // --- Ký hiệu thay đổi hoặc không nằm trong RECOGNIZABLE_LETTERS ---
        if (isPotentiallyValidHold || prediction === "---" || prediction === "No Hand" || prediction === "?") {
             if (heldLetter !== null && heldLetter !== prediction) { // Chỉ log khi thực sự thay đổi
                  console.log(`Symbol changed from ${heldLetter} (was being held) to ${prediction}. Resetting hold state.`);
             }
            heldLetter = prediction;
            holdStartTime = Date.now();
            isProcessingHold = false; // Quan trọng: Cho phép xử lý lần giữ MỚI
            isBackspaceTriggeredOnHold = false; // Reset cờ backspace khi đổi ký hiệu
            holdIndicatorElement.textContent = '';
        } else {
             if (heldLetter !== null && prediction !== '?') {
                console.log(`Ignoring unmapped letter ${prediction}, fully resetting hold state.`);
                heldLetter = null;
                holdStartTime = 0;
                isProcessingHold = false;
                isBackspaceTriggeredOnHold = false;
             }
             holdIndicatorElement.textContent = '';
        }
    }
}

// --- 6. Load Training Data ---
function loadTrainingData() {
    console.log(`Loading ALPHANUMERIC training data from key: ${LOCAL_STORAGE_KEY}`);
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    let loadedCount = 0;
    trainingData = [];
     if (data) { try {
         const parsedData = JSON.parse(data);
         if (Array.isArray(parsedData)) {
              trainingData = parsedData.filter(item => item?.features?.length > 0 && typeof item.label === 'string');
              loadedCount = trainingData.length;
              console.log(`Found ${loadedCount} raw samples in ${LOCAL_STORAGE_KEY}.`);
              // --- Kiểm tra dữ liệu cho các ký tự ÁNH XẠ ---
              const essentialLettersForCalc = [...VALID_DIGITS_ONLY, ...MAPPED_OPERATOR_LETTERS, EQUALS_LETTER, BACKSPACE_LETTER];
              const presentLabels = new Set(trainingData.map(item => item.label));
              const missingLetters = essentialLettersForCalc.filter(sym => !presentLabels.has(sym));
              if (missingLetters.length > 0) {
                  const message = `Cảnh báo: Dữ liệu huấn luyện tại key "${LOCAL_STORAGE_KEY}" có thể thiếu các ký tự cần thiết: ${missingLetters.join(', ')}. Máy tính có thể không hoạt động đúng.`;
                  console.warn(message);
                  // Tạm thời bỏ alert, chỉ dùng console.warn
                  // alert(message);
              } else {
                  console.log("Essential letters/digits for calculator seem present in the loaded data.");
              }
              // --- Kết thúc kiểm tra ---
         } else { console.warn(`${LOCAL_STORAGE_KEY} data is not an array.`); }
     } catch(e) { console.error("Data parse error:", e); localStorage.removeItem(LOCAL_STORAGE_KEY); } }
     else { console.log(`No data found for key ${LOCAL_STORAGE_KEY}.`); }

    console.log(`Loaded ${loadedCount} valid ALPHANUMERIC samples.`);
    if (loadedCount === 0) {
        statusText.textContent = "Lỗi: Không có data!";
        console.warn(`Không tìm thấy dữ liệu huấn luyện tại key "${LOCAL_STORAGE_KEY}".`); // Thay alert
        startRecognitionButton.disabled = true;
        return false;
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu).`;
        startRecognitionButton.disabled = false;
        return true;
    }
}
// --- 7. UI Update and Calculation Functions ---
function updateExpressionDisplay() {
    if (expressionDisplayElement) {
        expressionDisplayElement.textContent = currentExpression || ' ';
    }
}

function updateResultDisplay() {
     if (resultDisplayElement) {
          if (calculationResult !== null) {
              let displayText = '';
              if (typeof calculationResult === 'number' && !isNaN(calculationResult)) {
                   // Làm tròn kết quả nếu là số thập phân dài
                   let formattedResult = (calculationResult % 1 === 0) ? calculationResult.toString() : parseFloat(calculationResult.toFixed(4));
                   displayText = `= ${formattedResult}`;
              } else { // Hiển thị các chuỗi lỗi trực tiếp
                  displayText = calculationResult;
              }
              resultDisplayElement.textContent = displayText;
              resultDisplayElement.style.visibility = 'visible';
          } else {
              resultDisplayElement.textContent = '';
              resultDisplayElement.style.visibility = 'hidden';
          }
     }
 }

// --- *** HÀM TÍNH TOÁN MỚI - KHÔNG DÙNG THƯ VIỆN *** ---
function calculateExpression() {
    // --- VALIDATION (Giữ nguyên) ---
    if (currentExpression.length === 0) {
        calculationResult = "Chưa có biểu thức";
        isResultDisplayed = true; updateResultDisplay(); return;
    }
    const lastChar = currentExpression.slice(-1);
    const firstChar = currentExpression[0];
    if (DISPLAY_OPERATORS.includes(lastChar)) {
         calculationResult = "Lỗi: Thiếu số cuối";
         isResultDisplayed = true; updateResultDisplay(); return;
     }
     if (DISPLAY_OPERATORS.includes(firstChar) && firstChar !== '-') {
          calculationResult = "Lỗi: Bắt đầu bằng toán tử";
          isResultDisplayed = true; updateResultDisplay(); return;
     }
      if (currentExpression === '-') {
          calculationResult = "Lỗi: Chỉ có dấu trừ";
          isResultDisplayed = true; updateResultDisplay(); return;
     }
     // Kiểm tra toán tử liền kề đơn giản (có thể cải thiện thêm)
     for (let i = 0; i < currentExpression.length - 1; i++) {
        if (DISPLAY_OPERATORS.includes(currentExpression[i]) && DISPLAY_OPERATORS.includes(currentExpression[i+1])) {
            // Chỉ cho phép dạng "-<số>" sau một toán tử, ví dụ "5*-2"
            if (!(currentExpression[i+1] === '-' && i+2 < currentExpression.length && VALID_DIGITS_ONLY.includes(currentExpression[i+2]))) {
                 // Trường hợp khác như "5++2" hoặc "5* /2" (nếu có dấu cách) là lỗi
                 if (!VALID_DIGITS_ONLY.includes(currentExpression[i+2]) || currentExpression[i+1] !== '-') {
                    calculationResult = "Lỗi: Toán tử liền kề";
                    isResultDisplayed = true; updateResultDisplay(); return;
                 }
            }
        }
    }

    console.log(`Calculating (manual parser): "${currentExpression}"`);
    statusText.textContent = "Đang tính...";

    try {
        // Bước 1: Phân tách thành số và toán tử
        // Sử dụng regex để tách, xử lý số âm ở đầu hoặc sau toán tử
        const tokens = currentExpression.match(/-?\d+(\.\d+)?|[\+\-\*\/]/g);
        if (!tokens) {
            throw new Error("Biểu thức không hợp lệ");
        }

        let numbers = [];
        let operators = [];

        tokens.forEach(token => {
            if (DISPLAY_OPERATORS.includes(token) && numbers.length > 0 && !DISPLAY_OPERATORS.includes(tokens[tokens.indexOf(token)-1])) {
                // Chỉ thêm toán tử nếu token trước đó không phải là toán tử (trừ trường hợp số âm)
                operators.push(token);
            } else if (!isNaN(parseFloat(token))) {
                numbers.push(parseFloat(token));
            } else if (token === '-' && (numbers.length === 0 || DISPLAY_OPERATORS.includes(tokens[tokens.indexOf(token)-1]))) {
                // Đây có thể là một phần của số âm, sẽ được xử lý bởi parseFloat tiếp theo
                // Hoặc đây là toán tử trừ nếu token trước đó là số.
                // Nếu token trước là toán tử (vd: "5*-") thì '-' này thuộc về số âm tiếp theo
                // Nếu chưa có số nào, và token là '-' -> số âm đầu tiên
                // Ta sẽ để parseFloat xử lý việc ghép dấu trừ với số sau nó.
                // Nếu đây là toán tử trừ, nó sẽ được thêm vào mảng operators ở lần lặp sau khi có số.
            } else {
                 // Nếu token không phải số và không phải toán tử được phép, hoặc là toán tử ở vị trí không mong muốn.
                 // Ví dụ, nếu regex match được gì đó lạ.
                 // Dành cho trường hợp regex tách sai.
                 if (DISPLAY_OPERATORS.includes(token) && numbers.length === 0 && token !== '-') {
                      throw new Error("Biểu thức bắt đầu bằng toán tử không hợp lệ");
                 }
                 // Toán tử sẽ được thêm vào mảng operators sau khi một số được thêm
            }
        });
        
        // Xây dựng lại numbers và operators một cách chính xác hơn
        // Ví dụ xử lý trường hợp "5*-2" -> numbers: [5, -2], operators: ['*']
        const newTokens = [];
        let currentNumberBuffer = "";
        for (let i = 0; i < currentExpression.length; i++) {
            const char = currentExpression[i];
            if (VALID_DIGITS_ONLY.includes(char) || char === '.') {
                currentNumberBuffer += char;
            } else if (DISPLAY_OPERATORS.includes(char)) {
                if (currentNumberBuffer) {
                    newTokens.push(parseFloat(currentNumberBuffer));
                    currentNumberBuffer = "";
                }
                // Xử lý trường hợp số âm: nếu char là '-' VÀ (là ký tự đầu tiên HOẶC ký tự trước đó là một toán tử)
                if (char === '-' && (newTokens.length === 0 || (typeof newTokens[newTokens.length - 1] === 'string' && DISPLAY_OPERATORS.includes(newTokens[newTokens.length - 1])))) {
                     currentNumberBuffer += char; // Bắt đầu một số âm
                } else {
                    newTokens.push(char); // Đây là một toán tử
                }
            }
        }
        if (currentNumberBuffer) { // Add last number
            newTokens.push(parseFloat(currentNumberBuffer));
        }

        numbers = newTokens.filter(token => typeof token === 'number');
        operators = newTokens.filter(token => typeof token === 'string' && DISPLAY_OPERATORS.includes(token));


        if (numbers.length === 0 || numbers.length !== operators.length + 1) {
            // Ví dụ: "" -> numbers=[], ops=[]
            // "5+" -> numbers=[5], ops=[+] -> lỗi
            // "+5" -> numbers=[5], ops=[] -> lỗi (đã chặn ở validation đầu)
            console.error("Tokenization error: Numbers/Operators mismatch.", "Numbers:", numbers, "Operators:", operators, "Original:", currentExpression, "NewTokens:", newTokens);
            throw new Error("Số lượng toán hạng/toán tử không khớp");
        }

        // Bước 2: Ưu tiên Nhân và Chia
        for (let i = 0; i < operators.length; i++) {
            if (operators[i] === '*' || operators[i] === '/') {
                const left = numbers[i];
                const right = numbers[i+1];
                let result;
                if (operators[i] === '*') {
                    result = left * right;
                } else { // operators[i] === '/'
                    if (right === 0) {
                        throw new Error("Lỗi: Chia cho 0");
                    }
                    result = left / right;
                }
                numbers.splice(i, 2, result); // Thay thế 2 số bằng kết quả
                operators.splice(i, 1);     // Xóa toán tử đã thực hiện
                i--; // Điều chỉnh index vì mảng đã thay đổi kích thước
            }
        }

        // Bước 3: Thực hiện Cộng và Trừ
        let finalResult = numbers[0];
        for (let i = 0; i < operators.length; i++) { // operators giờ chỉ còn '+' hoặc '-'
            const nextNumber = numbers[i+1];
            if (operators[i] === '+') {
                finalResult += nextNumber;
            } else if (operators[i] === '-') {
                finalResult -= nextNumber;
            }
        }

        calculationResult = finalResult;

        if (isNaN(calculationResult)) calculationResult = "Lỗi: Kết quả NaN";
        else if (!isFinite(calculationResult)) calculationResult = "Lỗi: Vô cực";
        else calculationResult = Number(calculationResult);
        console.log("Manual Calculation Result:", calculationResult);

    } catch (error) {
        console.error("Manual Calculation error:", error);
        calculationResult = error.message.startsWith("Lỗi:") ? error.message : "Lỗi cú pháp (tự xử lý)";
    } finally {
         isResultDisplayed = true;
         updateResultDisplay();
         statusText.textContent = 'Đã tính xong. Nhấn Clear.';
    }
}
// Function to clear everything
function clearCalculation() {
    console.log("Clearing calculator state.");
    currentExpression = "";
    calculationResult = null;
    heldLetter = null;
    holdStartTime = 0;
    isProcessingHold = false;
    isBackspaceTriggeredOnHold = false;
    isResultDisplayed = false;
    updateExpressionDisplay();
    updateResultDisplay();
    holdIndicatorElement.textContent = "";
    if(recognitionActive) statusText.textContent = 'Đang nhận diện...';
    else if(trainingData.length > 0) statusText.textContent = `Sẵn sàng (${trainingData.length} mẫu).`;
    else statusText.textContent = "Lỗi: Không có data!";
}

// --- 8. Stop Recognition Function ---
function stopRecognition() {
     console.log("Stopping recognition...");
     if (recognitionActive) {
        recognitionActive = false;
        if (camera?.stop) {
            try { camera.stop(); console.log("Camera stopped."); }
            catch (stopError) { console.error("Error stopping camera:", stopError); }
        }
        startRecognitionButton.textContent = "Bật Nhận Diện";
         if (isResultDisplayed) {
             statusText.textContent = 'Đã tính xong. Bật lại để tính tiếp.';
         } else if (trainingData.length > 0) {
             statusText.textContent = `Sẵn sàng (${trainingData.length} mẫu).`;
         } else {
             statusText.textContent = "Lỗi: Không có data!";
         }
        recognizedCharText.textContent = "---";
        holdIndicatorElement.textContent = "";
        heldLetter = null;
        holdStartTime = 0;
        isProcessingHold = false;
        isBackspaceTriggeredOnHold = false;
        startRecognitionButton.disabled = (trainingData.length === 0);
     } else {
         console.log("Recognition was not active.");
     }
}

// --- 9. Event Listeners ---
startRecognitionButton.onclick = async () => {
    console.log("Start/Stop button clicked. Active:", recognitionActive);
    if (!recognitionActive) {
        if (!loadTrainingData()) { return; }
        if (isResultDisplayed) {
            console.log("Clearing previous result before starting.");
            clearCalculation();
        }
        startRecognitionButton.disabled = true;
        startRecognitionButton.textContent = "Đang bật...";
        const cameraStarted = await initializeCamera();
        if (cameraStarted) {
            recognitionActive = true;
            startRecognitionButton.textContent = "Dừng Nhận Diện";
            startRecognitionButton.disabled = false;
            heldLetter = null;
            holdStartTime = 0;
            isProcessingHold = false;
            isBackspaceTriggeredOnHold = false;
            statusText.textContent = 'Đang nhận diện...';
            console.log("Recognition started for pseudo math calculator.");
        } else {
            recognitionActive = false;
             startRecognitionButton.textContent = "Bật Nhận Diện";
             startRecognitionButton.disabled = (trainingData.length === 0);
        }
    } else {
        stopRecognition();
    }
};

clearButton.onclick = () => {
    clearCalculation();
};



// --- 10. Initialization ---
function main() {
    console.log("Pseudo Math Calculator (Hold Method, Default Data) Main function started.");
    initializeMediaPipeHands();
    clearCalculation();
    console.log("Initialization complete.");
}

main();
// --- END OF FILE public/math-calculator-hold.js (FIXED Calculation & Alerts) ---