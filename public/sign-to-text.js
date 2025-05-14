'7'// --- START OF FILE public/sign-to-text-hold.js ---

// --- DOM Elements (Adapted from learn.js, adding/removing as needed) ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status-text');
const recognizedCharText = document.getElementById('recognized-char');
const startRecognitionButton = document.getElementById('start-recognition-button'); // Renamed from startCameraButton
const outputTextElement = document.getElementById('output-text');       // New
const clearTextButton = document.getElementById('clear-text-button');     // New
const holdIndicatorElement = document.getElementById('hold-indicator');   // New

// --- MediaPipe & Camera ---
let mediaPipeHands = null;
let camera = null;
let recognitionActive = false; // Changed from recognizing
let currentLandmarks = null;

// --- ASL Recognition (KNN) ---
let trainingData = [];
const K_NEIGHBORS = 5; // From learn.js
const VALID_CHARS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '__' ];
const BACKSPACE_CHAR = '#'; // Add backspace character
const LOCAL_STORAGE_KEY = 'text'; // From learn.js
const SPACE_CHAR = '__'
const SPACE_SIZE = '   '

// --- Sign-to-Text Hold Logic ---
let currentText = "";               // New: Stores the output text
let heldChar = null;                // New: Character currently being held
let holdStartTime = 0;              // New: Timestamp when hold started
const HOLD_DURATION_MS = 1000;      // New: Hold duration (1 second)
let isProcessingHold = false;      // New: Flag to prevent processing the same hold multiple times
let isBackspaceTriggeredOnHold = false; // New: Flag specific for backspace hold

// --- 1. Initialize MediaPipe Hands (Identical to learn.js) ---
function initializeMediaPipeHands() {
    console.log("Initializing MediaPipe Hands...");
    statusText.textContent = "Đang tải MediaPipe...";
    try {
        mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        mediaPipeHands.onResults(onHandResults);
        console.log("MediaPipe Hands initialized.");
        statusText.textContent = "MediaPipe sẵn sàng. Tải dữ liệu mẫu...";
        loadTrainingData();
    } catch (error) {
        console.error("Failed to initialize MediaPipe Hands:", error);
        statusText.textContent = "Lỗi: Không thể khởi tạo MediaPipe.";
        alert("Lỗi tải thư viện MediaPipe.");
        startRecognitionButton.disabled = true;
    }
}

// --- 2. Initialize Camera (Identical to learn.js, adjusted status message) ---
async function initializeCamera() {
    console.log("Initializing camera...");
    statusText.textContent = 'Đang khởi tạo webcam...';
     if (!videoElement || typeof Camera === 'undefined') {
         console.error("Video element or Camera library missing!");
         statusText.textContent = 'Lỗi: Thiếu thành phần.'; return false;
        }

    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (!mediaPipeHands || !recognitionActive) return; // Only process if active
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                try { await mediaPipeHands.send({ image: videoElement }); }
                catch (sendError) { console.error("Error sending frame:", sendError); }
            }
        },
        width: 480, height: 360
    });

    try {
        await camera.start();
        console.log("camera.start() successful.");
        statusText.textContent = 'Webcam đang chạy. Bắt đầu nhận diện...'; // Changed message
        return true;
    } catch (err) {
        console.error("Failed to start camera:", err);
        let userMessage = `Lỗi bật webcam: ${err.name}.`;
         if (err.name === "NotAllowedError") userMessage = "Lỗi: Cần cấp quyền camera.";
         else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") userMessage = "Lỗi: Không tìm thấy webcam.";
         else if (err.name === "NotReadableError" || err.name === "TrackStartError") userMessage = "Lỗi: Webcam có thể đang được dùng.";
        statusText.textContent = userMessage;
        alert(userMessage);
        recognitionActive = false; // Reset state on error
        startRecognitionButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bắt đầu'
        startRecognitionButton.disabled = (trainingData.length === 0);
        return false;
    }
}

// --- 3. Extract Distance Features (Identical to learn.js) ---
function extractDistanceFeatures(landmarks) {
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

// --- 4. KNN Functions (Identical to learn.js) ---
function euclideanDistance(arr1, arr2) {
     if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
     let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
     return Math.sqrt(sum);
}
function predictKNN(currentFeatures, k) {
     if (trainingData.length < k || !currentFeatures) return trainingData.length === 0 ? "No Data" : "Need Data";
     const distances = trainingData.map(sample => ({ label: sample.label, distance: euclideanDistance(sample.features, currentFeatures) })).filter(item => isFinite(item.distance));
     if (distances.length === 0) return "Dist Err";
     distances.sort((a, b) => a.distance - b.distance);
     const neighbors = distances.slice(0, k);
     if (neighbors.length === 0) return "No Nbrs";
     const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
     let maxCount = 0; let predictedLabel = "?";
     for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
     return predictedLabel;
}

// --- 5. Process MediaPipe Results (Core Logic Change) ---
function onHandResults(results) {
    // Drawing part (Identical to learn.js)
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

    // Recognition part
    currentLandmarks = null;
    let prediction = "---";
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        currentLandmarks = results.multiHandLandmarks[0];
        const features = extractDistanceFeatures(currentLandmarks);
        prediction = features ? predictKNN(features, K_NEIGHBORS) : "FE Err";
    } else {
        prediction = "---";
    }

    // Update real-time recognized character
    recognizedCharText.textContent = prediction;

    // --- Sign-to-Text Hold Logic ---
    if (!recognitionActive) {
        holdIndicatorElement.textContent = ''; // Clear indicator when not active
        return; // Don't process holds if not active
    }

    // Check if the prediction is a potentially valid character for holding
    const isPotentiallyValidHold = VALID_CHARS.includes(prediction) || prediction === BACKSPACE_CHAR;

    if (isPotentiallyValidHold && prediction === heldChar) {
        // --- Character is being held ---
        const holdDuration = Date.now() - holdStartTime;
        const remainingTime = Math.max(0, HOLD_DURATION_MS - holdDuration);

        if (holdDuration >= HOLD_DURATION_MS && !isProcessingHold) {
            // --- Hold duration met ---
            isProcessingHold = true; // Mark as processed for this hold instance
            holdIndicatorElement.textContent = `Đã nhận: ${heldChar}`;
            console.log(`Character '${heldChar}' held for ${HOLD_DURATION_MS}ms. Processing.`);

            if (heldChar === BACKSPACE_CHAR) {
                // --- Process Backspace ---
                if (!isBackspaceTriggeredOnHold && currentText.length > 0) {
                    console.log("Executing backspace.");
                    currentText = currentText.slice(0, -1);
                    updateOutputText(); // Update UI immediately
                    isBackspaceTriggeredOnHold = true; // Prevent repeated backspace for THIS hold
                } else {
                    console.log("Backspace ignored (already triggered for this hold or text empty).");
                }
            } else if (VALID_CHARS.includes(heldChar)) {
                // --- Process Regular Character ---
                console.log(`Adding character: ${heldChar}`);
                if (heldChar == SPACE_CHAR) {
                    currentText += SPACE_SIZE
                } else {
                    currentText += heldChar;
                }
                updateOutputText(); // Update UI immediately
                // Reset hold immediately after adding to prevent repeats
                heldChar = null;
                holdStartTime = 0;
                // Note: No need to reset isProcessingHold here, it resets when the sign changes
            }
        } else if (!isProcessingHold) {
            // --- Still holding, update indicator ---
            holdIndicatorElement.textContent = `Giữ '${heldChar}' (${(remainingTime / 1000).toFixed(1)}s)...`;
        }
    } else {
        // --- Sign changed or is invalid/uncertain ---
        // Reset hold state ONLY if the new prediction is potentially valid or clear indicator
        if (isPotentiallyValidHold || prediction === "---" || prediction === "No Hand") {
             if (heldChar !== null) { // Only log/reset if there WAS a character being held
                  console.log(`Sign changed from ${heldChar} to ${prediction}. Resetting hold.`);
             }
            heldChar = prediction; // Start tracking the new potentially valid char (or null if invalid)
            holdStartTime = Date.now();
            isProcessingHold = false; // Allow processing for the new hold
            isBackspaceTriggeredOnHold = false; // Reset backspace flag when sign changes
            holdIndicatorElement.textContent = ''; // Clear indicator until hold starts meaningfully
        } else {
            // If prediction is "FE Err", "?", "No Data", etc., don't reset the hold immediately
            // Keep tracking the last valid char held, clear indicator
             holdIndicatorElement.textContent = '';
        }


    }
}



// --- 6. Load Training Data (Identical to learn.js) ---
function loadTrainingData() {
    console.log("Loading training data...");
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    let loadedCount = 0;
    trainingData = [];
    if (data) { try {
        const parsedData = JSON.parse(data);
        if (Array.isArray(parsedData)) {
             trainingData = parsedData.filter(item => item?.features?.length > 0 && typeof item.label === 'string');
             loadedCount = trainingData.length;
        }
    } catch(e) { console.error("Data parse error:", e); localStorage.removeItem(LOCAL_STORAGE_KEY); } }
    console.log(`Loaded ${loadedCount} samples.`);
    if (loadedCount === 0) {
        statusText.textContent = "Cảnh báo: Không có data.";
        alert("Không tìm thấy dữ liệu huấn luyện ASL.");
        startRecognitionButton.disabled = true;
        return false;
    } else {
        statusText.textContent = `Sẵn sàng (${loadedCount} mẫu).`;
        startRecognitionButton.disabled = false;
        return true;
    }
}

// --- 7. UI Update Function ---
function updateOutputText() {
    if (outputTextElement) {
        // console.log(`Updating output text to: "${currentText}"`); // Can be noisy
        outputTextElement.textContent = currentText;
    } else {
        console.error("Output text element #output-text not found!");
    }
}

// --- 8. Stop Recognition Function (Adapted from learn.js) ---
function stopRecognition() {
     console.log("Stopping recognition...");
     if (recognitionActive) { // Use correct variable name
        recognitionActive = false;
        if (camera?.stop) { // Use optional chaining
            try { camera.stop(); console.log("Camera stopped."); }
            catch (stopError) { console.error("Error stopping camera:", stopError); }
        }
        // Reset UI and State
        startRecognitionButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bắt đầu' // Reset button text
        statusText.textContent = "Đã dừng nhận diện.";
        recognizedCharText.textContent = "---";
        holdIndicatorElement.textContent = ""; // Clear hold indicator
        currentLandmarks = null;
        // Reset hold state completely
        heldChar = null;
        holdStartTime = 0;
        isProcessingHold = false;
        isBackspaceTriggeredOnHold = false;

        startRecognitionButton.disabled = (trainingData.length === 0); // Re-enable based on data
     } else {
         console.log("Recognition was not active.");
     }
}

// --- 9. Event Listeners (Adapted from learn.js, removing learning buttons) ---
startRecognitionButton.onclick = async () => {
    console.log("Start/Stop Recognition button clicked. Active:", recognitionActive);

    if (!recognitionActive) {
        // --- Start Recognition ---
        if (!loadTrainingData()) { // Check data again on click
             alert("Không thể bắt đầu: Thiếu dữ liệu huấn luyện.");
             return;
        }

        startRecognitionButton.disabled = true;
        startRecognitionButton.textContent = "Đang bật...";

        const cameraStarted = await initializeCamera();

        if (cameraStarted) {
            recognitionActive = true;
            startRecognitionButton.innerHTML = '<i class="fa-solid fa-stop" style="margin-right: 10px;"></i>Dừng';
            startRecognitionButton.disabled = false;
            // Reset state for a new session
            currentText = "";
            heldChar = null;
            holdStartTime = 0;
            isProcessingHold = false;
            isBackspaceTriggeredOnHold = false;
            updateOutputText(); // Clear output display
            statusText.textContent = 'Đang nhận diện...'; // Update status
            console.log("Recognition started.");
        } else {
            // Error handled in initializeCamera, ensure button state is correct
            recognitionActive = false;
            startRecognitionButton.innerHTML = '<i class="fa-solid fa-play" style="margin-right: 10px;"></i>Bắt đầu';
            startRecognitionButton.disabled = (trainingData.length === 0);
        }
    } else {
        // --- Stop Recognition ---
        stopRecognition();
    }
};

clearTextButton.onclick = () => {
     console.log("Clearing text.");
     currentText = "";
     heldChar = null; // Reset hold as well
     holdStartTime = 0;
     isProcessingHold = false;
     isBackspaceTriggeredOnHold = false;
     updateOutputText(); // Update UI immediately
     holdIndicatorElement.textContent = ""; // Clear indicator
};


// --- 10. Initialization (Adapted from learn.js) ---
function main() {
    console.log("Sign-to-Text (Hold Method) Main function started.");
    initializeMediaPipeHands(); // Load MP and data
    updateOutputText(); // Set initial empty text state
    // Ensure button disabled state correct based on initial data load
    if (trainingData.length === 0) {
        startRecognitionButton.disabled = true;
    }
    console.log("Initialization complete. Waiting for user action.");
}

function toggleInstructions() {
    const instructionBox = document.querySelector('.instruction-box');
    instructionBox.classList.toggle('collapsed');
}

main();

// --- END OF FILE public/sign-to-text-hold.js ---