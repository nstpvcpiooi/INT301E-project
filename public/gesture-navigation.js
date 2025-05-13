document.addEventListener('DOMContentLoaded', () => {
    const gestureVideoElement = document.getElementById('gesture_input_video');
    const gestureCanvasElement = document.getElementById('gesture_output_canvas');
    const gestureCanvasCtx = gestureCanvasElement.getContext('2d');
    const gestureStatusText = document.getElementById('gesture-status');
    const recognizedGestureNavText = document.getElementById('recognized-gesture-nav');
    const toggleGestureNavButton = document.getElementById('toggle-gesture-nav');
    const HAND_CONNECTIONS = window.HAND_CONNECTIONS;
    let mediaPipeHands = null;
    let gestureCamera = null;
    let gestureRecognizing = false;
    let lastGesturePredictionTime = 0;
    const GESTURE_PREDICTION_INTERVAL = 500;
    const ACTION_DEBOUNCE_TIME = 1500;
    let lastActionTime = 0;

    // --- KNN and Data ---
    // ***** MODIFICATION: Use the main data key *****
    const MAIN_DATA_KEY = 'text'; // This should match the LOCAL_STORAGE_KEY in ori.js etc.
    let navTrainingData = []; // This will store ONLY 'A' and 'B' samples after filtering
    const K_NEIGHBORS_NAV = 3; // Can be adjusted

    // Gestures for navigation
    const NAV_GESTURES_MAP = {
        'A': 'NEXT',
        'B': 'PREV'
    };
    const TARGET_GESTURES_FOR_NAV = Object.keys(NAV_GESTURES_MAP); // ['A', 'B']

    function initializeMediaPipeHandsNav() {
        mediaPipeHands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        mediaPipeHands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });
        mediaPipeHands.onResults(onHandResultsNav);
    }

    async function initializeGestureCamera() {
        // ... (same as before)
        if (gestureCamera) {
            if (!gestureRecognizing) {
                try { await gestureCamera.start(); } catch(e) { console.error("Error restarting gesture cam", e); return false;}
            }
            return true;
        }
        gestureStatusText.textContent = 'Đang khởi tạo camera cử chỉ...';
        gestureCamera = new Camera(gestureVideoElement, {
            onFrame: async () => {
                if (gestureVideoElement.readyState >= HTMLMediaElement.HAVE_METADATA && gestureVideoElement.videoWidth > 0 && mediaPipeHands) {
                    try { await mediaPipeHands.send({ image: gestureVideoElement }); }
                    catch (e) { console.error("Error sending frame to MP Hands", e); }
                }
            },
            width: 320,
            height: 240
        });
        try {
            await gestureCamera.start();
            gestureStatusText.textContent = 'Camera cử chỉ đã bật. Thực hiện cử chỉ A hoặc B.';
            return true;
        } catch (err) {
            console.error("Lỗi camera cử chỉ: ", err);
            gestureStatusText.textContent = 'Lỗi bật camera cử chỉ.';
            return false;
        }
    }

    function extractDistanceFeaturesNav(landmarks) {
        // ... (same as before, ensure this is consistent with your ori.js feature extraction)
        if (!landmarks || landmarks.length !== 21) return null;
        const features = [];
        const wrist = landmarks[0];
        const relativeLandmarks = landmarks.map(lm => ({
            x: lm.x - wrist.x, y: lm.y - wrist.y, z: (lm.z || 0) - (wrist.z || 0)
        }));
        const refPoint = relativeLandmarks[9];
        let handScale = Math.sqrt(refPoint.x ** 2 + refPoint.y ** 2 + refPoint.z ** 2);
        if (handScale < 0.001) handScale = 0.1;

        const PAIRS = [
            [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], [4, 8], [8, 12], [12, 16], [16, 20],
            [5, 8], [9, 12], [13, 16], [17, 20], [2, 4], [5, 4], [9, 4], [13, 4], [17, 4]
        ];
        for (const pair of PAIRS) {
            const p1 = relativeLandmarks[pair[0]];
            const p2 = relativeLandmarks[pair[1]];
            if (!p1 || !p2) { features.push(0); continue; }
            const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2);
            features.push(dist / handScale);
        }
        return features;
    }

    function euclideanDistance(arr1, arr2) {
        // ... (same as before)
        if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
        let sum = 0;
        for (let i = 0; i < arr1.length; i++) sum += (arr1[i] - arr2[i]) ** 2;
        return Math.sqrt(sum);
    }

    function predictKNNNav(currentFeatures, k) {
        // ... (same as before, but uses navTrainingData)
        if (navTrainingData.length < k || !currentFeatures) {
            return navTrainingData.length === 0 ? "Chưa có dữ liệu A/B" : "Cần thêm mẫu A/B";
        }
        const distances = navTrainingData.map(sample => ({
            label: sample.label,
            distance: euclideanDistance(sample.features, currentFeatures)
        })).filter(item => isFinite(item.distance));

        if(distances.length === 0) return "Lỗi khoảng cách";
        distances.sort((a, b) => a.distance - b.distance);
        const neighbors = distances.slice(0, k);

        if(neighbors.length === 0) return "Không tìm thấy láng giềng";
        const labelCounts = {};
        for (const neighbor of neighbors) {
            labelCounts[neighbor.label] = (labelCounts[neighbor.label] || 0) + 1;
        }
        let maxCount = 0;
        let predictedLabel = "Không rõ";
        for (const label in labelCounts) {
            if (TARGET_GESTURES_FOR_NAV.includes(label) && labelCounts[label] > maxCount) { // Only consider A or B
                maxCount = labelCounts[label];
                predictedLabel = label;
            }
        }
        // Optional: Add confidence logic if needed
        return predictedLabel;
    }

    // ***** MODIFIED: Load data from MAIN_DATA_KEY and filter for 'A' and 'B' *****
    function loadNavTrainingData() {
        console.log(`Loading ALL training data from key: ${MAIN_DATA_KEY} for navigation gestures.`);
        const data = localStorage.getItem(MAIN_DATA_KEY);
        navTrainingData = []; // Reset before loading

        if (data) {
            try {
                const allLoadedData = JSON.parse(data);
                if (Array.isArray(allLoadedData)) {
                    // Filter for 'A' and 'B' samples ONLY
                    navTrainingData = allLoadedData.filter(sample =>
                        sample && TARGET_GESTURES_FOR_NAV.includes(sample.label) &&
                        Array.isArray(sample.features) && sample.features.length > 0
                    );
                    console.log(`Filtered ${navTrainingData.length} samples for 'A' and 'B' for navigation.`);
                } else {
                    console.warn(`Data in ${MAIN_DATA_KEY} is not an array.`);
                }
            } catch(e) {
                console.error(`Error parsing data from ${MAIN_DATA_KEY}:`, e);
                navTrainingData = []; // Ensure it's an empty array on error
            }
        }

        if (navTrainingData.filter(s => s.label === 'A').length < K_NEIGHBORS_NAV ||
            navTrainingData.filter(s => s.label === 'B').length < K_NEIGHBORS_NAV) {
            const message = "Cảnh báo: Không đủ dữ liệu huấn luyện cho cử chỉ 'A' hoặc 'B' từ bộ dữ liệu chính. Điều khiển cử chỉ có thể không chính xác.";
            console.warn(message);
            gestureStatusText.textContent = message;
            // Don't disable the button, let user try anyway
        } else {
            gestureStatusText.textContent = "Dữ liệu cử chỉ A/B sẵn sàng.";
        }
    }

    // In public/gesture-navigation.js

// Make sure these are available in the scope, typically defined outside this function
// const gestureCanvasElement = document.getElementById('gesture_output_canvas');
// const gestureCanvasCtx = gestureCanvasElement.getContext('2d');
// const HAND_CONNECTIONS = window.HAND_CONNECTIONS; // From MediaPipe

function onHandResultsNav(results) {
    // Clear the canvas for the new frame
    gestureCanvasCtx.save(); // Save the default state of the canvas
    gestureCanvasCtx.clearRect(0, 0, gestureCanvasElement.width, gestureCanvasElement.height);

    // Draw the camera image onto the canvas.
    // We will flip the canvas to make the image appear mirrored,
    // as MediaPipe's `results.image` is typically the raw, un-mirrored frame.
    if (results.image) {
        gestureCanvasCtx.translate(gestureCanvasElement.width, 0); // Move origin to top-right
        gestureCanvasCtx.scale(-1, 1); // Flip horizontally
        gestureCanvasCtx.drawImage(
            results.image,
            0, 0,
            gestureCanvasElement.width, gestureCanvasElement.height
        );
        // Restore the canvas to its original (un-flipped) orientation
        // before drawing landmarks, so landmark coordinates don't need to be manually flipped.
        gestureCanvasCtx.restore(); // This restore is for the image drawing flip
    } else {
        // If no image, still need to restore if a previous save happened.
        // However, a save always happens at the start of this function.
        // gestureCanvasCtx.restore(); // Not strictly needed here if save is always first
    }


    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0]; // We only care about the first hand

        // Draw the landmarks and connectors.
        // The `drawConnectors` and `drawLandmarks` utilities from MediaPipe
        // expect normalized coordinates (0.0 to 1.0) and the canvas context.
        // They will handle scaling to the canvas dimensions.
        // Since we drew the image mirrored and then restored the canvas,
        // we draw the landmarks using their original coordinates.
        
        // Draw connectors (lines between landmarks)
        if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
            drawConnectors(gestureCanvasCtx, handLandmarks, HAND_CONNECTIONS, {
                color: '#00FF00', // Green lines
                lineWidth: 3
            });
        } else {
            console.warn("drawConnectors or HAND_CONNECTIONS not available. Skipping connector drawing.");
        }

        // Draw landmarks (the "đốt ngón tay" points)
        if (typeof drawLandmarks === 'function') {
            drawLandmarks(gestureCanvasCtx, handLandmarks, {
                color: '#FF0000',       // Red outline for the dots
                fillColor: 'rgba(255, 0, 0, 0.7)', // Semi-transparent red fill for dots
                lineWidth: 1,           // Outline width of the dots
                radius: 4              // Size of the dots
            });
        } else {
            console.warn("drawLandmarks not available. Skipping landmark drawing.");
        }

        // --- Gesture Prediction Logic (remains the same) ---
        const currentTime = Date.now();
        if (gestureRecognizing && (currentTime - lastGesturePredictionTime > GESTURE_PREDICTION_INTERVAL)) {
            lastGesturePredictionTime = currentTime;
            const features = extractDistanceFeaturesNav(handLandmarks); // Ensure this function is defined

            if (features) {
                const prediction = predictKNNNav(features, K_NEIGHBORS_NAV); // Ensure this function is defined
                if(recognizedGestureNavText) recognizedGestureNavText.textContent = prediction;

                if (NAV_GESTURES_MAP && NAV_GESTURES_MAP[prediction] && (currentTime - lastActionTime > ACTION_DEBOUNCE_TIME)) {
                    lastActionTime = currentTime;
                    performNavigationAction(NAV_GESTURES_MAP[prediction]); // Ensure this is defined
                }
            } else {
                if(recognizedGestureNavText) recognizedGestureNavText.textContent = "---";
            }
        }
    } else {
        if (gestureRecognizing && recognizedGestureNavText) recognizedGestureNavText.textContent = "Không thấy tay";
    }
    // The initial gestureCanvasCtx.save() is implicitly restored if we exited early,
    // or explicitly if we drew the image. No extra restore needed at the very end.
}

    function performNavigationAction(action) {
        // ... (same as before)
        if (action === 'NEXT') {
            console.log("Gesture: Next Page");
            if (window.triggerNextPage) window.triggerNextPage();
            else document.getElementById('next-page')?.click();
        } else if (action === 'PREV') {
            console.log("Gesture: Previous Page");
            if (window.triggerPrevPage) window.triggerPrevPage();
            else document.getElementById('prev-page')?.click();
        }
    }

    toggleGestureNavButton.addEventListener('click', async () => {
        if (!mediaPipeHands) { // First time click
            initializeMediaPipeHandsNav();
            loadNavTrainingData(); // Load and filter data
        } else if (!gestureRecognizing) { // Subsequent clicks to start
            loadNavTrainingData(); // Re-load/re-filter in case main data changed
        }


        if (!gestureRecognizing) {
            // Check again if data is sufficient AFTER attempting to load
            if (navTrainingData.filter(s => s.label === 'A').length < K_NEIGHBORS_NAV ||
                navTrainingData.filter(s => s.label === 'B').length < K_NEIGHBORS_NAV) {
                gestureStatusText.textContent = "Thiếu dữ liệu A/B. Vui lòng huấn luyện thêm.";
                 // alert("Không đủ dữ liệu 'A' hoặc 'B' trong bộ nhớ chính. Vui lòng huấn luyện thêm các ký tự này ở trang chính.");
                // return; // Optionally prevent starting if data is insufficient
            }

            const cameraStarted = await initializeGestureCamera();
            if (cameraStarted) {
                gestureRecognizing = true;
                toggleGestureNavButton.textContent = "Dừng Điều Khiển Cử Chỉ";
                gestureStatusText.textContent = "Trạng thái: Đang hoạt động";
                lastActionTime = Date.now();
            }
        } else {
            gestureRecognizing = false;
            if (gestureCamera && gestureCamera.stop) { // Check if camera exists and has stop method
                try { await gestureCamera.stop(); } catch(e) { console.error("Error stopping gesture cam", e); }
            }
            toggleGestureNavButton.textContent = "Bắt Đầu Điều Khiển Cử Chỉ";
            gestureStatusText.textContent = "Trạng thái: Đã dừng";
            recognizedGestureNavText.textContent = "---";
        }
    });

    document.addEventListener("visibilitychange", () => {
        // ... (same as before)
        if (document.hidden && gestureRecognizing && gestureCamera && gestureCamera.stop) {
            try {
                gestureCamera.stop();
                gestureRecognizing = false;
                toggleGestureNavButton.textContent = "Bắt Đầu Điều Khiển Cử Chỉ";
                gestureStatusText.textContent = "Trạng thái: Tạm dừng (tab không hoạt động)";
            } catch(e) { console.error("Error stopping gesture cam on visibility change", e); }
        }
    });
});