let recognizing = false;
let hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

let currentLetterIndex = 0;  // Start with 'A'
const letters = ['A', 'B', 'C', 'D', 'E'];  // Letters to display

// Get DOM elements
const startButton = document.getElementById('start-button');
const currentLetterDisplay = document.getElementById('current-letter');
const recognizedCharDisplay = document.getElementById('recognized-char');
const statusText = document.getElementById('status-text');
const video = document.getElementById('input_video');
const canvas = document.getElementById('output_canvas');

// Function to start camera and hand tracking
startButton.onclick = async () => {
    if (!recognizing) {
        const cameraStarted = await initializeCamera();
        if (cameraStarted) {
            recognizing = true;
            startButton.textContent = "Đang nhận dạng...";
            statusText.textContent = "Giơ tay để nhận diện chữ cái.";
        } else {
            statusText.textContent = "Không thể bật webcam, vui lòng kiểm tra quyền truy cập.";
        }
    }
};

// Initialize camera
async function initializeCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.style.display = "block";  // Show the video
        video.onloadedmetadata = () => {
            hands.send({ image: video });
        };
        return true;
    } catch (err) {
        console.error("Camera error: ", err);
        alert("Không thể truy cập vào camera. Hãy kiểm tra quyền truy cập camera của bạn.");
        return false;
    }
}

// MediaPipe Hand Tracking Callback
hands.onResults((results) => {
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        
        // Extract features from landmarks and predict the ASL gesture (you can use KNN model here)
        const recognizedLetter = recognizeLetterFromLandmarks(handLandmarks);

        // Display recognized letter
        if (recognizedLetter === letters[currentLetterIndex]) {
            recognizedCharDisplay.textContent = `Đúng! Chữ cái: ${recognizedLetter}`;
            setTimeout(nextLetter, 2000);  // Move to next letter after 2 seconds
        } else {
            recognizedCharDisplay.textContent = `Chưa đúng. Cố gắng lại!`;
        }
    }
    canvasCtx.restore();
});

// Function to recognize the letter from hand landmarks (use KNN model or custom logic)
function recognizeLetterFromLandmarks(landmarks) {
    // Your KNN or ML model goes here to predict the letter
    // For now, return a dummy recognized letter based on hand landmarks
    // You will need to implement this logic based on your own model
    return "A";  // Placeholder for recognized letter
}

// Function to move to the next letter
function nextLetter() {
    currentLetterIndex++;
    if (currentLetterIndex >= letters.length) {
        currentLetterIndex = 0; // Loop back to the first letter
    }
    currentLetterDisplay.textContent = letters[currentLetterIndex]; // Update the displayed letter
}
