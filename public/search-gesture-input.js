// public/search-gesture-input.js
document.addEventListener('DOMContentLoaded', () => {
    const searchInputElement = document.getElementById('search-input'); // Target for text input
    const searchButton = document.getElementById('search-button'); // To trigger search

    const videoElement = document.getElementById('search_gesture_input_video');
    const canvasElement = document.getElementById('search_gesture_output_canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusText = document.getElementById('search-gesture-status');
    const recognizedCharText = document.getElementById('search-recognized-char');
    const toggleButton = document.getElementById('toggle-search-gesture-input');
    const holdIndicatorElement = document.getElementById('search-gesture-hold-indicator');
    const videoContainer = document.getElementById('search-gesture-video-container');

    let mediaPipeHands = null;
    let camera = null;
    let recognitionActive = false;
    // currentLandmarks is not strictly needed here if we only use results.multiHandLandmarks[0]

    // --- KNN and Data ---
    let trainingData = [];
    const K_NEIGHBORS_SEARCH = 5; // Can be same as other KNN uses or tuned
    // Use the main alphanumeric data key, assuming it has A-Z, 0-9, and 'D' for backspace
    const DATA_KEY_FOR_SEARCH = 'text'; // Matches LOCAL_STORAGE_KEY in ori.js

    const VALID_SEARCH_CHARS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const BACKSPACE_GESTURE_SEARCH = 'D'; // Assuming 'D' is your backspace gesture

    // Hold logic variables
    let heldCharSearch = null;
    let holdStartTimeSearch = 0;
    const HOLD_DURATION_MS_SEARCH = 1000; // 1 second
    let isProcessingHoldSearch = false;
    let isBackspaceTriggeredOnHoldSearch = false;

    // --- MediaPipe and Camera Initialization (similar to your other files) ---
    function initializeMediaPipeHandsSearch() {
        statusText.textContent = "Đang tải MediaPipe (tìm kiếm)...";
        mediaPipeHands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        mediaPipeHands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        mediaPipeHands.onResults(onHandResultsSearch);
        loadTrainingDataSearch(); // Load data after MP is ready
    }

    async function initializeCameraSearch() {
        statusText.textContent = 'Đang khởi tạo camera (tìm kiếm)...';
        if (!videoElement || typeof Camera === 'undefined') {
            statusText.textContent = 'Lỗi: Thiếu thành phần camera.'; return false;
        }
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (!mediaPipeHands || !recognitionActive) return;
                if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                    try { await mediaPipeHands.send({ image: videoElement }); }
                    catch (e) { console.error("Lỗi gửi frame (tìm kiếm):", e); }
                }
            },
            width: 240, height: 180 // Smaller video size
        });
        try {
            await camera.start();
            videoContainer.style.display = 'block';
            statusText.textContent = 'Camera sẵn sàng. Thực hiện thủ ngữ.';
            return true;
        } catch (err) {
            console.error("Lỗi camera (tìm kiếm):", err);
            statusText.textContent = `Lỗi camera: ${err.name}.`;
            videoContainer.style.display = 'none';
            return false;
        }
    }

    // --- Feature Extraction & KNN (should be identical to your other modules) ---
    function extractDistanceFeaturesSearch(landmarks) {
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

    function euclideanDistanceSearch(arr1, arr2) {
        if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
        let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += (arr1[i] - arr2[i]) ** 2; }
        return Math.sqrt(sum);
    }

    function predictKNNSearch(currentFeatures, k) {
        if (trainingData.length < k || !currentFeatures) return trainingData.length === 0 ? "Chưa có data" : "Cần data";
        const distances = trainingData.map(sample => ({ label: sample.label, distance: euclideanDistanceSearch(sample.features, currentFeatures) })).filter(item => isFinite(item.distance));
        if (distances.length === 0) return "Lỗi khoảng cách";
        distances.sort((a, b) => a.distance - b.distance);
        const neighbors = distances.slice(0, k);
        if (neighbors.length === 0) return "Không láng giềng";
        const labelCounts = {}; neighbors.forEach(n => { labelCounts[n.label] = (labelCounts[n.label] || 0) + 1; });
        let maxCount = 0; let predictedLabel = "?";
        for (const label in labelCounts) { if (labelCounts[label] > maxCount) { maxCount = labelCounts[label]; predictedLabel = label; } }
        return predictedLabel;
    }

    // --- Load Training Data ---
    function loadTrainingDataSearch() {
        const data = localStorage.getItem(DATA_KEY_FOR_SEARCH);
        trainingData = [];
        let loadedCount = 0;
        if (data) {
            try {
                const parsedData = JSON.parse(data);
                if (Array.isArray(parsedData)) {
                    trainingData = parsedData.filter(item => item?.features?.length > 0 && typeof item.label === 'string');
                    loadedCount = trainingData.length;
                }
            } catch (e) { console.error("Lỗi parse data tìm kiếm:", e); }
        }
        if (loadedCount === 0) {
            statusText.textContent = "Cảnh báo: Không có dữ liệu huấn luyện chữ/số.";
            toggleButton.disabled = true;
        } else {
            statusText.textContent = `Sẵn sàng (${loadedCount} mẫu).`;
            toggleButton.disabled = false;
        }
    }

    // --- Hand Results Processing ---
    function onHandResultsSearch(results) {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        if (results.image) {
            canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.restore();
        }
        
        let prediction = "---";
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const handLandmarks = results.multiHandLandmarks[0];
            if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') { // Draw mirrored
                const mirroredLandmarks = handLandmarks.map(lm => ({
                    x: canvasElement.width - (lm.x * canvasElement.width),
                    y: lm.y * canvasElement.height,
                    z: lm.z
                }));
                drawConnectors(canvasCtx, mirroredLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                drawLandmarks(canvasCtx, mirroredLandmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
            }

            const features = extractDistanceFeaturesSearch(handLandmarks);
            prediction = features ? predictKNNSearch(features, K_NEIGHBORS_SEARCH) : "Lỗi FE";
        } else {
            prediction = "Không thấy tay";
        }
        recognizedCharText.textContent = prediction;

        if (!recognitionActive) {
            holdIndicatorElement.textContent = '';
            return;
        }

        const isPotentiallyValidInput = VALID_SEARCH_CHARS.includes(prediction) || prediction === BACKSPACE_GESTURE_SEARCH;

        if (isPotentiallyValidInput && prediction === heldCharSearch) {
            const holdDuration = Date.now() - holdStartTimeSearch;
            const remainingTime = Math.max(0, HOLD_DURATION_MS_SEARCH - holdDuration);

            if (holdDuration >= HOLD_DURATION_MS_SEARCH && !isProcessingHoldSearch) {
                isProcessingHoldSearch = true;
                holdIndicatorElement.textContent = `Đã nhận: ${heldCharSearch}`;

                if (heldCharSearch === BACKSPACE_GESTURE_SEARCH) {
                    if (!isBackspaceTriggeredOnHoldSearch && searchInputElement.value.length > 0) {
                        searchInputElement.value = searchInputElement.value.slice(0, -1);
                        isBackspaceTriggeredOnHoldSearch = true;
                    }
                } else if (VALID_SEARCH_CHARS.includes(heldCharSearch)) {
                    searchInputElement.value += heldCharSearch;
                }
                // Reset hold for next char, even if it's the same one again
                heldCharSearch = null; 
                holdStartTimeSearch = 0;
                // isProcessingHoldSearch will be reset when sign changes
            } else if (!isProcessingHoldSearch) {
                holdIndicatorElement.textContent = `Giữ '${heldCharSearch}' (${(remainingTime/1000).toFixed(1)}s)...`;
            }
        } else {
            if (isPotentiallyValidInput || prediction === "---" || prediction === "Không thấy tay") {
                if (heldCharSearch !== null && heldCharSearch !== prediction) {
                    console.log(`Dấu hiệu tìm kiếm đổi từ ${heldCharSearch} sang ${prediction}. Reset.`);
                }
                heldCharSearch = prediction;
                holdStartTimeSearch = Date.now();
                isProcessingHoldSearch = false;
                isBackspaceTriggeredOnHoldSearch = false;
                holdIndicatorElement.textContent = '';
            } else {
                 holdIndicatorElement.textContent = '';
            }
        }
    }

    // --- Event Listeners ---
    toggleButton.addEventListener('click', async () => {
        if (!mediaPipeHands) {
            initializeMediaPipeHandsSearch(); // Also loads data
        }

        if (!recognitionActive) {
            if(trainingData.length === 0) {
                statusText.textContent = "Cần dữ liệu huấn luyện chữ/số!";
                return;
            }
            toggleButton.textContent = "Đang bật...";
            toggleButton.disabled = true;
            const cameraStarted = await initializeCameraSearch();
            if (cameraStarted) {
                recognitionActive = true;
                toggleButton.textContent = "Tắt Thủ Ngữ Tìm Kiếm";
                statusText.textContent = "Đang nhận diện cho tìm kiếm...";
                searchInputElement.focus(); // Focus on search input
            } else {
                toggleButton.textContent = "Dùng Thủ Ngữ để Tìm";
                statusText.textContent = "Lỗi camera. Không thể bật thủ ngữ.";
            }
            toggleButton.disabled = false;
        } else {
            recognitionActive = false;
            if (camera && camera.stop) camera.stop();
            videoContainer.style.display = 'none';
            toggleButton.textContent = "Dùng Thủ Ngữ để Tìm";
            statusText.textContent = "Đã tắt thủ ngữ tìm kiếm.";
            recognizedCharText.textContent = "---";
            holdIndicatorElement.textContent = "";
        }
    });

    // Initialize
    // Don't initialize mediapipe until button is clicked to save resources
    statusText.textContent = "Sẵn sàng kích hoạt thủ ngữ tìm kiếm.";
    if(localStorage.getItem(DATA_KEY_FOR_SEARCH)) { // Pre-check if data likely exists
        toggleButton.disabled = false;
    } else {
        statusText.textContent = "Không có dữ liệu huấn luyện. Thủ ngữ tìm kiếm bị vô hiệu hóa.";
        toggleButton.disabled = true;
    }
});