document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('mp_input_video');
    const canvasElement = document.getElementById('mp_output_canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusElement = document.getElementById('mp_status');

    window.mediaPipeMenjaActive = false; // Flag to disable native mouse/touch

    // Basic check for Menja's core game variables
    if (typeof window.pointerScreen === 'undefined' || typeof window.pointerIsDown === 'undefined') {
        statusElement.textContent = "Lỗi: Biến game (pointerScreen/pointerIsDown) không được tìm thấy. Đảm bảo style.js được tải trước.";
        console.error("Menja game's pointerScreen or pointerIsDown not found on window object.");
        return;
    }
    // Check for MediaPipe libraries
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined' || 
        typeof drawConnectors === 'undefined' || typeof HAND_CONNECTIONS === 'undefined') {
        statusElement.textContent = "Lỗi: Thiếu thư viện MediaPipe. Kiểm tra các thẻ script trong HTML.";
        console.error("MediaPipe libraries not found on window object.");
        return;
    }


    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // 0 for performance
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    hands.onResults(onResultsMenjaControls);

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
                 try {
                    await hands.send({ image: videoElement });
                } catch (e) {
                    console.error("Error sending frame to Hands:", e);
                }
            }
        },
        width: 320, 
        height: 240,
    });

    statusElement.textContent = "Đang khởi tạo Camera MediaPipe...";
    camera.start()
        .then(() => {
            window.mediaPipeMenjaActive = true; // Hand control takes over
            statusElement.textContent = "Đưa tay vào để điều khiển!";
            console.log("MediaPipe Camera started for Menja controls. Hand control is active.");

            // If Menja's main game loop hasn't started yet, try to start it.
            // This handles cases where this script's DOMContentLoaded might run after Menja's.
            if (typeof setupMenjaCanvases === 'function' && !window.menjaGameLoopStarted) {
                console.log("Starting Menja game loop from mediapipe-menja-controls.js after camera start.");
                setupMenjaCanvases(); // This function is from Menja's style.js
                window.menjaGameLoopStarted = true;
            }
        })
        .catch(err => {
            statusElement.textContent = "Lỗi Camera MediaPipe! Game sẽ dùng chuột/chạm.";
            console.error("MediaPipe Camera Error:", err);
            window.mediaPipeMenjaActive = false; // Fallback to mouse/touch
        });

    let lastKnownHandX = window.innerWidth / 2;
    let lastKnownHandY = window.innerHeight / 2;
    const SMOOTHING_FACTOR = 0.3; // 0 = no smoothing, 1 = no movement. Range: 0.1 to 0.5 is usually good.

    function onResultsMenjaControls(results) {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.translate(canvasElement.width, 0); 
        canvasCtx.scale(-1, 1); // Mirror view for the preview canvas
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', radius: 3 });

            const controlPoint = landmarks[8]; // Index finger tip

            if (controlPoint && window.mediaPipeMenjaActive) {
                // controlPoint.x is from 0 (camera's right) to 1 (camera's left) due to canvas flip
                // To map to screen: if hand moves right (camera view), x decreases.
                // We want pointerScreen.x to increase. So, (1 - controlPoint.x)
                let targetX = (1 - controlPoint.x) * window.innerWidth;
                let targetY = controlPoint.y * window.innerHeight;

                // Apply smoothing
                lastKnownHandX = SMOOTHING_FACTOR * targetX + (1 - SMOOTHING_FACTOR) * lastKnownHandX;
                lastKnownHandY = SMOOTHING_FACTOR * targetY + (1 - SMOOTHING_FACTOR) * lastKnownHandY;
                
                window.pointerScreen.x = Math.round(lastKnownHandX);
                window.pointerScreen.y = Math.round(lastKnownHandY);
                
                if (!window.pointerIsDown) {
                    window.pointerIsDown = true;
                }
                statusElement.style.display = 'none'; 
            } else if (window.mediaPipeMenjaActive) {
                if (window.pointerIsDown) {
                    window.pointerIsDown = false;
                }
                statusElement.style.display = 'block';
                statusElement.textContent = "Điểm điều khiển không rõ.";
            }
        } else if (window.mediaPipeMenjaActive) {
            if (window.pointerIsDown) {
                window.pointerIsDown = false;
            }
            statusElement.style.display = 'block';
            statusElement.textContent = "Không thấy tay. Đưa tay vào.";
        }
        canvasCtx.restore();
    }
});